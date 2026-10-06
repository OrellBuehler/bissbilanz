import { mkdirSync, rmSync } from 'node:fs';
import { readDumpLines } from './lib/jsonl-stream';
import { crawlOffDump } from './adapters/off/crawl-off';
import { crawlMigros } from './adapters/migros/crawl-migros';
import { createMigrosClient } from './adapters/migros/client';
import { crawlBlv, loadBlvWorkbook } from './adapters/blv/crawl-blv';
import { downloadBlvXlsx } from './adapters/blv/download';
import { PackageWriter, type PackageResult } from './lib/package-writer';
import { toPackageFood } from './lib/to-package-food';
import { createPoliteClient } from './lib/http';
import { createDiskCache, createImageFetcher, type ImageFetcher } from './lib/images';
import { mapOrdered } from './lib/map-ordered';
import { readCheckpoint, writeCheckpoint } from './lib/checkpoint';
import { newStats, type CrawledFood, type CrawlStats } from './types';

// Food root categories of the Migros taxonomy (breadcrumb[0] of the product detail) with the
// short label put on each food; the app drops labels longer than 3 words on import.
const MIGROS_FOOD_ROOTS: Record<string, string> = {
	'7494730': 'Fleisch & Fisch',
	'7494731': 'Milchprodukte & Eier',
	'7494732': 'Früchte & Gemüse',
	'7494733': 'Brot & Backwaren',
	'7494734': 'Getränke & Kaffee',
	'7494735': 'Pasta & Konserven',
	'7494736': 'Snacks & Süssigkeiten',
	'7494737': 'Wein & Bier',
	'7494738': 'Tiefkühlprodukte',
	'30009000': 'Baby & Kind'
};
const MIGROS_CHECKPOINT = 'data/catalog/.migros-checkpoint.json';
const CACHE_DIR = 'data/catalog/.cache';

type Source = { label: string; name: string; attribution: string };

const OFF_SOURCE: Source = {
	label: 'Open Food Facts',
	name: 'Open Food Facts (Switzerland)',
	attribution: `Product data from Open Food Facts (https://world.openfoodfacts.org), available under the Open Database License (ODbL 1.0); individual contents under the Database Contents License (DbCL 1.0).
Product images are licensed under CC BY-SA 3.0 (see the image pages on openfoodfacts.org for the contributors).
Attribution is required, and derivative databases must be shared under the same license.`
};

const MIGROS_SOURCE: Source = {
	label: 'Migros',
	name: 'Migros (Switzerland)',
	attribution: `Product data and images from migros.ch (Migros-Genossenschafts-Bund).
For private use only. Do not redistribute this package.`
};

const BLV_SOURCE: Source = {
	label: 'BLV',
	name: 'Swiss Food Composition Database (Schweizer Nährwertdatenbank)',
	attribution: `Source: Swiss Food Composition Database, Federal Food Safety and Veterinary Office FSVO (BLV), https://naehrwertdaten.ch.
The data is free to use with source attribution.`
};

type WriteOpts = {
	source: Source;
	items: AsyncIterable<CrawledFood>;
	outPath: string;
	images: boolean;
	keepSpoolOnError?: boolean;
	fetchImage?: ImageFetcher;
	imageConcurrency?: number;
	imageDelayMs?: number;
	resume?: boolean;
	onProgress?: (written: number) => void;
};

export type PackageRun = PackageResult & { imageDrops: Record<string, number> };

async function writePackage(opts: WriteOpts): Promise<PackageRun> {
	const writer = new PackageWriter(opts.outPath, {
		sourceName: opts.source.name,
		attribution: opts.source.attribution
	});
	await writer.open({ resume: opts.resume });
	const imageDrops: Record<string, number> = {};
	const fetchImage: ImageFetcher | null = opts.images
		? (opts.fetchImage ??
			createImageFetcher({
				client: createPoliteClient({
					minDelayMs: opts.imageDelayMs ?? 250,
					cache: createDiskCache(CACHE_DIR)
				})
			}))
		: null;

	const prepared = mapOrdered(
		opts.items,
		async (item) => {
			const food = toPackageFood(item.product, {
				sourceLabel: opts.source.label,
				categories: item.categories
			});
			if (!fetchImage || !food.imageUrl) return { food, image: null };
			const result = await fetchImage(food.imageUrl);
			if (result.ok) return { food, image: result.bytes };
			const key = result.reason.split(':')[0];
			imageDrops[key] = (imageDrops[key] ?? 0) + 1;
			return { food, image: null };
		},
		fetchImage ? (opts.imageConcurrency ?? 4) : 1
	);

	try {
		for await (const { food, image } of prepared) {
			await writer.addFood(food, image);
			if (opts.onProgress && writer.count % 500 === 0) opts.onProgress(writer.count);
		}
		return { ...(await writer.close()), imageDrops };
	} catch (err) {
		if (opts.keepSpoolOnError) await writer.suspend();
		else await writer.abort();
		throw err;
	}
}

function report(tag: string, stats: CrawlStats, run: PackageRun, outPath: string) {
	console.error(
		`[${tag}] done: ${run.foods} foods, ${run.images} images, ${(run.bytes / 1024 / 1024).toFixed(1)} MB → ${outPath}`
	);
	console.error(`[${tag}] drop reasons: ${JSON.stringify(stats.dropReasons)}`);
	console.error(`[${tag}] image drops: ${JSON.stringify(run.imageDrops)}`);
}

export async function runOff(opts: {
	dumpPath: string;
	outPath: string;
	limit?: number;
	images?: boolean;
	fetchImage?: ImageFetcher;
}): Promise<CrawlStats> {
	const stats = newStats();
	const products = crawlOffDump(readDumpLines(opts.dumpPath), {
		stats,
		limit: opts.limit,
		onProgress: (s) =>
			console.error(`[off] seen=${s.seen} emitted=${s.emitted} dropped=${s.dropped}`)
	});
	const items = (async function* () {
		for await (const product of products) yield { product };
	})();
	const run = await writePackage({
		source: OFF_SOURCE,
		items,
		outPath: opts.outPath,
		images: opts.images ?? true,
		fetchImage: opts.fetchImage,
		imageDelayMs: 200,
		imageConcurrency: 4,
		onProgress: (n) => console.error(`[off] written=${n}`)
	});
	report('off', stats, run, opts.outPath);
	return stats;
}

export async function runMigros(opts: {
	outPath?: string;
	checkpointPath?: string;
	limit?: number;
	images?: boolean;
	fetchImage?: ImageFetcher;
}): Promise<CrawlStats> {
	const stats = newStats();
	const checkpointPath = opts.checkpointPath ?? MIGROS_CHECKPOINT;
	const resume = await readCheckpoint<{ category: string; page: number; outPath?: string }>(
		checkpointPath
	);
	const outPath =
		opts.outPath ?? resume?.outPath ?? `data/catalog/migros-${dateStamp()}.bissbilanz`;
	if (resume)
		console.error(`[migros] resuming from category ${resume.category} page ${resume.page}`);

	const client = await createMigrosClient({ roots: MIGROS_FOOD_ROOTS });
	const products = crawlMigros(client, {
		stats,
		limit: opts.limit,
		resume,
		onCheckpoint: (cursor) => writeCheckpoint(checkpointPath, { ...cursor, outPath }),
		onProgress: (s) =>
			console.error(`[migros] seen=${s.seen} emitted=${s.emitted} dropped=${s.dropped}`)
	});
	// The package spool is kept on failure so a resumed crawl continues where the checkpoint is.
	const run = await writePackage({
		source: MIGROS_SOURCE,
		items: products,
		outPath,
		images: opts.images ?? true,
		fetchImage: opts.fetchImage,
		imageDelayMs: 300,
		imageConcurrency: 1,
		resume: !!resume,
		keepSpoolOnError: true
	});
	rmSync(checkpointPath, { force: true });
	report('migros', stats, run, outPath);
	return stats;
}

export async function runBlv(opts: {
	xlsxPath?: string;
	outPath: string;
	limit?: number;
}): Promise<CrawlStats> {
	const stats = newStats();
	const workbook = await loadBlvWorkbook(opts.xlsxPath ?? (await downloadBlvXlsx()));
	const run = await writePackage({
		source: BLV_SOURCE,
		items: crawlBlv(workbook, { stats, limit: opts.limit }),
		outPath: opts.outPath,
		images: false
	});
	report('blv', stats, run, opts.outPath);
	return stats;
}

function dateStamp(): string {
	return new Date().toISOString().slice(0, 10);
}

export function parseArgs(argv: string[]): {
	positional: string[];
	limit?: number;
	images: boolean;
} {
	const positional: string[] = [];
	let limit: number | undefined;
	let images = true;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--no-images') {
			images = false;
			continue;
		}
		const raw =
			arg === '--limit' ? argv[++i] : arg.startsWith('--limit=') ? arg.slice(8) : undefined;
		if (raw !== undefined) {
			limit = Number(raw);
			if (!Number.isInteger(limit) || limit <= 0)
				throw new Error('--limit requires a positive integer');
		} else {
			positional.push(arg);
		}
	}
	return { positional, limit, images };
}

async function main() {
	const [cmd, ...rest] = process.argv.slice(2);
	const { positional, limit, images } = parseArgs(rest);
	mkdirSync('data/catalog', { recursive: true });
	if (cmd === 'off') {
		const dumpPath = positional[0];
		if (!dumpPath)
			throw new Error('Usage: crawl off <dumpPath.jsonl[.gz]> [--limit N] [--no-images]');
		await runOff({
			dumpPath,
			outPath: `data/catalog/off-${dateStamp()}.bissbilanz`,
			limit,
			images
		});
	} else if (cmd === 'migros') {
		await runMigros({ limit, images });
	} else if (cmd === 'blv') {
		await runBlv({
			xlsxPath: positional[0],
			outPath: `data/catalog/blv-${dateStamp()}.bissbilanz`,
			limit
		});
	} else {
		throw new Error(`Unknown command: ${cmd ?? '(none)'}. Expected: off | migros | blv`);
	}
}

if (import.meta.main) {
	main().catch((e) => {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	});
}
