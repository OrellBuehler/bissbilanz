import { describe, test, expect } from 'vitest';
import {
	computeProteinDistribution,
	proteinPerMealThreshold
} from '$lib/analytics/protein-distribution';

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

	test('a single meal per day is the skewed pattern, not a perfect one', () => {
		const entries = makeEntries([
			{ date: '2024-01-01', meals: [{ mealType: 'Lunch', protein: 50 }] },
			{ date: '2024-01-02', meals: [{ mealType: 'Lunch', protein: 60 }] }
		]);
		const result = computeProteinDistribution(entries);
		// Padded to three feedings [50, 0, 0]: CV = √2 → score floors at 0.
		expect(result.score).toBe(0);
		expect(result.mealsPerDay).toBe(1);
	});

	test('two even meals score below three even meals', () => {
		const two = computeProteinDistribution(
			makeEntries([
				{
					date: '2024-01-01',
					meals: [
						{ mealType: 'Lunch', protein: 45 },
						{ mealType: 'Dinner', protein: 45 }
					]
				}
			])
		);
		const three = computeProteinDistribution(
			makeEntries([
				{
					date: '2024-01-01',
					meals: [
						{ mealType: 'Breakfast', protein: 30 },
						{ mealType: 'Lunch', protein: 30 },
						{ mealType: 'Dinner', protein: 30 }
					]
				}
			])
		);
		expect(three.score).toBe(100);
		expect(two.score).toBeLessThan(three.score);
		expect(two.score).toBeGreaterThan(0);
	});

	test('the per-meal bar scales with body weight', () => {
		expect(proteinPerMealThreshold(null)).toBe(20);
		expect(proteinPerMealThreshold(50)).toBe(20);
		expect(proteinPerMealThreshold(85)).toBeCloseTo(34, 9);
		const entries = makeEntries([
			{
				date: '2024-01-01',
				meals: [
					{ mealType: 'Lunch', protein: 25 },
					{ mealType: 'Dinner', protein: 40 }
				]
			}
		]);
		const result = computeProteinDistribution(entries, proteinPerMealThreshold(85));
		expect(result.threshold).toBeCloseTo(34, 9);
		expect(result.mealsBelowThreshold).toBe(1);
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
