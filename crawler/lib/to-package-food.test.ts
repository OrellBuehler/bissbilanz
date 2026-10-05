import { test, expect } from 'bun:test';
import { MAX_LABELS_PER_FOOD } from '$lib/labels';
import { packageFoodSchema } from '$lib/server/validation/food-package';
import { buildDatasetProduct } from './normalize';
import { buildLabels, MAX_LABELS_PER_FOOD as CRAWLER_MAX, toPackageFood } from './to-package-food';

const base = {
	name: 'Zweifel Chips',
	brand: 'Zweifel',
	servingSize: 100,
	servingUnit: 'g' as const,
	calories: 515,
	protein: 5.8,
	carbs: 53,
	fat: 30,
	fiber: 5.6,
	nutrients: { saturatedFat: 1.8, sodium: 500 },
	barcode: '7610095131003',
	nutriScore: 'd' as const,
	novaGroup: 4,
	additives: ['en:e330'],
	ingredientsText: 'Kartoffeln',
	imageUrl: 'https://img.test/a.jpg',
	sourceUrl: 'https://off.test/p/1',
	sourceRef: '1',
	crawledAt: '2026-10-05T00:00:00.000Z'
};

const product = (overrides: Record<string, unknown> = {}) => {
	const r = buildDatasetProduct({ ...base, ...overrides });
	if (!r.ok) throw new Error(r.reason);
	return r.product;
};

test('carries per-100g values 1:1 and drops source-only fields', () => {
	const food = toPackageFood(product(), { sourceLabel: 'Open Food Facts' });
	expect(food).toMatchObject({
		name: 'Zweifel Chips',
		brand: 'Zweifel',
		servingSize: 100,
		servingUnit: 'g',
		calories: 515,
		protein: 5.8,
		carbs: 53,
		fat: 30,
		fiber: 5.6,
		saturatedFat: 1.8,
		sodium: 500,
		vitaminC: null,
		barcode: '7610095131003',
		nutriScore: 'd',
		novaGroup: 4,
		additives: ['en:e330'],
		ingredientsText: 'Kartoffeln',
		imageUrl: 'https://img.test/a.jpg',
		labels: ['Open Food Facts']
	});
	for (const dropped of ['sourceUrl', 'sourceRef', 'language', 'crawledAt'])
		expect(food).not.toHaveProperty(dropped);
});

test('the mapped food satisfies the app package food schema', () => {
	const food = toPackageFood(product(), { sourceLabel: 'Migros', categories: ['Snacks'] });
	const parsed = packageFoodSchema.safeParse({ ref: 'f1', role: 'selected', ...food, image: null });
	expect(parsed.success).toBe(true);
});

test('trims name and brand to 200 chars, additives to 100 items, image url to 2048', () => {
	const long = 'x'.repeat(300);
	const p = product({
		name: long,
		brand: long,
		additives: Array.from({ length: 150 }, (_, i) => `e${i}`)
	});
	const food = toPackageFood(
		{ ...p, imageUrl: 'https://i.test/' + 'a'.repeat(2500) },
		{ sourceLabel: 'X' }
	);
	expect(food.name.length).toBe(200);
	expect(food.brand!.length).toBe(200);
	expect(food.additives!.length).toBe(100);
	expect(food.imageUrl!.length).toBe(2048);
});

test('empty additives and missing optional fields become null', () => {
	const food = toPackageFood(
		product({ additives: [], brand: null, barcode: null, nutriScore: null, imageUrl: null }),
		{ sourceLabel: 'BLV' }
	);
	expect(food).toMatchObject({
		additives: null,
		brand: null,
		barcode: null,
		nutriScore: null,
		imageUrl: null
	});
});

test('labels: source first, deduped, trimmed, capped by count and length', () => {
	expect(buildLabels('BLV', ['Früchte', ' Früchte ', '', 'BLV'])).toEqual(['BLV', 'Früchte']);
	const many = buildLabels(
		'S',
		Array.from({ length: 40 }, (_, i) => `c${i}`)
	);
	expect(many.length).toBe(20);
	expect(many[0]).toBe('S');
	expect(buildLabels('S', ['y'.repeat(200)])[1].length).toBe(120);
});

test('crawler label cap mirrors the app constant', () => {
	expect(CRAWLER_MAX).toBe(MAX_LABELS_PER_FOOD);
});
