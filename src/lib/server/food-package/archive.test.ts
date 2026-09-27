import { describe, expect, it } from 'vitest';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { readFoodPackage, WRONG_FILE_ACCOUNT_EXPORT } from './archive';
import { MANIFEST_NAME, MAX_IMAGE_ENTRY_BYTES } from './format';

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
