import { test, expect, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { readFoodPackage } from '$lib/server/food-package/archive';
import { silentLog } from './lib/log';
import { parseArgs, runBlv, runOff } from './index';
import { APPLE, MILK_KJ_ONLY, buildBlvWorkbookBytes } from './adapters/blv/test-workbook';

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
	const d = mkdtempSync(join(tmpdir(), 'crawler-e2e-'));
	dirs.push(d);
	return d;
};
const dump = join(import.meta.dir, 'fixtures/off-sample.jsonl');
const read = async (path: string) =>
	readFoodPackage(new Uint8Array(await Bun.file(path).arrayBuffer()));

test('runOff writes a package the app reader accepts, keeping the image URL without images', async () => {
	const out = join(tmp(), 'off.bissbilanz');
	const stats = await runOff({ dumpPath: dump, outPath: out, images: false, log: silentLog });
	expect(stats.emitted).toBe(2);

	const pkg = await read(out);
	expect(pkg.manifest.foods.map((f) => f.name)).toEqual(['Zweifel Paprika Chips', 'Bio Apfelsaft']);
	const [chips, juice] = pkg.manifest.foods;
	expect(chips).toMatchObject({
		ref: 'f1',
		brand: 'Zweifel',
		barcode: '7610095131003',
		nutriScore: 'd',
		novaGroup: 4,
		labels: ['Open Food Facts'],
		image: null,
		imageUrl: 'https://images.test/chips.jpg'
	});
	expect(juice.calories).toBeCloseTo(45.89, 1);
});

test('runOff embeds rendered images and records failures without dropping the food', async () => {
	const out = join(tmp(), 'off-images.bissbilanz');
	const webp = new Uint8Array(
		await sharp({ create: { width: 4, height: 4, channels: 3, background: '#00ff00' } })
			.webp()
			.toBuffer()
	);
	const fetched: string[] = [];
	await runOff({
		dumpPath: dump,
		outPath: out,
		log: silentLog,
		fetchImage: async (url) => {
			fetched.push(url);
			return { ok: true, bytes: webp };
		}
	});
	expect(fetched).toEqual(['https://images.test/chips.jpg']);
	const pkg = await read(out);
	expect(pkg.manifest.foods[0]).toMatchObject({ image: 'images/f1.webp', imageUrl: null });
	expect(pkg.manifest.foods[1].image).toBeNull();
	expect([...pkg.readImages(['images/f1.webp']).get('images/f1.webp')!]).toEqual([...webp]);

	const failedOut = join(tmp(), 'off-failed.bissbilanz');
	await runOff({
		dumpPath: dump,
		outPath: failedOut,
		log: silentLog,
		fetchImage: async () => ({ ok: false, reason: 'not-found' })
	});
	const failed = await read(failedOut);
	expect(failed.manifest.foods.length).toBe(2);
	expect(failed.manifest.foods[0]).toMatchObject({
		image: null,
		imageUrl: 'https://images.test/chips.jpg'
	});
});

test('runBlv writes a package from a local xlsx path', async () => {
	const dir = tmp();
	const xlsx = join(dir, 'blv.xlsx');
	writeFileSync(xlsx, await buildBlvWorkbookBytes([APPLE, MILK_KJ_ONLY]));
	const out = join(dir, 'blv.bissbilanz');
	const stats = await runBlv({ xlsxPath: xlsx, outPath: out, log: silentLog });
	expect(stats.emitted).toBe(2);
	const pkg = await read(out);
	expect(pkg.manifest.foods.length).toBe(2);
	expect(pkg.manifest.foods[0]).toMatchObject({
		name: 'Apfel, roh',
		brand: null,
		barcode: null,
		calories: 52,
		labels: ['BLV', 'Früchte', 'Früchte frisch']
	});
});

test('runOff logs a summary with totals and the output path', async () => {
	const out = join(tmp(), 'off-log.bissbilanz');
	const lines: string[] = [];
	await runOff({ dumpPath: dump, outPath: out, images: false, log: (l) => void lines.push(l) });
	const done = lines.find((l) => l.includes('done in'))!;
	expect(done).toContain('2 foods');
	expect(done).toContain(out);
	expect(done).toContain('MB');
});

test('parseArgs reads limit and --no-images', () => {
	expect(parseArgs(['dump.gz', '--limit', '5', '--no-images'])).toEqual({
		positional: ['dump.gz'],
		limit: 5,
		images: false
	});
	expect(parseArgs(['--limit=3'])).toEqual({ positional: [], limit: 3, images: true });
	expect(() => parseArgs(['--limit', '0'])).toThrow('positive integer');
});
