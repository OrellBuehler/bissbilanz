import { describe, it, expect } from 'vitest';
import { pearsonCorrelation, getConfidenceLevel } from '../correlation';
import { computeCaloricLag } from '../caloric-lag';
import { computeNutrientOutcomeCorrelations } from '../nutrient-correlation';
import { detectFoodSleepPatterns } from '../food-sleep';

function makeDates(n: number, startDate: string = '2024-01-01'): string[] {
	return Array.from({ length: n }, (_, i) => {
		const d = new Date(startDate + 'T00:00:00Z');
		d.setUTCDate(d.getUTCDate() + i);
		return d.toISOString().slice(0, 10);
	});
}

describe('analytics integration', () => {
	describe('full correlation pipeline', () => {
		it('generates synthetic data and computes correlations with correct output structure', () => {
			const dates = makeDates(30);
			const dailyNutrients = dates.map((date, i) => ({
				date,
				nutrients: { protein: 100 + i * 3, fat: 50, carbs: 200 + i }
			}));
			const outcomes = dates.map((date, i) => ({ date, value: 60 + i * 1.5 }));

			const result = computeNutrientOutcomeCorrelations(dailyNutrients, outcomes);

			expect(Array.isArray(result)).toBe(true);
			for (const entry of result) {
				expect(entry).toHaveProperty('nutrientKey');
				expect(entry).toHaveProperty('correlation');
				expect(entry.correlation).toHaveProperty('r');
				expect(entry.correlation).toHaveProperty('pValue');
				expect(entry.correlation).toHaveProperty('sampleSize');
				expect(entry.correlation).toHaveProperty('confidence');
				expect(entry.correlation).toHaveProperty('constantInput');
				expect(typeof entry.nutrientKey).toBe('string');
				expect(entry.correlation.r).toBeGreaterThanOrEqual(-1);
				expect(entry.correlation.r).toBeLessThanOrEqual(1);
			}
		});

		it('sorted results have |r| descending', () => {
			const dates = makeDates(30);
			const dailyNutrients = dates.map((date, i) => ({
				date,
				nutrients: {
					strong: 100 + i * 10,
					moderate: 50 + i * 3 + Math.sin(i) * 15,
					weak: 200 + Math.cos(i * 3) * 5
				}
			}));
			const outcomes = dates.map((date, i) => ({ date, value: i * 2 + 10 }));

			const result = computeNutrientOutcomeCorrelations(dailyNutrients, outcomes);

			for (let i = 1; i < result.length; i++) {
				expect(Math.abs(result[i - 1].correlation.r)).toBeGreaterThanOrEqual(
					Math.abs(result[i].correlation.r)
				);
			}
		});
	});

	describe('caloric lag with realistic data patterns', () => {
		it('identifies the correct lag when calorie intake predicts weight change', () => {
			const n = 30;
			const lag = 2;
			const calories: { date: string; value: number }[] = [];
			const weight: { date: string; value: number }[] = [];
			const startDate = '2024-01-01';

			for (let i = 0; i < n + lag; i++) {
				const d = new Date(startDate + 'T00:00:00Z');
				d.setUTCDate(d.getUTCDate() + i);
				const date = d.toISOString().slice(0, 10);
				const calValue = 2000 + Math.sin(i * 0.5) * 400;
				calories.push({ date, value: calValue });
			}

			for (let i = lag; i < n + lag; i++) {
				const d = new Date(startDate + 'T00:00:00Z');
				d.setUTCDate(d.getUTCDate() + i);
				const date = d.toISOString().slice(0, 10);
				weight.push({ date, value: 75 + calories[i - lag].value / 20000 });
			}

			const result = computeCaloricLag(calories, weight, 5);
			expect(result.bestLag).toBe(lag);
			expect(result.results).toHaveLength(5);
		});

		it('returns null bestLag when insufficient paired data', () => {
			const calories = [{ date: '2024-01-01', value: 2000 }];
			const weight = [{ date: '2024-01-10', value: 80 }];
			const result = computeCaloricLag(calories, weight, 3);
			expect(result.bestLag).toBeNull();
		});
	});

	describe('nutrient correlation matrix with realistic data', () => {
		it('protein strongly correlated with weight outcome', () => {
			const dates = makeDates(25);
			const dailyNutrients = dates.map((date, i) => ({
				date,
				nutrients: { protein: 80 + i * 4, fat: 60 + Math.random() * 5 }
			}));
			const outcomes = dates.map((date, i) => ({ date, value: 70 + i * 0.3 }));

			const result = computeNutrientOutcomeCorrelations(dailyNutrients, outcomes);
			const proteinEntry = result.find((r) => r.nutrientKey === 'protein');
			expect(proteinEntry).toBeDefined();
			expect(proteinEntry!.correlation.r).toBeGreaterThan(0.8);
		});

		it('filters out nutrients with too many null values', () => {
			const dates = makeDates(20);
			const dailyNutrients = dates.map((date, i) => ({
				date,
				nutrients: {
					sparse: i < 12 ? null : 100 + i * 5,
					present: 100 + i * 5
				}
			}));
			const outcomes = dates.map((date, i) => ({ date, value: 50 + i * 2 }));

			const result = computeNutrientOutcomeCorrelations(dailyNutrients, outcomes);
			const sparseEntry = result.find((r) => r.nutrientKey === 'sparse');
			expect(sparseEntry).toBeUndefined();
		});
	});

	describe('food-sleep pattern detection end-to-end', () => {
		it('detects positive and negative food impacts from realistic data', () => {
			const sleepData = [
				{ date: '2024-01-01', quality: 6 },
				{ date: '2024-01-02', quality: 8 },
				{ date: '2024-01-03', quality: 9 },
				{ date: '2024-01-04', quality: 5 },
				{ date: '2024-01-05', quality: 8 },
				{ date: '2024-01-06', quality: 4 },
				{ date: '2024-01-07', quality: 9 },
				{ date: '2024-01-08', quality: 7 },
				{ date: '2024-01-09', quality: 3 },
				{ date: '2024-01-10', quality: 8 }
			];

			const eveningFoods = [
				{ date: '2024-01-02', foodId: 'chamomile', foodName: 'Chamomile Tea', nutrients: {} },
				{ date: '2024-01-03', foodId: 'chamomile', foodName: 'Chamomile Tea', nutrients: {} },
				{ date: '2024-01-05', foodId: 'chamomile', foodName: 'Chamomile Tea', nutrients: {} },
				{ date: '2024-01-07', foodId: 'chamomile', foodName: 'Chamomile Tea', nutrients: {} },
				{ date: '2024-01-04', foodId: 'coffee', foodName: 'Coffee', nutrients: {} },
				{ date: '2024-01-06', foodId: 'coffee', foodName: 'Coffee', nutrients: {} },
				{ date: '2024-01-09', foodId: 'coffee', foodName: 'Coffee', nutrients: {} }
			];

			const { foodImpacts, overallAvgQuality } = detectFoodSleepPatterns(eveningFoods, sleepData);

			expect(foodImpacts.length).toBeGreaterThan(0);
			expect(overallAvgQuality).toBeCloseTo(
				sleepData.reduce((s, e) => s + e.quality, 0) / sleepData.length,
				5
			);

			const chamomile = foodImpacts.find((f) => f.foodId === 'chamomile');
			expect(chamomile).toBeDefined();
			expect(chamomile!.delta).toBeGreaterThan(0);
		});

		it('returns sorted results with largest absolute delta first', () => {
			const sleepData = [
				{ date: '2024-01-01', quality: 9 },
				{ date: '2024-01-02', quality: 2 },
				{ date: '2024-01-03', quality: 9 },
				{ date: '2024-01-04', quality: 2 },
				{ date: '2024-01-05', quality: 9 },
				{ date: '2024-01-06', quality: 5 },
				{ date: '2024-01-07', quality: 5 },
				{ date: '2024-01-08', quality: 5 },
				{ date: '2024-01-09', quality: 5 }
			];
			const eveningFoods = [
				{ date: '2024-01-01', foodId: 'best', foodName: 'Best Food', nutrients: {} },
				{ date: '2024-01-03', foodId: 'best', foodName: 'Best Food', nutrients: {} },
				{ date: '2024-01-05', foodId: 'best', foodName: 'Best Food', nutrients: {} },
				{ date: '2024-01-02', foodId: 'worst', foodName: 'Worst Food', nutrients: {} },
				{ date: '2024-01-04', foodId: 'worst', foodName: 'Worst Food', nutrients: {} },
				{ date: '2024-01-06', foodId: 'neutral', foodName: 'Neutral Food', nutrients: {} },
				{ date: '2024-01-07', foodId: 'neutral', foodName: 'Neutral Food', nutrients: {} },
				{ date: '2024-01-08', foodId: 'neutral', foodName: 'Neutral Food', nutrients: {} }
			];

			const { foodImpacts } = detectFoodSleepPatterns(eveningFoods, sleepData);

			for (let i = 1; i < foodImpacts.length; i++) {
				expect(Math.abs(foodImpacts[i - 1].delta)).toBeGreaterThanOrEqual(
					Math.abs(foodImpacts[i].delta)
				);
			}
		});
	});

	describe('confidence levels for different sample sizes', () => {
		it('returns insufficient for n < 7', () => {
			const x = [1, 2, 3, 4, 5];
			const y = [2, 4, 6, 8, 10];
			const result = pearsonCorrelation(x, y);
			expect(result.confidence).toBe('insufficient');
			expect(getConfidenceLevel(x.length)).toBe('insufficient');
		});

		it('returns low for 7 <= n < 14', () => {
			const x = Array.from({ length: 10 }, (_, i) => i + 1);
			const y = x.map((v) => v * 2);
			const result = pearsonCorrelation(x, y);
			expect(result.confidence).toBe('low');
			expect(getConfidenceLevel(10)).toBe('low');
		});

		it('returns medium for 14 <= n < 30', () => {
			const x = Array.from({ length: 20 }, (_, i) => i + 1);
			const y = x.map((v) => v * 1.5 + 2);
			const result = pearsonCorrelation(x, y);
			expect(result.confidence).toBe('medium');
			expect(getConfidenceLevel(20)).toBe('medium');
		});

		it('returns high for n >= 30', () => {
			const x = Array.from({ length: 30 }, (_, i) => i + 1);
			const y = x.map((v) => v * 3 + 1);
			const result = pearsonCorrelation(x, y);
			expect(result.confidence).toBe('high');
			expect(getConfidenceLevel(30)).toBe('high');
		});
	});

	describe('edge cases', () => {
		it('handles empty data for nutrient correlations', () => {
			const result = computeNutrientOutcomeCorrelations([], []);
			expect(result).toEqual([]);
		});

		it('handles single day for nutrient correlations', () => {
			const result = computeNutrientOutcomeCorrelations(
				[{ date: '2024-01-01', nutrients: { protein: 100 } }],
				[{ date: '2024-01-01', value: 80 }]
			);
			expect(Array.isArray(result)).toBe(true);
		});

		it('handles all same calorie values for caloric lag — returns results array', () => {
			const dates = makeDates(20);
			const calories = dates.map((date) => ({ date, value: 2000 }));
			const weight = dates.map((date, i) => ({ date, value: 80 + i * 0.1 }));
			const result = computeCaloricLag(calories, weight, 3);
			expect(result.results).toHaveLength(3);
		});

		it('handles empty sleep data for food-sleep patterns', () => {
			const result = detectFoodSleepPatterns([], []);
			expect(result.foodImpacts).toHaveLength(0);
			expect(result.overallAvgQuality).toBe(0);
		});

		it('handles foods that do not match any sleep dates', () => {
			const sleepData = [{ date: '2024-01-01', quality: 7 }];
			const eveningFoods = [
				{ date: '2025-06-01', foodId: 'f1', foodName: 'Food', nutrients: {} },
				{ date: '2025-06-02', foodId: 'f1', foodName: 'Food', nutrients: {} },
				{ date: '2025-06-03', foodId: 'f1', foodName: 'Food', nutrients: {} }
			];
			const result = detectFoodSleepPatterns(eveningFoods, sleepData);
			expect(result.foodImpacts).toHaveLength(0);
		});
	});
});
