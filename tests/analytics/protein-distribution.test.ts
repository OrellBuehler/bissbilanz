import { describe, test, expect } from 'vitest';
import { computeProteinDistribution } from '$lib/analytics/protein-distribution';

function makeEntries(days: { date: string; meals: { mealType: string; protein: number }[] }[]) {
	return days.flatMap(({ date, meals }) =>
		meals.map(({ mealType, protein }) => ({ date, mealType, protein }))
	);
}

describe('computeProteinDistribution', () => {
	test('even distribution gives high score', () => {
		const entries = makeEntries([
			{
				date: '2024-01-01',
				meals: [
					{ mealType: 'Breakfast', protein: 33 },
					{ mealType: 'Lunch', protein: 33 },
					{ mealType: 'Dinner', protein: 34 }
				]
			}
		]);
		const result = computeProteinDistribution(entries);
		expect(result.score).toBeGreaterThan(90);
	});

	test('skewed distribution gives low score', () => {
		const entries = makeEntries([
			{
				date: '2024-01-01',
				meals: [
					{ mealType: 'Breakfast', protein: 10 },
					{ mealType: 'Lunch', protein: 10 },
					{ mealType: 'Dinner', protein: 80 }
				]
			}
		]);
		const result = computeProteinDistribution(entries);
		expect(result.score).toBeLessThan(50);
	});

	test('single meal per day gives score 0 (CV=0)', () => {
		const entries = makeEntries([
			{ date: '2024-01-01', meals: [{ mealType: 'Lunch', protein: 50 }] },
			{ date: '2024-01-02', meals: [{ mealType: 'Lunch', protein: 60 }] }
		]);
		const result = computeProteinDistribution(entries);
		expect(result.score).toBe(100);
	});

	test('mealsBelowThreshold counts correctly', () => {
		const entries = makeEntries([
			{
				date: '2024-01-01',
				meals: [
					{ mealType: 'Breakfast', protein: 10 },
					{ mealType: 'Lunch', protein: 25 },
					{ mealType: 'Dinner', protein: 15 }
				]
			}
		]);
		const result = computeProteinDistribution(entries, 20);
		expect(result.mealsBelowThreshold).toBe(2);
	});

	test('returns zero values for empty input', () => {
		const result = computeProteinDistribution([]);
		expect(result.score).toBe(0);
		expect(result.sampleSize).toBe(0);
		expect(result.confidence).toBe('insufficient');
	});

	test('sampleSize is number of distinct days', () => {
		const entries = makeEntries([
			{ date: '2024-01-01', meals: [{ mealType: 'Breakfast', protein: 30 }] },
			{ date: '2024-01-02', meals: [{ mealType: 'Breakfast', protein: 30 }] },
			{ date: '2024-01-03', meals: [{ mealType: 'Breakfast', protein: 30 }] }
		]);
		const result = computeProteinDistribution(entries);
		expect(result.sampleSize).toBe(3);
	});

	test('aggregates multiple entries for same meal on same day', () => {
		const entries = [
			{ date: '2024-01-01', mealType: 'Lunch', protein: 20 },
			{ date: '2024-01-01', mealType: 'Lunch', protein: 10 },
			{ date: '2024-01-01', mealType: 'Dinner', protein: 30 }
		];
		const result = computeProteinDistribution(entries);
		expect(result.avgPerMeal).toBeCloseTo(30);
	});
});
