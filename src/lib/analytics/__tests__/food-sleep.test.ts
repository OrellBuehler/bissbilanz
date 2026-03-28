import { describe, it, expect } from 'vitest';
import { detectFoodSleepPatterns } from '../food-sleep';

describe('detectFoodSleepPatterns', () => {
	const sleepData = [
		{ date: '2024-01-01', quality: 7 },
		{ date: '2024-01-02', quality: 5 },
		{ date: '2024-01-03', quality: 8 },
		{ date: '2024-01-04', quality: 6 },
		{ date: '2024-01-05', quality: 7 },
		{ date: '2024-01-06', quality: 4 },
		{ date: '2024-01-07', quality: 8 },
		{ date: '2024-01-08', quality: 6 },
		{ date: '2024-01-09', quality: 5 },
		{ date: '2024-01-10', quality: 9 }
	];

	it('detects food with positive sleep impact', () => {
		const eveningFoods = [
			{ date: '2024-01-03', foodId: 'f1', foodName: 'Chamomile Tea', nutrients: {} },
			{ date: '2024-01-05', foodId: 'f1', foodName: 'Chamomile Tea', nutrients: {} },
			{ date: '2024-01-07', foodId: 'f1', foodName: 'Chamomile Tea', nutrients: {} },
			{ date: '2024-01-10', foodId: 'f1', foodName: 'Chamomile Tea', nutrients: {} }
		];

		const { foodImpacts } = detectFoodSleepPatterns(eveningFoods, sleepData);
		const tea = foodImpacts.find((f) => f.foodId === 'f1');
		expect(tea).toBeDefined();
		expect(tea!.delta).toBeGreaterThan(0);
		expect(tea!.avgQualityWith).toBeGreaterThan(tea!.avgQualityWithout);
	});

	it('detects food with negative sleep impact', () => {
		const eveningFoods = [
			{ date: '2024-01-02', foodId: 'f2', foodName: 'Coffee', nutrients: {} },
			{ date: '2024-01-06', foodId: 'f2', foodName: 'Coffee', nutrients: {} },
			{ date: '2024-01-09', foodId: 'f2', foodName: 'Coffee', nutrients: {} }
		];

		const { foodImpacts } = detectFoodSleepPatterns(eveningFoods, sleepData);
		const coffee = foodImpacts.find((f) => f.foodId === 'f2');
		expect(coffee).toBeDefined();
		expect(coffee!.delta).toBeLessThan(0);
	});

	it('excludes foods with fewer than minOccurrences', () => {
		const eveningFoods = [
			{ date: '2024-01-01', foodId: 'rare', foodName: 'Rare Food', nutrients: {} },
			{ date: '2024-01-02', foodId: 'rare', foodName: 'Rare Food', nutrients: {} }
		];

		const { foodImpacts } = detectFoodSleepPatterns(eveningFoods, sleepData, 3);
		const rareFood = foodImpacts.find((f) => f.foodId === 'rare');
		expect(rareFood).toBeUndefined();
	});

	it('includes foods when occurrences exactly equals minOccurrences', () => {
		const eveningFoods = [
			{ date: '2024-01-01', foodId: 'f3', foodName: 'Milk', nutrients: {} },
			{ date: '2024-01-02', foodId: 'f3', foodName: 'Milk', nutrients: {} },
			{ date: '2024-01-03', foodId: 'f3', foodName: 'Milk', nutrients: {} }
		];

		const { foodImpacts } = detectFoodSleepPatterns(eveningFoods, sleepData, 3);
		const milk = foodImpacts.find((f) => f.foodId === 'f3');
		expect(milk).toBeDefined();
		expect(milk!.occurrences).toBe(3);
	});

	it('calculates delta as avgQualityWith minus avgQualityWithout', () => {
		const eveningFoods = [
			{ date: '2024-01-03', foodId: 'f1', foodName: 'Food', nutrients: {} },
			{ date: '2024-01-07', foodId: 'f1', foodName: 'Food', nutrients: {} },
			{ date: '2024-01-10', foodId: 'f1', foodName: 'Food', nutrients: {} }
		];

		const { foodImpacts } = detectFoodSleepPatterns(eveningFoods, sleepData);
		const food = foodImpacts.find((f) => f.foodId === 'f1');
		expect(food).toBeDefined();
		expect(food!.delta).toBeCloseTo(food!.avgQualityWith - food!.avgQualityWithout, 5);
	});

	it('returns empty foodImpacts and zero quality for empty inputs', () => {
		const result = detectFoodSleepPatterns([], []);
		expect(result.foodImpacts).toHaveLength(0);
		expect(result.overallAvgQuality).toBe(0);
	});

	it('returns empty foodImpacts when no evening foods match sleep dates', () => {
		const eveningFoods = [
			{ date: '2025-06-01', foodId: 'f1', foodName: 'Food', nutrients: {} },
			{ date: '2025-06-02', foodId: 'f1', foodName: 'Food', nutrients: {} },
			{ date: '2025-06-03', foodId: 'f1', foodName: 'Food', nutrients: {} }
		];

		const result = detectFoodSleepPatterns(eveningFoods, sleepData);
		expect(result.foodImpacts).toHaveLength(0);
	});

	it('computes overall average quality across all sleep entries', () => {
		const { overallAvgQuality } = detectFoodSleepPatterns([], sleepData);
		const expected = sleepData.reduce((s, e) => s + e.quality, 0) / sleepData.length;
		expect(overallAvgQuality).toBeCloseTo(expected, 5);
	});

	it('sorts food impacts by |delta| descending', () => {
		const eveningFoods = [
			{ date: '2024-01-03', foodId: 'f1', foodName: 'Good Food', nutrients: {} },
			{ date: '2024-01-07', foodId: 'f1', foodName: 'Good Food', nutrients: {} },
			{ date: '2024-01-10', foodId: 'f1', foodName: 'Good Food', nutrients: {} },
			{ date: '2024-01-01', foodId: 'f2', foodName: 'Neutral', nutrients: {} },
			{ date: '2024-01-04', foodId: 'f2', foodName: 'Neutral', nutrients: {} },
			{ date: '2024-01-08', foodId: 'f2', foodName: 'Neutral', nutrients: {} }
		];

		const { foodImpacts } = detectFoodSleepPatterns(eveningFoods, sleepData);
		for (let i = 1; i < foodImpacts.length; i++) {
			expect(Math.abs(foodImpacts[i - 1].delta)).toBeGreaterThanOrEqual(
				Math.abs(foodImpacts[i].delta)
			);
		}
	});

	it('same food eaten multiple times on same evening — counted once per date', () => {
		// food 'dup' appears 3 times on 2024-01-03 and 2 times on 2024-01-07 and once on 2024-01-10
		// unique dates = 3 (meets minOccurrences=3 default)
		const eveningFoods = [
			{ date: '2024-01-03', foodId: 'dup', foodName: 'Dup Food', nutrients: {} },
			{ date: '2024-01-03', foodId: 'dup', foodName: 'Dup Food', nutrients: {} },
			{ date: '2024-01-03', foodId: 'dup', foodName: 'Dup Food', nutrients: {} },
			{ date: '2024-01-07', foodId: 'dup', foodName: 'Dup Food', nutrients: {} },
			{ date: '2024-01-07', foodId: 'dup', foodName: 'Dup Food', nutrients: {} },
			{ date: '2024-01-10', foodId: 'dup', foodName: 'Dup Food', nutrients: {} }
		];

		const { foodImpacts } = detectFoodSleepPatterns(eveningFoods, sleepData);
		const dupFood = foodImpacts.find((f) => f.foodId === 'dup');
		expect(dupFood).toBeDefined();
		// occurrences should be 3 unique dates, not 6 total entries
		expect(dupFood!.occurrences).toBe(3);
	});

	it('food at exactly minOccurrences threshold is included', () => {
		const eveningFoods = [
			{ date: '2024-01-01', foodId: 'exact', foodName: 'Exact Food', nutrients: {} },
			{ date: '2024-01-02', foodId: 'exact', foodName: 'Exact Food', nutrients: {} },
			{ date: '2024-01-03', foodId: 'exact', foodName: 'Exact Food', nutrients: {} }
		];

		const { foodImpacts } = detectFoodSleepPatterns(eveningFoods, sleepData, 3);
		const exactFood = foodImpacts.find((f) => f.foodId === 'exact');
		expect(exactFood).toBeDefined();
	});

	it('all sleep quality values the same — delta should be 0', () => {
		const uniformSleep = sleepData.map((d) => ({ ...d, quality: 7 }));
		const eveningFoods = [
			{ date: '2024-01-01', foodId: 'f1', foodName: 'Food', nutrients: {} },
			{ date: '2024-01-03', foodId: 'f1', foodName: 'Food', nutrients: {} },
			{ date: '2024-01-05', foodId: 'f1', foodName: 'Food', nutrients: {} }
		];

		const { foodImpacts } = detectFoodSleepPatterns(eveningFoods, uniformSleep);
		const f = foodImpacts.find((fi) => fi.foodId === 'f1');
		if (f) {
			expect(f.delta).toBeCloseTo(0, 5);
		}
	});

	it('no evening foods at all — returns empty foodImpacts', () => {
		const { foodImpacts } = detectFoodSleepPatterns([], sleepData);
		expect(foodImpacts).toHaveLength(0);
	});
});
