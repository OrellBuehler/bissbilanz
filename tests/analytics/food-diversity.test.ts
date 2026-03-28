import { describe, test, expect } from 'vitest';
import { computeFoodDiversity } from '$lib/analytics/food-diversity';

function makeWeek(
	weekOffset: number,
	foods: string[]
): { date: string; foodId: string | null; recipeId: string | null; foodName: string }[] {
	return foods.map((food, i) => ({
		date: `2024-01-${String(1 + weekOffset * 7 + (i % 7)).padStart(2, '0')}`,
		foodId: food,
		recipeId: null,
		foodName: food
	}));
}

describe('computeFoodDiversity', () => {
	test('20 unique foods per week gives high diversity', () => {
		const foods = Array.from({ length: 20 }, (_, i) => `food-${i}`);
		const entries = makeWeek(0, foods);
		const result = computeFoodDiversity(entries);
		expect(result.avgUniqueFoodsPerWeek).toBe(20);
		expect(result.currentWeekUnique).toBe(20);
	});

	test('same 3 foods every day gives low diversity', () => {
		const foods = ['apple', 'rice', 'chicken'];
		const entries = Array.from({ length: 7 }, (_, i) =>
			foods.map((food) => ({
				date: `2024-01-${String(i + 1).padStart(2, '0')}`,
				foodId: food,
				recipeId: null,
				foodName: food
			}))
		).flat();
		const result = computeFoodDiversity(entries);
		expect(result.avgUniqueFoodsPerWeek).toBe(3);
	});

	test('uses foodId when available', () => {
		const entries = [
			{ date: '2024-01-01', foodId: 'id-1', recipeId: null, foodName: 'Apple' },
			{ date: '2024-01-01', foodId: 'id-1', recipeId: null, foodName: 'Different Name' }
		];
		const result = computeFoodDiversity(entries);
		expect(result.currentWeekUnique).toBe(1);
	});

	test('falls back to recipeId when no foodId', () => {
		const entries = [
			{ date: '2024-01-01', foodId: null, recipeId: 'recipe-1', foodName: 'Salad' },
			{ date: '2024-01-02', foodId: null, recipeId: 'recipe-1', foodName: 'Salad' }
		];
		const result = computeFoodDiversity(entries);
		expect(result.currentWeekUnique).toBe(1);
	});

	test('falls back to foodName when no ids', () => {
		const entries = [
			{ date: '2024-01-01', foodId: null, recipeId: null, foodName: 'Oatmeal' },
			{ date: '2024-01-01', foodId: null, recipeId: null, foodName: 'Oatmeal' },
			{ date: '2024-01-01', foodId: null, recipeId: null, foodName: 'Eggs' }
		];
		const result = computeFoodDiversity(entries);
		expect(result.currentWeekUnique).toBe(2);
	});

	test('trend is increasing when recent weeks have more variety', () => {
		// 4 weeks: weeks 1-2 have 3 unique foods each, weeks 3-4 have 15 unique foods each
		const makeWeekEntries = (weekStart: string, count: number, prefix: string) => {
			const d = new Date(weekStart + 'T00:00:00');
			return Array.from({ length: count }, (_, i) => ({
				date: weekStart,
				foodId: `${prefix}-${i}`,
				recipeId: null as null,
				foodName: `${prefix}-${i}`
			}));
		};
		const entries = [
			...makeWeekEntries('2024-01-01', 3, 'old-a'),
			...makeWeekEntries('2024-01-08', 3, 'old-b'),
			...makeWeekEntries('2024-01-15', 15, 'new-a'),
			...makeWeekEntries('2024-01-22', 15, 'new-b')
		];
		const result = computeFoodDiversity(entries);
		expect(result.trend).toBe('increasing');
	});

	test('returns empty for no input', () => {
		const result = computeFoodDiversity([]);
		expect(result.sampleSize).toBe(0);
		expect(result.avgUniqueFoodsPerWeek).toBe(0);
		expect(result.confidence).toBe('insufficient');
	});

	test('sampleSize equals number of distinct weeks', () => {
		const entries = [
			{ date: '2024-01-01', foodId: 'a', recipeId: null, foodName: 'a' },
			{ date: '2024-01-08', foodId: 'b', recipeId: null, foodName: 'b' },
			{ date: '2024-01-15', foodId: 'c', recipeId: null, foodName: 'c' }
		];
		const result = computeFoodDiversity(entries);
		expect(result.sampleSize).toBe(3);
	});
});
