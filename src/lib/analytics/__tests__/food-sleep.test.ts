import { describe, it, expect } from 'vitest';
import { detectFoodSleepPatterns } from '../food-sleep';

function isoDay(i: number): string {
	const d = new Date('2024-01-01T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + i);
	return d.toISOString().slice(0, 10);
}

/**
 * 40 nights. Chamomile on every 4th night lifts quality to ~8.5, coffee on
 * every 4th+2 night drops it to ~4.5, and the remaining nights sit at ~6.5 with
 * a little alternating noise so the variances are non-zero.
 */
const nights = 40;
const sleepData = Array.from({ length: nights }, (_, i) => {
	const base = i % 4 === 0 ? 8.5 : i % 4 === 2 ? 4.5 : 6.5;
	return { date: isoDay(i), quality: base + (i % 2 === 0 ? 0.2 : -0.2) };
});
const chamomile = sleepData
	.filter((_, i) => i % 4 === 0)
	.map((s) => ({ date: s.date, foodId: 'f1', foodName: 'Chamomile Tea', nutrients: {} }));
const coffee = sleepData
	.filter((_, i) => i % 4 === 2)
	.map((s) => ({ date: s.date, foodId: 'f2', foodName: 'Coffee', nutrients: {} }));
// Toast on a scattered set of nights that tracks the base rate — no effect.
const toast = sleepData
	.filter((_, i) => i % 5 === 1)
	.map((s) => ({ date: s.date, foodId: 'f3', foodName: 'Toast', nutrients: {} }));

describe('detectFoodSleepPatterns', () => {
	it('detects food with positive sleep impact', () => {
		const { foodImpacts } = detectFoodSleepPatterns(chamomile, sleepData);
		const tea = foodImpacts.find((f) => f.foodId === 'f1');
		expect(tea).toBeDefined();
		expect(tea!.delta).toBeGreaterThan(0);
		expect(tea!.avgQualityWith).toBeGreaterThan(tea!.avgQualityWithout);
		expect(tea!.qValue).toBeLessThanOrEqual(0.1);
	});

	it('detects food with negative sleep impact', () => {
		const { foodImpacts } = detectFoodSleepPatterns(coffee, sleepData);
		const c = foodImpacts.find((f) => f.foodId === 'f2');
		expect(c).toBeDefined();
		expect(c!.delta).toBeLessThan(0);
	});

	it('does not surface a food whose difference is within noise', () => {
		const { foodImpacts, comparisons } = detectFoodSleepPatterns(
			[...chamomile, ...coffee, ...toast],
			sleepData
		);
		expect(comparisons).toBe(3);
		expect(foodImpacts.map((f) => f.foodId).sort()).toEqual(['f1', 'f2']);
	});

	it('excludes foods with fewer than minOccurrences', () => {
		const rare = chamomile.slice(0, 4);
		const { foodImpacts, comparisons } = detectFoodSleepPatterns(rare, sleepData, 5);
		expect(foodImpacts.find((f) => f.foodId === 'f1')).toBeUndefined();
		expect(comparisons).toBe(0);
	});

	it('includes foods when occurrences exactly equals minOccurrences', () => {
		const exact = chamomile.slice(0, 5);
		const { foodImpacts } = detectFoodSleepPatterns(exact, sleepData, 5);
		const tea = foodImpacts.find((f) => f.foodId === 'f1');
		expect(tea).toBeDefined();
		expect(tea!.occurrences).toBe(5);
	});

	it('calculates delta as avgQualityWith minus avgQualityWithout', () => {
		const { foodImpacts } = detectFoodSleepPatterns(chamomile, sleepData);
		const food = foodImpacts.find((f) => f.foodId === 'f1')!;
		expect(food.delta).toBeCloseTo(food.avgQualityWith - food.avgQualityWithout, 5);
	});

	it('returns empty foodImpacts and zero quality for empty inputs', () => {
		const result = detectFoodSleepPatterns([], []);
		expect(result.foodImpacts).toHaveLength(0);
		expect(result.overallAvgQuality).toBe(0);
		expect(result.comparisons).toBe(0);
	});

	it('returns empty foodImpacts when no evening foods match sleep dates', () => {
		const eveningFoods = Array.from({ length: 6 }, (_, i) => ({
			date: `2025-06-0${i + 1}`,
			foodId: 'f1',
			foodName: 'Food',
			nutrients: {}
		}));
		const result = detectFoodSleepPatterns(eveningFoods, sleepData);
		expect(result.foodImpacts).toHaveLength(0);
	});

	it('computes overall average quality across all sleep entries', () => {
		const { overallAvgQuality } = detectFoodSleepPatterns([], sleepData);
		const expected = sleepData.reduce((s, e) => s + e.quality, 0) / sleepData.length;
		expect(overallAvgQuality).toBeCloseTo(expected, 5);
	});

	it('sorts food impacts by |delta| descending', () => {
		const { foodImpacts } = detectFoodSleepPatterns([...chamomile, ...coffee], sleepData);
		for (let i = 1; i < foodImpacts.length; i++) {
			expect(Math.abs(foodImpacts[i - 1].delta)).toBeGreaterThanOrEqual(
				Math.abs(foodImpacts[i].delta)
			);
		}
	});

	it('same food eaten multiple times on same evening — counted once per date', () => {
		const duplicated = [...chamomile, ...chamomile.slice(0, 3)];
		const { foodImpacts } = detectFoodSleepPatterns(duplicated, sleepData);
		const tea = foodImpacts.find((f) => f.foodId === 'f1');
		expect(tea).toBeDefined();
		expect(tea!.occurrences).toBe(chamomile.length);
	});

	it('all sleep quality values the same — nothing surfaces', () => {
		const uniformSleep = sleepData.map((d) => ({ ...d, quality: 7 }));
		const { foodImpacts } = detectFoodSleepPatterns(chamomile, uniformSleep);
		expect(foodImpacts).toHaveLength(0);
	});

	it('no evening foods at all — returns empty foodImpacts', () => {
		const { foodImpacts } = detectFoodSleepPatterns([], sleepData);
		expect(foodImpacts).toHaveLength(0);
	});
});
