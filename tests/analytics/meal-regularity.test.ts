import { describe, test, expect } from 'vitest';
import { computeMealRegularity } from '$lib/analytics/meal-regularity';

describe('computeMealRegularity', () => {
	test('same meal times daily gives high score', () => {
		const entries = [
			{ date: '2024-01-01', mealType: 'Breakfast', eatenAt: '2024-01-01T08:00:00+00:00' },
			{ date: '2024-01-01', mealType: 'Lunch', eatenAt: '2024-01-01T12:00:00+00:00' },
			{ date: '2024-01-01', mealType: 'Dinner', eatenAt: '2024-01-01T19:00:00+00:00' },
			{ date: '2024-01-02', mealType: 'Breakfast', eatenAt: '2024-01-02T08:00:00+00:00' },
			{ date: '2024-01-02', mealType: 'Lunch', eatenAt: '2024-01-02T12:00:00+00:00' },
			{ date: '2024-01-02', mealType: 'Dinner', eatenAt: '2024-01-02T19:00:00+00:00' },
			{ date: '2024-01-03', mealType: 'Breakfast', eatenAt: '2024-01-03T08:00:00+00:00' },
			{ date: '2024-01-03', mealType: 'Lunch', eatenAt: '2024-01-03T12:00:00+00:00' },
			{ date: '2024-01-03', mealType: 'Dinner', eatenAt: '2024-01-03T19:00:00+00:00' }
		];
		const result = computeMealRegularity(entries);
		expect(result.overallScore).toBeCloseTo(100, 0);
		expect(result.meals.every((m) => m.regularity === 'high')).toBe(true);
	});

	test('random meal times gives lower score', () => {
		const entries = [
			{ date: '2024-01-01', mealType: 'Breakfast', eatenAt: '2024-01-01T06:00:00+00:00' },
			{ date: '2024-01-02', mealType: 'Breakfast', eatenAt: '2024-01-02T10:30:00+00:00' },
			{ date: '2024-01-03', mealType: 'Breakfast', eatenAt: '2024-01-03T07:00:00+00:00' },
			{ date: '2024-01-04', mealType: 'Breakfast', eatenAt: '2024-01-04T11:00:00+00:00' },
			{ date: '2024-01-05', mealType: 'Breakfast', eatenAt: '2024-01-05T08:30:00+00:00' }
		];
		const result = computeMealRegularity(entries);
		expect(result.overallScore).toBeLessThan(100);
	});

	test('takes earliest entry when multiple entries exist for same meal+day', () => {
		const entries = [
			{ date: '2024-01-01', mealType: 'Lunch', eatenAt: '2024-01-01T12:00:00+00:00' },
			{ date: '2024-01-01', mealType: 'Lunch', eatenAt: '2024-01-01T14:00:00+00:00' },
			{ date: '2024-01-02', mealType: 'Lunch', eatenAt: '2024-01-02T12:00:00+00:00' }
		];
		const result = computeMealRegularity(entries);
		const lunch = result.meals.find((m) => m.mealType === 'Lunch');
		expect(lunch?.avgMinute).toBe(12 * 60);
	});

	test('skips entries without eatenAt', () => {
		const entries = [
			{ date: '2024-01-01', mealType: 'Breakfast', eatenAt: null },
			{ date: '2024-01-01', mealType: 'Lunch', eatenAt: '2024-01-01T12:00:00+00:00' }
		];
		const result = computeMealRegularity(entries);
		expect(result.meals).toHaveLength(1);
		expect(result.meals[0].mealType).toBe('Lunch');
	});

	test('returns empty for no timed entries', () => {
		const result = computeMealRegularity([
			{ date: '2024-01-01', mealType: 'Breakfast', eatenAt: null }
		]);
		expect(result.meals).toHaveLength(0);
		expect(result.overallScore).toBe(0);
	});

	test('overallScore is clamped to 0-100', () => {
		const entries = Array.from({ length: 5 }, (_, i) => ({
			date: `2024-01-0${i + 1}`,
			mealType: 'Dinner',
			eatenAt: `2024-01-0${i + 1}T${String(10 + i * 3).padStart(2, '0')}:00:00+00:00`
		}));
		const result = computeMealRegularity(entries);
		expect(result.overallScore).toBeGreaterThanOrEqual(0);
		expect(result.overallScore).toBeLessThanOrEqual(100);
	});
});
