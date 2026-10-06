import { describe, expect, it } from 'vitest';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { imageBatches, readFoodPackage, WRONG_FILE_ACCOUNT_EXPORT } from './archive';
import {
	MANIFEST_NAME,
	MAX_IMAGE_ENTRY_BYTES,
	MAX_MANIFEST_BYTES,
	MAX_PACKAGE_BYTES,
	MAX_PACKAGE_FOODS,
	MAX_TOTAL_INFLATED_BYTES,
	MAX_ZIP_ENTRIES
} from './format';

const baseFood = {
	ref: 'f1',
	role: 'selected',
	name: 'Oats',
	brand: null,
	servingSize: 100,
	servingUnit: 'g',
	calories: 380,
	protein: 13,
	carbs: 67,
	fat: 7,
	fiber: 10,
	labels: ['oats'],
	image: 'images/f1.webp'
};

const manifest = (overrides: Record<string, unknown> = {}) => ({
	format: 'bissbilanz.food-package',
	formatVersion: 1,
	exportedAt: '2026-09-26T10:00:00.000Z',
	foods: [baseFood],
	recipes: [],
	...overrides
});

const pack = (files: Zippable) => zipSync(files);
const json = (value: unknown) => strToU8(JSON.stringify(value));

const expectError = (fn: () => unknown, message: RegExp | string) =>
	expect(fn).toThrowError(
		expect.objectContaining({ status: 400, message: expect.stringMatching(message) })
	);

describe('readFoodPackage', () => {
	it('reads the manifest and only the requested images', () => {
		const image = new Uint8Array([1, 2, 3]);
		const pkg = readFoodPackage(
			pack({
				[MANIFEST_NAME]: json(manifest()),
				'images/f1.webp': image,
				'images/f2.webp': new Uint8Array([9])
			})
		);
		expect(pkg.manifest.foods[0].name).toBe('Oats');
		expect(pkg.packageHash).toMatch(/^[a-f0-9]{64}$/);
		const images = pkg.readImages(['images/f1.webp']);
		expect([...images.keys()]).toEqual(['images/f1.webp']);
		expect(images.get('images/f1.webp')).toEqual(image);
	});

	it('accepts a manifest inside one top-level folder', () => {
		const pkg = readFoodPackage(
			pack({
				[`share/${MANIFEST_NAME}`]: json(manifest()),
				'share/images/f1.webp': new Uint8Array([7])
			})
		);
		expect(pkg.readImages(['images/f1.webp']).get('images/f1.webp')).toEqual(new Uint8Array([7]));
	});

	it('accepts a bare JSON manifest without images', () => {
		const pkg = readFoodPackage(json(manifest()));
		expect(pkg.manifest.foods).toHaveLength(1);
		expect(pkg.readImages(['images/f1.webp']).size).toBe(0);
	});

	it('hashes identical bytes identically', () => {
		const bytes = pack({ [MANIFEST_NAME]: json(manifest()) });
		expect(readFoodPackage(bytes).packageHash).toBe(readFoodPackage(bytes.slice()).packageHash);
	});

	it('points an account export to the settings import', () => {
		expectError(
			() => readFoodPackage(pack({ 'bissbilanz.json': json({ formatVersion: 1, foods: [] }) })),
			WRONG_FILE_ACCOUNT_EXPORT
		);
		expectError(
			() => readFoodPackage(json({ formatVersion: 1, foods: [] })),
			WRONG_FILE_ACCOUNT_EXPORT
		);
	});

	it('rejects non-package files', () => {
		expectError(() => readFoodPackage(strToU8('name,calories\n')), /Unrecognized/);
		expectError(() => readFoodPackage(pack({ 'other.txt': strToU8('x') })), /bissbilanz-foods/);
		expectError(() => readFoodPackage(new Uint8Array()), /empty/);
	});

	it('rejects a package from a newer format version', () => {
		expectError(() => readFoodPackage(json(manifest({ formatVersion: 99 }))), /newer version/);
	});

	it('rejects an invalid manifest', () => {
		expectError(
			() => readFoodPackage(json(manifest({ foods: [{ ...baseFood, calories: -1 }] }))),
			/Invalid food package/
		);
		expectError(
			() => readFoodPackage(json(manifest({ foods: [baseFood, baseFood] }))),
			/Duplicate ref/
		);
	});

	it('rejects image paths that could escape the images folder', () => {
		for (const image of ['../evil.webp', '/etc/passwd', 'images/../x.webp', 'images/a/b.webp']) {
			expectError(
				() => readFoodPackage(json(manifest({ foods: [{ ...baseFood, image }] }))),
				/Invalid food package/
			);
		}
	});

	it('never reads zip entries the manifest does not name', () => {
		const pkg = readFoodPackage(
			pack({ [MANIFEST_NAME]: json(manifest()), '../../evil.webp': new Uint8Array([1]) })
		);
		expect(pkg.readImages(['../../evil.webp']).size).toBe(0);
	});

	it('skips oversized image entries', () => {
		const big = new Uint8Array(MAX_IMAGE_ENTRY_BYTES + 1);
		const pkg = readFoodPackage(pack({ [MANIFEST_NAME]: json(manifest()), 'images/f1.webp': big }));
		expect(pkg.readImages(['images/f1.webp']).size).toBe(0);
	});

	it('bounds inflation by the declared size even when the header lies', () => {
		const content = new Uint8Array(4096).fill(65);
		const bytes = pack({
			[MANIFEST_NAME]: json(manifest()),
			'images/f1.webp': [content, { level: 9 }]
		});
		// Rewrite the declared uncompressed size of the image in the central
		// directory (signature 0x02014b50, size at offset 24) to 16 bytes.
		const view = new DataView(bytes.buffer);
		for (let offset = 0; offset < bytes.length - 46; offset++) {
			if (view.getUint32(offset, true) !== 0x02014b50) continue;
			const nameLength = view.getUint16(offset + 28, true);
			const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
			if (name === 'images/f1.webp') view.setUint32(offset + 24, 16, true);
		}
		const pkg = readFoodPackage(bytes);
		let images: Map<string, Uint8Array> = new Map();
		try {
			images = pkg.readImages(['images/f1.webp']);
		} catch {
			// fflate may also refuse the entry outright — equally safe.
		}
		expect(images.get('images/f1.webp')?.length ?? 0).toBeLessThanOrEqual(16);
	});
});

describe('big packages', () => {
	it('raises the limits the web import accepts', () => {
		expect(MAX_PACKAGE_FOODS).toBe(25000);
		expect(MAX_PACKAGE_BYTES).toBe(200 * 1024 * 1024);
		expect(MAX_MANIFEST_BYTES).toBe(40 * 1024 * 1024);
		expect(MAX_ZIP_ENTRIES).toBe(25000 + 1000 * 51 + 16);
	});

	it('reads a package with far more foods than the old 5000 cap', () => {
		const foods = Array.from({ length: 12000 }, (_, index) => ({
			...baseFood,
			ref: `f${index + 1}`,
			name: `Food ${index + 1}`,
			image: null
		}));
		const pkg = readFoodPackage(pack({ [MANIFEST_NAME]: json(manifest({ foods })) }));
		expect(pkg.manifest.foods).toHaveLength(12000);
	});

	it('refuses more foods than the cap', () => {
		const foods = Array.from({ length: MAX_PACKAGE_FOODS + 1 }, (_, index) => ({
			...baseFood,
			ref: `f${index + 1}`,
			image: null
		}));
		expectError(() => readFoodPackage(json(manifest({ foods }))), /Invalid food package: foods/);
	});

	it('reads a package with more entries than the old cap, inflating only the asked batch', () => {
		const files: Zippable = { [MANIFEST_NAME]: json(manifest({ foods: [] })) };
		for (let index = 0; index < 7000; index++) files[`images/i${index}.webp`] = new Uint8Array([1]);
		const pkg = readFoodPackage(pack(files));
		const images = pkg.readImages(['images/i0.webp', 'images/i6999.webp']);
		expect([...images.keys()].sort()).toEqual(['images/i0.webp', 'images/i6999.webp']);
	});

	it('reads a zip64 archive written by another tool', () => {
		const bytes = Uint8Array.from(atob(ZIP64_MANIFEST_ONLY), (char) => char.charCodeAt(0));
		const pkg = readFoodPackage(bytes);
		expect(pkg.manifest.foods).toEqual([]);
	});

	it('answers a too-large file with a coded 400 the web can recognise', () => {
		const big = { length: MAX_PACKAGE_BYTES + 1 } as Uint8Array;
		expect(() => readFoodPackage(big)).toThrowError(
			expect.objectContaining({
				status: 400,
				message: 'File must be 200MB or smaller',
				details: { code: ['package_too_large'], maxBytes: [String(MAX_PACKAGE_BYTES)] }
			})
		);
	});

	it('answers a truncated zip64 archive with a clean 400, not a crash', () => {
		const bytes = Uint8Array.from(atob(ZIP64_MANIFEST_ONLY), (char) => char.charCodeAt(0));
		expectError(
			() => readFoodPackage(bytes.subarray(0, bytes.length - 30)),
			/damaged|does not contain/
		);
	});
});

const ZIP64_MANIFEST_ONLY =
	'UEsDBBQAAAAIAAAAIQBnL78VRwAAAFUAAAAVABQAYmlzc2JpbGFuei1mb29kcy5qc29uAQAQAFUAAAAAAAAARwAAAAAAAACrVkrLL8pNLFGyUlBKyiwuTsrMScyr0kvLz0/RLUhMzk5MT1XSUYAqCkstKs7MzwOqNQSL5acUA9nRsUBOUWpyZkEqhFsLAFBLAQIUAxQAAAAIAAAAIQBnL78VRwAAAFUAAAAVAAAAAAAAAAAAAACAAQAAAABiaXNzYmlsYW56LWZvb2RzLmpzb25QSwUGAAAAAAEAAQBDAAAAjgAAAAAA';

describe('imageBatches', () => {
	const sized = (length: number) => ({ length }) as Uint8Array;

	it('reads each slice once when it stays under the cap', () => {
		const calls: string[][] = [];
		const readImages = (paths: string[]) => {
			calls.push(paths);
			return new Map(paths.map((path) => [path, sized(10)]));
		};
		const batches = [...imageBatches(readImages, ['a', 'b', 'c'], 2)];
		expect(calls).toEqual([['a', 'b'], ['c']]);
		expect(batches.map((batch) => batch.paths)).toEqual([['a', 'b'], ['c']]);
	});

	it('re-reads the paths a capped batch left out', () => {
		const calls: string[][] = [];
		const readImages = (paths: string[]) => {
			calls.push(paths);
			const [first] = paths;
			return new Map([[first, sized(MAX_TOTAL_INFLATED_BYTES)]]);
		};
		const batches = [...imageBatches(readImages, ['a', 'b', 'c'], 3)];
		expect(calls).toEqual([['a', 'b', 'c'], ['b', 'c'], ['c']]);
		expect(batches.map((batch) => batch.paths)).toEqual([['a'], ['b'], ['c']]);
	});
});
