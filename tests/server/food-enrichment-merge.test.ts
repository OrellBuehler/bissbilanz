import { describe, expect, test } from 'vitest';
import { mergeOffProduct, offNutrientScale } from '$lib/server/food-enrichment/merge';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import type { OFFProduct } from '$lib/server/openfoodfacts';

const emptyNutrients = Object.fromEntries(ALL_NUTRIENT_KEYS.map((key) => [key, null]));

const product = (overrides: Partial<OFFProduct> = {}): OFFProduct => ({
	name: 'Product Name',
	brand: 'Product Brand',
	servingSize: 100,
	servingUnit: 'g',
	calories: 500,
	protein: 10,
	carbs: 60,
	fat: 20,
	fiber: 5,
	nutriScore: 'c',
	novaGroup: 3,
	additives: ['en:e330'],
	ingredientsText: 'Oats, sugar',
	imageUrl: 'https://images.openfoodfacts.org/front.jpg',
	categoriesTags: ['en:cereals'],
	barcode: '4000000000000',
	...emptyNutrients,
	sugar: 20,
	sodium: 400,
	...overrides
});

const food = (overrides: Record<string, unknown> = {}) => ({
	name: 'My Oats',
	brand: 'Mine',
	servingSize: 100,
	servingUnit: 'g' as const,
	calories: 380,
	protein: 13,
	carbs: 60,
	fat: 7,
	fiber: 10,
	barcode: '4000000000000',
	isFavorite: true,
	nutriScore: null,
	novaGroup: null,
	additives: null,
	ingredientsText: null,
	imageUrl: null,
	...emptyNutrients,
	...overrides
});

describe('offNutrientScale', () => {
	test.each([
		[100, 'g', 1],
		[30, 'g', 0.3],
		[0.25, 'kg', 2.5],
		[250, 'ml', 2.5],
		[33, 'cl', 3.3],
		[0.5, 'l', 5],
		[1, 'oz', 0.28349523125],
		[1, 'lb', 4.5359237],
		[8, 'fl_oz', 2.365882365]
	] as const)('%s %s scales by %s', (size, unit, expected) => {
		expect(offNutrientScale(size, unit)).toBeCloseTo(expected, 9);
	});

	test.each(['cup', 'tbsp', 'tsp'] as const)('%s is not scaled', (unit) => {
		expect(offNutrientScale(1, unit)).toBeNull();
	});

	test('a non-positive serving is not scaled', () => {
		expect(offNutrientScale(0, 'g')).toBeNull();
	});
});

describe('mergeOffProduct', () => {
	test('never touches identity, serving or core macros', () => {
		const patch = mergeOffProduct(food(), product());
		for (const key of [
			'name',
			'brand',
			'servingSize',
			'servingUnit',
			'calories',
			'protein',
			'carbs',
			'fat',
			'fiber',
			'barcode',
			'isFavorite'
		]) {
			expect(patch).not.toHaveProperty(key);
		}
	});

	test('takes quality data from the product when the food has none', () => {
		expect(mergeOffProduct(food(), product())).toMatchObject({
			nutriScore: 'c',
			novaGroup: 3,
			additives: ['en:e330'],
			ingredientsText: 'Oats, sugar'
		});
	});

	test('Open Food Facts wins for Nutri-Score and NOVA group', () => {
		const patch = mergeOffProduct(food({ nutriScore: 'a', novaGroup: 1 }), product());
		expect(patch.nutriScore).toBe('c');
		expect(patch.novaGroup).toBe(3);
	});

	test('keeps stored scores when the product has none', () => {
		const patch = mergeOffProduct(
			food({ nutriScore: 'a', novaGroup: 1 }),
			product({ nutriScore: null, novaGroup: null })
		);
		expect(patch).not.toHaveProperty('nutriScore');
		expect(patch).not.toHaveProperty('novaGroup');
	});

	test('never replaces ingredients or additives the user entered', () => {
		const patch = mergeOffProduct(
			food({ additives: ['en:e300'], ingredientsText: 'Oats' }),
			product()
		);
		expect(patch).not.toHaveProperty('additives');
		expect(patch).not.toHaveProperty('ingredientsText');
	});

	test('fills blank ingredients and empty additives', () => {
		const patch = mergeOffProduct(food({ additives: [], ingredientsText: ' \n ' }), product());
		expect(patch.additives).toEqual(['en:e330']);
		expect(patch.ingredientsText).toBe('Oats, sugar');
	});

	test('leaves fields alone when the product has nothing for them', () => {
		const patch = mergeOffProduct(food(), product({ additives: [], ingredientsText: '  ' }));
		expect(patch).not.toHaveProperty('additives');
		expect(patch).not.toHaveProperty('ingredientsText');
	});

	test('leaves out fields that already match', () => {
		const stored = food({
			nutriScore: 'c',
			novaGroup: 3,
			additives: ['en:e330'],
			ingredientsText: 'Oats, sugar',
			imageUrl: '/uploads/u/photo.webp',
			sugar: 20,
			sodium: 400
		});
		expect(mergeOffProduct(stored, product())).toEqual({});
	});

	test('takes the product image only when the food has none', () => {
		expect(mergeOffProduct(food(), product()).imageUrl).toBe(
			'https://images.openfoodfacts.org/front.jpg'
		);
		expect(mergeOffProduct(food({ imageUrl: '' }), product()).imageUrl).toBe(
			'https://images.openfoodfacts.org/front.jpg'
		);
		expect(
			mergeOffProduct(food({ imageUrl: '/uploads/u/photo.webp' }), product())
		).not.toHaveProperty('imageUrl');
	});

	test.each([
		'ftp://images.openfoodfacts.org/front.jpg',
		'http://images.openfoodfacts.org/front.jpg',
		'https://cdn.example.org/front.jpg',
		'/uploads/someone-else/photo.webp',
		'not a url'
	])('ignores an image outside the allowed hosts: %s', (imageUrl) => {
		expect(mergeOffProduct(food(), product({ imageUrl }))).not.toHaveProperty('imageUrl');
	});

	test('accepts both Open Food Facts image hosts', () => {
		for (const imageUrl of [
			'https://images.openfoodfacts.org/images/products/1.jpg',
			'https://images.openfoodfacts.net/images/products/1.jpg'
		]) {
			expect(mergeOffProduct(food(), product({ imageUrl })).imageUrl).toBe(imageUrl);
		}
	});

	test('scales per-100 g nutrients to the serving', () => {
		const patch = mergeOffProduct(food({ servingSize: 30 }), product());
		expect(patch.sugar).toBe(6);
		expect(patch.sodium).toBe(120);
	});

	test('scales per-100 ml nutrients to a volume serving', () => {
		const patch = mergeOffProduct(
			food({ servingSize: 33, servingUnit: 'cl' }),
			product({ sugar: 10.6 })
		);
		expect(patch.sugar).toBe(34.98);
	});

	test('scales a kilogram serving through grams', () => {
		expect(mergeOffProduct(food({ servingSize: 1, servingUnit: 'kg' }), product()).sugar).toBe(200);
	});

	test('leaves extended nutrients alone for household measures', () => {
		const patch = mergeOffProduct(food({ servingSize: 1, servingUnit: 'cup' }), product());
		expect(patch).not.toHaveProperty('sugar');
		expect(patch).not.toHaveProperty('sodium');
		expect(patch.nutriScore).toBe('c');
	});

	test('keeps a stored nutrient the product lacks', () => {
		const patch = mergeOffProduct(food({ potassium: 300 }), product());
		expect(patch).not.toHaveProperty('potassium');
	});

	test('never replaces a nutrient the user entered', () => {
		const patch = mergeOffProduct(food({ servingSize: 50, sugar: 3 }), product());
		expect(patch).not.toHaveProperty('sugar');
		expect(patch.sodium).toBe(200);
	});

	test('never writes an Open Food Facts zero over a stored value, and keeps a stored zero', () => {
		const patch = mergeOffProduct(food({ sugar: 4, sodium: 0 }), product({ sugar: 0 }));
		expect(patch).not.toHaveProperty('sugar');
		expect(patch).not.toHaveProperty('sodium');
	});

	test('fills a missing nutrient with an Open Food Facts zero', () => {
		expect(mergeOffProduct(food(), product({ sugar: 0 })).sugar).toBe(0);
	});

	test('skips negative or non-finite product nutrients', () => {
		const patch = mergeOffProduct(
			food(),
			product({ sugar: -1, sodium: Number.NaN, iron: Number.POSITIVE_INFINITY })
		);
		expect(patch).not.toHaveProperty('sugar');
		expect(patch).not.toHaveProperty('sodium');
		expect(patch).not.toHaveProperty('iron');
	});

	test('rounds scaled values to four decimals', () => {
		expect(mergeOffProduct(food({ servingSize: 1, servingUnit: 'oz' }), product()).sugar).toBe(
			5.6699
		);
	});
});
