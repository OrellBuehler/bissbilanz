import { test, expect } from 'bun:test';
import { ALL_NUTRIENT_KEYS, NUTRIENT_BY_KEY } from '$lib/nutrients';
import { crawlBlv, loadBlvWorkbook, readBlvRows } from './crawl-blv';
import { downloadBlvXlsx, resolveBlvXlsxUrl } from './download';
import { blvRowToFood, NUTRIENT_HEADERS, parseCategories, parseValue } from './normalize-blv';
import { APPLE, MILK_KJ_ONLY, NO_PROTEIN, buildBlvWorkbookBytes } from './test-workbook';
import { newStats } from '../../types';

const sample = async () =>
	loadBlvWorkbook(await buildBlvWorkbookBytes([APPLE, MILK_KJ_ONLY, NO_PROTEIN]));

test('parseValue handles numbers, traces, thresholds and unknowns', () => {
	expect(parseValue(12.5)).toBe(12.5);
	expect(parseValue('Sp.')).toBe(0);
	expect(parseValue('<0.5')).toBe(0);
	expect(parseValue('k.A.')).toBeNull();
	expect(parseValue(null)).toBeNull();
	expect(parseValue(-1)).toBeNull();
	expect(parseValue('3,5')).toBe(3.5);
});

test('parseCategories splits paths and alternatives into unique labels', () => {
	expect(
		parseCategories('Früchte/Fruchtsäfte;Alkoholfreie Getränke/Frucht- und Gemüsesäfte')
	).toEqual(['Früchte', 'Fruchtsäfte', 'Alkoholfreie Getränke', 'Frucht- und Gemüsesäfte']);
	expect(parseCategories(null)).toEqual([]);
});

test('every mapped nutrient header targets a real app nutrient', () => {
	for (const key of Object.keys(NUTRIENT_HEADERS)) expect(ALL_NUTRIENT_KEYS).toContain(key);
});

test('header units match the units the app expects per nutrient', () => {
	for (const [key, header] of Object.entries(NUTRIENT_HEADERS)) {
		const unit = /\((g|mg|µg)\)\s*$/.exec(header)?.[1];
		expect(unit).toBe(NUTRIENT_BY_KEY.get(key)!.unit);
	}
});

test('reads data rows from the sheet that has the BLV header, skipping other sheets', async () => {
	const rows = [...readBlvRows(await sample())];
	expect(rows.map((r) => r.Name)).toEqual(['Apfel, roh', 'Vollmilch', 'Unvollständig']);
});

test('maps an apple row to per-100g values with correct units', async () => {
	const [row] = [...readBlvRows(await sample())];
	const r = blvRowToFood(row);
	expect(r.ok).toBe(true);
	if (!r.ok) return;
	expect(r.food.product).toMatchObject({
		name: 'Apfel, roh',
		language: 'de',
		servingSize: 100,
		servingUnit: 'g',
		calories: 52,
		protein: 0.3,
		carbs: 11.4,
		fat: 0.3,
		fiber: 2.1,
		sugar: 10.4,
		potassium: 120,
		vitaminC: 4.6,
		vitaminB9: 5.1,
		salt: 0,
		zinc: 0,
		omega3: 0.012,
		omega6: 0.05,
		sourceRef: '1001'
	});
	expect(r.food.product.barcode).toBeNull();
	expect(r.food.product.sodium).toBeNull();
	expect(r.food.categories).toEqual(['Früchte', 'Früchte frisch']);
});

test('falls back to kJ for calories when kcal is missing', async () => {
	const rows = [...readBlvRows(await sample())];
	const r = blvRowToFood(rows[1]);
	expect(r.ok && r.food.product.calories).toBeCloseTo(67.88, 1);
	expect(r.ok && r.food.categories).toEqual([
		'Milch und Milchprodukte',
		'Milch',
		'Alkoholfreie Getränke',
		'Milchgetränke'
	]);
});

test('rows without a core macro are dropped with a reason', async () => {
	const rows = [...readBlvRows(await sample())];
	expect(blvRowToFood(rows[2])).toEqual({ ok: false, reason: 'missing-core:protein' });
	expect(blvRowToFood({ Name: ' ' })).toEqual({ ok: false, reason: 'no-name' });
});

test('crawlBlv yields foods, tracks stats and honours the limit', async () => {
	const stats = newStats();
	const out = [];
	for await (const f of crawlBlv(await sample(), { stats, crawledAt: '2026-10-05T00:00:00.000Z' }))
		out.push(f);
	expect(out.length).toBe(2);
	expect(stats).toMatchObject({
		seen: 3,
		emitted: 2,
		dropped: 1,
		dropReasons: { 'missing-core': 1 }
	});
	expect(out[0].product.crawledAt).toBe('2026-10-05T00:00:00.000Z');

	const limited = [];
	for await (const f of crawlBlv(await sample(), { limit: 1 })) limited.push(f);
	expect(limited.length).toBe(1);
});

test('resolveBlvXlsxUrl picks the xlsx link from the downloads page', async () => {
	const page = `<a href="/foo.pdf">x</a><a href="https://naehrwertdaten.ch/wp-content/uploads/2026/07/Schweizer_Nahrwertdatenbank.xlsx">db</a>`;
	const url = await resolveBlvXlsxUrl(async () => new Response(page));
	expect(url).toBe(
		'https://naehrwertdaten.ch/wp-content/uploads/2026/07/Schweizer_Nahrwertdatenbank.xlsx'
	);
	const relative = await resolveBlvXlsxUrl(
		async () => new Response(`<a href='/wp-content/uploads/Schweizer_Nahrwertdatenbank.xlsx'>`)
	);
	expect(relative).toBe(
		'https://naehrwertdaten.ch/wp-content/uploads/Schweizer_Nahrwertdatenbank.xlsx'
	);
});

test('resolveBlvXlsxUrl fails loudly when the link is missing or the page errors', async () => {
	await expect(resolveBlvXlsxUrl(async () => new Response('<html></html>'))).rejects.toThrow(
		'no Schweizer_Nahrwertdatenbank.xlsx link'
	);
	await expect(resolveBlvXlsxUrl(async () => new Response('', { status: 503 }))).rejects.toThrow(
		'503'
	);
});

test('downloadBlvXlsx fetches the resolved link', async () => {
	const seen: string[] = [];
	const bytes = await downloadBlvXlsx(async (url) => {
		seen.push(url);
		return url.endsWith('.xlsx')
			? new Response(new Uint8Array([1, 2, 3]))
			: new Response('<a href="/a/Schweizer_Nahrwertdatenbank.xlsx">');
	});
	expect([...bytes]).toEqual([1, 2, 3]);
	expect(seen[1]).toBe('https://naehrwertdaten.ch/a/Schweizer_Nahrwertdatenbank.xlsx');
});
