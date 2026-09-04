import { describe, expect, test } from 'vitest';
import { filterFoods, foodMatchTier } from '../../src/lib/components/foods/foodFilters';

const foods = [
	{ id: '1', name: 'Oats', brand: 'Brand A', labels: ['oat', 'cereal'] },
	{ id: '2', name: 'Greek Yogurt', brand: 'Brand B', labels: ['yogurt', 'dairy'] },
	{ id: '3', name: 'Vollkornbrot', brand: 'Coop', labels: ['bread', 'sliced bread'] },
	{ id: '4', name: 'Aufstrich', brand: 'Bread & Co', labels: null },
	{ id: '5', name: 'Toastbrot', brand: null }
];

describe('filterFoods', () => {
	test('filters by name and brand', () => {
		expect(filterFoods(foods, 'yogurt').map((f) => f.id)).toEqual(['2']);
		expect(filterFoods(foods, 'brand a').map((f) => f.id)).toEqual(['1']);
	});

	test('an English query finds a German food through its labels', () => {
		expect(filterFoods(foods, 'Bread').map((f) => f.id)).toEqual(['3', '4']);
	});

	test('the query is normalized like a label: plural, case and accents fold', () => {
		// "breads" is not a substring of the brand "Bread & Co", so only the label hits.
		expect(filterFoods(foods, 'BREADS').map((f) => f.id)).toEqual(['3']);
		expect(filterFoods(foods, 'sliced breads').map((f) => f.id)).toEqual(['3']);
	});

	test('ranks name matches before label matches before brand matches', () => {
		// "brot" is in two names; "bread" is a label on 3 and a brand on 4.
		expect(filterFoods(foods, 'brot').map((f) => f.id)).toEqual(['3', '5']);
		expect(filterFoods(foods, 'bread').map((f) => f.id)).toEqual(['3', '4']);
		expect(foodMatchTier(foods[2], 'bread')).toBe(1);
		expect(foodMatchTier(foods[3], 'bread')).toBe(2);
		expect(foodMatchTier(foods[4], 'bread')).toBe(-1);
	});

	test('an empty query returns everything untouched', () => {
		expect(filterFoods(foods, '  ')).toBe(foods);
	});

	test('keeps input order within a tier', () => {
		const ordered = [...foods].sort((a, b) => a.name.localeCompare(b.name));
		// Two name hits, then every brand containing "br", each tier alphabetical.
		expect(filterFoods(ordered, 'br').map((f) => f.name)).toEqual([
			'Toastbrot',
			'Vollkornbrot',
			'Aufstrich',
			'Greek Yogurt',
			'Oats'
		]);
	});
});
