import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import {
	mkdir,
	open,
	readdir,
	readFile,
	rename,
	rm,
	unlink,
	type FileHandle
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, type PassThrough } from 'node:stream';
import yazl from 'yazl';
import { splitJsonlLines } from './jsonl-stream';
import type { PackageFoodEntry } from './to-package-food';

export const FOOD_PACKAGE_FORMAT = 'bissbilanz.food-package';
export const FOOD_PACKAGE_VERSION = 1;
export const MANIFEST_NAME = 'bissbilanz-foods.json';
export const FOOD_PACKAGE_EXTENSION = '.bissbilanz';
const MAX_FOOD_REFS = 999_999;

export type PackageInfo = {
	sourceName: string;
	attribution: string;
	now?: () => Date;
};

export type PackageResult = { foods: number; images: number; bytes: number };

export function buildReadme(info: {
	sourceName: string;
	attribution: string;
	date: string;
	foods: number;
}): string {
	return `Bissbilanz food package
=======================

Source: ${info.sourceName}
Created: ${info.date}
Foods: ${info.foods}

Import it in Bissbilanz under Foods -> Import -> Food package.

bissbilanz-foods.json   Foods with their nutrition values per 100 g or 100 ml.
images/                 Photos of the foods.

Attribution and license
-----------------------

${info.attribution.trim()}
`;
}

export async function readSpoolBarcodes(outPath: string): Promise<string[]> {
	const spool = Bun.file(join(`${outPath}.parts`, 'foods.ndjson'));
	const barcodes: string[] = [];
	if (!(await spool.exists())) return barcodes;
	for await (const line of splitJsonlLines(spool.stream())) {
		const barcode = (JSON.parse(line) as { barcode?: string | null }).barcode;
		if (barcode) barcodes.push(barcode);
	}
	return barcodes;
}

export class PackageWriter {
	#outPath: string;
	#info: PackageInfo;
	#partsDir: string;
	#foodsPath: string;
	#imagesDir: string;
	#count = 0;
	#images = 0;
	#opened = false;
	#foodsHandle: FileHandle | null = null;

	constructor(outPath: string, info: PackageInfo) {
		this.#outPath = outPath;
		this.#info = info;
		this.#partsDir = `${outPath}.parts`;
		this.#foodsPath = join(this.#partsDir, 'foods.ndjson');
		this.#imagesDir = join(this.#partsDir, 'images');
	}

	get count(): number {
		return this.#count;
	}

	get images(): number {
		return this.#images;
	}

	async open(opts: { resume?: boolean } = {}): Promise<void> {
		await mkdir(dirname(this.#outPath), { recursive: true });
		if (!opts.resume) await rm(this.#partsDir, { recursive: true, force: true });
		await mkdir(this.#imagesDir, { recursive: true });
		const existing = Bun.file(this.#foodsPath);
		if (opts.resume && (await existing.exists())) {
			for await (const _ of splitJsonlLines(existing.stream())) this.#count++;
		} else {
			await Bun.write(this.#foodsPath, '');
		}
		for (const name of await readdir(this.#imagesDir)) {
			const n = Number(/^f(\d+)\.webp$/.exec(name)?.[1] ?? NaN);
			if (!(n >= 1 && n <= this.#count)) await unlink(join(this.#imagesDir, name));
			else this.#images++;
		}
		this.#foodsHandle = await open(this.#foodsPath, 'a');
		this.#opened = true;
	}

	async addFood(food: PackageFoodEntry, image: Uint8Array | null): Promise<string> {
		if (!this.#opened) throw new Error('PackageWriter.open() not called');
		if (this.#count >= MAX_FOOD_REFS) throw new Error('too many foods for one package');
		const ref = `f${this.#count + 1}`;
		let imagePath: string | null = null;
		if (image) {
			await Bun.write(join(this.#imagesDir, `${ref}.webp`), image);
			imagePath = `images/${ref}.webp`;
			this.#images++;
		}
		const entry = {
			ref,
			role: 'selected',
			...food,
			image: imagePath,
			imageUrl: imagePath ? null : food.imageUrl
		};
		await this.#foodsHandle!.write(JSON.stringify(entry) + '\n');
		this.#count++;
		return ref;
	}

	async close(): Promise<PackageResult> {
		if (!this.#opened) throw new Error('PackageWriter.open() not called');
		await this.#foodsHandle?.close();
		this.#foodsHandle = null;
		const now = (this.#info.now ?? (() => new Date()))();
		const foodsPath = this.#foodsPath;

		async function* manifestChunks() {
			yield `{"format":"${FOOD_PACKAGE_FORMAT}","formatVersion":${FOOD_PACKAGE_VERSION},"exportedAt":${JSON.stringify(now.toISOString())},"foods":[`;
			let first = true;
			for await (const line of splitJsonlLines(Bun.file(foodsPath).stream())) {
				yield first ? line : `,${line}`;
				first = false;
			}
			yield '],"recipes":[]}';
		}

		const zip = new yazl.ZipFile();
		const partPath = `${this.#outPath}.part`;
		const output = zip.outputStream as unknown as PassThrough;
		const written = new Promise<void>((resolve, reject) => {
			const out = createWriteStream(partPath);
			out.on('finish', resolve);
			out.on('error', reject);
			zip.on('error', reject);
			output.on('error', reject);
			output.pipe(out);
		});
		const names = (await readdir(this.#imagesDir)).sort();
		try {
			zip.addBuffer(
				Buffer.from(
					buildReadme({
						sourceName: this.#info.sourceName,
						attribution: this.#info.attribution,
						date: now.toISOString().slice(0, 10),
						foods: this.#count
					})
				),
				'README.txt'
			);
			const manifest = Readable.from(manifestChunks(), { objectMode: false });
			const manifestRead = new Promise<void>((resolve, reject) => {
				manifest.on('end', resolve);
				manifest.on('error', reject);
			});
			zip.addReadStream(manifest, MANIFEST_NAME);
			// Entries are added one at a time, so neither the queue nor the output buffer holds the images.
			await manifestRead;
			for (const name of names) {
				const bytes = await readFile(join(this.#imagesDir, name));
				zip.addBuffer(bytes, `images/${name}`, { compress: false });
				if (output.writableLength >= output.writableHighWaterMark) await once(output, 'drain');
			}
			zip.end();
			await written;
		} catch (err) {
			await rm(partPath, { force: true });
			throw err;
		}
		await rename(partPath, this.#outPath);
		await rm(this.#partsDir, { recursive: true, force: true });
		this.#opened = false;
		return {
			foods: this.#count,
			images: names.length,
			bytes: Bun.file(this.#outPath).size
		};
	}

	/** Close file handles but keep the spool, so a later `open({ resume: true })` continues. */
	async suspend(): Promise<void> {
		await this.#foodsHandle?.close();
		this.#foodsHandle = null;
		this.#opened = false;
	}

	async abort(): Promise<void> {
		await this.suspend();
		await rm(this.#partsDir, { recursive: true, force: true });
		this.#opened = false;
	}
}
