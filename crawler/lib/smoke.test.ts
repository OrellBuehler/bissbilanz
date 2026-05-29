import { test, expect } from 'bun:test';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { extractAllNutrients } from '$lib/server/nutrient-extract';
import { datasetProductSchema } from '$lib/server/catalog/dataset-schema';

test('shared $lib modules resolve and work from the crawler package', () => {
	expect(ALL_NUTRIENT_KEYS.length).toBe(43);
	const out = extractAllNutrients({ 'saturated-fat_100g': 1.8, sodium_100g: 0.5 });
	expect(out.saturatedFat).toBe(1.8);
	expect(out.sodium).toBe(500); // g→mg conversion
	const r = datasetProductSchema.safeParse({
		name: 'X',
		servingSize: 100,
		servingUnit: 'g',
		calories: 1,
		protein: 1,
		carbs: 1,
		fat: 1,
		fiber: 1
	});
	expect(r.success).toBe(true);
});
