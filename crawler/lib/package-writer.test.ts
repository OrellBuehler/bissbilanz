import { test, expect, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import sharp from 'sharp';
import yazl from 'yazl';
import { readFoodPackage } from '$lib/server/food-package/archive';
import { foodPackageManifestSchema } from '$lib/server/validation/food-package';
import { PackageWriter, buildReadme } from './package-writer';
import { toPackageFood } from './to-package-food';
import { buildDatasetProduct } from './normalize';

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
	const d = mkdtempSync(join(tmpdir(), 'pkg-writer-'));
	dirs.push(d);
	return d;
};

function food(name: string, extra: Record<string, unknown> = {}) {
	const r = buildDatasetProduct({
		name,
		servingSize: 100,
		servingUnit: 'g',
		calories: 52,
		protein: 0.3,
		carbs: 14,
		fat: 0.2,
		fiber: 2.4,
		nutrients: { sodium: 1, vitaminC: 4.6 },
		barcode: '7612345678900',
		imageUrl: 'https://img.test/a.jpg',
		...extra
	});
	if (!r.ok) throw new Error(r.reason);
	return toPackageFood(r.product, { sourceLabel: 'Test', categories: ['Fruit'] });
}

const webp = () =>
	sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff0000' } })
		.webp()
		.toBuffer();

const info = { sourceName: 'Test source', attribution: 'Test attribution text' };

test('writes a package the app reader accepts, with README, images and refs', async () => {
	const out = join(tmp(), 'test.bissbilanz');
	const w = new PackageWriter(out, { ...info, now: () => new Date('2026-10-05T10:00:00Z') });
	await w.open();
	const image = new Uint8Array(await webp());
	expect(await w.addFood(food('Apfel'), image)).toBe('f1');
	expect(await w.addFood(food('Birne'), null)).toBe('f2');
	const result = await w.close();
	expect(result.foods).toBe(2);
	expect(result.images).toBe(1);
	expect(result.bytes).toBeGreaterThan(0);
	expect(existsSync(`${out}.parts`)).toBe(false);

	const bytes = new Uint8Array(await Bun.file(out).arrayBuffer());
	const pkg = readFoodPackage(bytes);
	expect(foodPackageManifestSchema.safeParse(pkg.manifest).success).toBe(true);
	expect(pkg.manifest.exportedAt).toBe('2026-10-05T10:00:00.000Z');
	expect(pkg.manifest.recipes).toEqual([]);
	const [apfel, birne] = pkg.manifest.foods;
	expect(apfel).toMatchObject({
		ref: 'f1',
		role: 'selected',
		name: 'Apfel',
		calories: 52,
		sodium: 1,
		vitaminC: 4.6,
		labels: ['Test', 'Fruit'],
		image: 'images/f1.webp',
		imageUrl: null
	});
	expect(birne).toMatchObject({ ref: 'f2', image: null, imageUrl: 'https://img.test/a.jpg' });

	const images = pkg.readImages(['images/f1.webp']);
	expect([...images.get('images/f1.webp')!]).toEqual([...image]);

	const files = unzipSync(bytes);
	expect(Object.keys(files).sort()).toEqual([
		'README.txt',
		'bissbilanz-foods.json',
		'images/f1.webp'
	]);
	const readme = strFromU8(files['README.txt']);
	expect(readme).toContain('Source: Test source');
	expect(readme).toContain('Created: 2026-10-05');
	expect(readme).toContain('Foods: 2');
	expect(readme).toContain('Test attribution text');
});

test('buildReadme states source, date, count and attribution', () => {
	const text = buildReadme({ sourceName: 'S', attribution: ' A ', date: '2026-01-02', foods: 7 });
	expect(text).toContain('Source: S');
	expect(text).toContain('Created: 2026-01-02');
	expect(text).toContain('Foods: 7');
	expect(text.trimEnd().endsWith('A')).toBe(true);
});

test('an empty package is still a valid manifest', async () => {
	const out = join(tmp(), 'empty.bissbilanz');
	const w = new PackageWriter(out, info);
	await w.open();
	await w.close();
	const pkg = readFoodPackage(new Uint8Array(await Bun.file(out).arrayBuffer()));
	expect(pkg.manifest.foods).toEqual([]);
});

test('resume keeps spooled foods and continues refs; orphan images are dropped', async () => {
	const out = join(tmp(), 'resume.bissbilanz');
	const first = new PackageWriter(out, info);
	await first.open();
	await first.addFood(food('Apfel'), new Uint8Array(await webp()));
	await first.suspend();
	const second = new PackageWriter(out, info);
	await Bun.write(join(`${out}.parts`, 'images', 'f2.webp'), 'orphan');
	await second.open({ resume: true });
	expect(second.count).toBe(1);
	expect(await second.addFood(food('Birne'), null)).toBe('f2');
	const result = await second.close();
	expect(result).toMatchObject({ foods: 2, images: 1 });
	const files = unzipSync(new Uint8Array(await Bun.file(out).arrayBuffer()));
	expect(Object.keys(files)).not.toContain('images/f2.webp');
});

test('abort removes the spool and leaves no package behind', async () => {
	const dir = tmp();
	const out = join(dir, 'aborted.bissbilanz');
	const w = new PackageWriter(out, info);
	await w.open();
	await w.addFood(food('Apfel'), null);
	await w.abort();
	expect(readdirSync(dir)).toEqual([]);
});

test('yazl switches to ZIP64 past 65535 entries and the archive stays readable', async () => {
	const zip = new yazl.ZipFile();
	for (let i = 0; i < 65_540; i++)
		zip.addBuffer(Buffer.from([1]), `images/f${i}.webp`, { compress: false });
	zip.end();
	const chunks: Uint8Array[] = [];
	for await (const chunk of zip.outputStream as unknown as AsyncIterable<Uint8Array>)
		chunks.push(chunk);
	const bytes = new Uint8Array(Buffer.concat(chunks));
	expect(Buffer.from(bytes).includes(Buffer.from([0x50, 0x4b, 0x06, 0x06]))).toBe(true);
	let entries = 0;
	unzipSync(bytes, { filter: () => (entries++, false) });
	expect(entries).toBe(65_540);
}, 60_000);
