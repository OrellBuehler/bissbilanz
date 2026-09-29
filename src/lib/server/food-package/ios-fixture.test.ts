import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync, strToU8 } from 'fflate';
import { readFoodPackage } from './archive';
import { foodPackageManifestSchema } from '$lib/server/validation/food-package';
import {
	FIXTURE_IMAGE,
	FIXTURE_PATH,
	buildFixtureManifest,
	buildFixturePackage
} from '../../../../scripts/ios/generate-food-package-fixture';

/**
 * The iOS app reads and writes food packages on its own (ZipArchive.swift and
 * FoodPackage*.swift). These tests pin the two halves of that against this
 * server: what it reads must be what an exporter here writes, and what it writes
 * must be readable here.
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

const crc32 = (bytes: Uint8Array) => {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
};

const le16 = (value: number) => [value & 0xff, (value >>> 8) & 0xff];
const le32 = (value: number) => [
	value & 0xff,
	(value >>> 8) & 0xff,
	(value >>> 16) & 0xff,
	(value >>> 24) & 0xff
];

/**
 * A zip laid out byte for byte like `ZipWriter` in ZipArchive.swift: local headers
 * with known sizes and CRC (no data descriptor), the UTF-8 name flag, raw DEFLATE or
 * stored data, then the central directory and end record.
 */
const zipLikeIos = (entries: { name: string; data: Uint8Array; deflate: boolean }[]) => {
	const dosTime = (10 << 11) | (0 << 5) | 0;
	const dosDate = ((2026 - 1980) << 9) | (9 << 5) | 26;
	const body: number[] = [];
	const directory: number[] = [];
	for (const entry of entries) {
		const name = strToU8(entry.name);
		const deflated = entry.deflate ? deflateSync(entry.data) : null;
		const useDeflate = deflated !== null && deflated.length < entry.data.length;
		const payload = useDeflate ? deflated : entry.data;
		const method = useDeflate ? 8 : 0;
		const crc = crc32(entry.data);
		const offset = body.length;
		body.push(
			...le32(0x04034b50),
			...le16(20),
			...le16(0x0800),
			...le16(method),
			...le16(dosTime),
			...le16(dosDate),
			...le32(crc),
			...le32(payload.length),
			...le32(entry.data.length),
			...le16(name.length),
			...le16(0),
			...name,
			...payload
		);
		directory.push(
			...le32(0x02014b50),
			...le16(20),
			...le16(20),
			...le16(0x0800),
			...le16(method),
			...le16(dosTime),
			...le16(dosDate),
			...le32(crc),
			...le32(payload.length),
			...le32(entry.data.length),
			...le16(name.length),
			...le16(0),
			...le16(0),
			...le16(0),
			...le16(0),
			...le32(0),
			...le32(offset),
			...name
		);
	}
	return Uint8Array.from([
		...body,
		...directory,
		...le32(0x06054b50),
		...le16(0),
		...le16(0),
		...le16(entries.length),
		...le16(entries.length),
		...le32(directory.length),
		...le32(body.length),
		...le16(0)
	]);
};

describe('iOS food package fixture', () => {
	it('is accepted by readFoodPackage and matches its description', () => {
		const pkg = readFoodPackage(new Uint8Array(readFileSync(FIXTURE_PATH)));
		expect(pkg.manifest).toEqual(foodPackageManifestSchema.parse(buildFixtureManifest()));
		expect(pkg.manifest.foods.map((food) => food.name)).toEqual([
			'Haferflocken',
			'Milch',
			'Olivenöl',
			'Pasta',
			'Tomaten'
		]);
		expect(pkg.manifest.recipes[0].ingredients).toHaveLength(3);
		const images = pkg.readImages(['images/f4.webp']);
		expect([...images.get('images/f4.webp')!]).toEqual([...FIXTURE_IMAGE]);
	});

	it('is what the generator writes', () => {
		const committed = readFoodPackage(new Uint8Array(readFileSync(FIXTURE_PATH)));
		const rebuilt = readFoodPackage(buildFixturePackage());
		expect(committed.manifest).toEqual(rebuilt.manifest);
	});

	it('reads a zip written the way the iOS ZipWriter lays it out', () => {
		const manifest = buildFixtureManifest();
		const bytes = zipLikeIos([
			{ name: 'README.txt', data: strToU8('Bissbilanz food package\n'.repeat(20)), deflate: true },
			{
				name: 'bissbilanz-foods.json',
				data: strToU8(JSON.stringify(manifest, null, 2)),
				deflate: true
			},
			{ name: 'images/f4.webp', data: FIXTURE_IMAGE, deflate: false }
		]);
		const pkg = readFoodPackage(bytes);
		expect(pkg.manifest).toEqual(foodPackageManifestSchema.parse(manifest));
		const images = pkg.readImages(['images/f4.webp']);
		expect([...images.get('images/f4.webp')!]).toEqual([...FIXTURE_IMAGE]);
	});

	it('accepts every package in the iOS fixtures folder, including one written by the app', () => {
		const folder = dirname(FIXTURE_PATH);
		const names = readdirSync(folder).filter((name) => name.endsWith('.bissbilanz'));
		expect(names).toContain('food-package.bissbilanz');
		for (const name of names) {
			const pkg = readFoodPackage(new Uint8Array(readFileSync(join(folder, name))));
			expect(pkg.manifest.foods.length, name).toBeGreaterThan(0);
			const paths = [
				...pkg.manifest.foods.map((food) => food.image),
				...pkg.manifest.recipes.map((recipe) => recipe.image)
			].filter((path): path is string => !!path);
			expect([...pkg.readImages(paths).keys()].sort(), name).toEqual([...new Set(paths)].sort());
		}
	});
});
