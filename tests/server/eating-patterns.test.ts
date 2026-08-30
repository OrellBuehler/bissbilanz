import { describe, expect, test } from 'vitest';
import {
	buildEatingPatterns,
	summarizeMealSlots,
	type PatternEntry
} from '../../src/lib/server/eating-patterns';

const entry = (
	date: string,
	mealType: string,
	hour: string,
	calories: number,
	protein = 10
): PatternEntry => ({
	date,
	mealType,
	eatenAt: `${date}T${hour}:00.000Z`,
	calories,
	protein,
	foodId: `${mealType}-food`,
	recipeId: null,
	foodName: `${mealType} food`
});

describe('summarizeMealSlots', () => {
	test('splits calories by slot and orders by share', () => {
		const slots = summarizeMealSlots(
			[entry('2026-02-01', 'Breakfast', '07:00', 400), entry('2026-02-01', 'Dinner', '19:00', 600)],
			'UTC'
		);
		expect(slots.map((slot) => slot.mealType)).toEqual(['Dinner', 'Breakfast']);
		expect(slots[0].sharePct).toBeCloseTo(60, 5);
		expect(slots[1].sharePct).toBeCloseTo(40, 5);
	});

	test('averages clock times circularly, so a late slot does not land at noon', () => {
		const slots = summarizeMealSlots(
			[entry('2026-02-01', 'Dinner', '23:50', 500), entry('2026-02-02', 'Dinner', '00:10', 500)],
			'UTC'
		);
		expect(slots[0].avgTimeHHmm).toBe('00:00');
	});

	test('counts distinct days, not entries, when averaging a slot', () => {
		const slots = summarizeMealSlots(
			[
				entry('2026-02-01', 'Lunch', '12:00', 300),
				entry('2026-02-01', 'Lunch', '13:00', 300),
				entry('2026-02-02', 'Lunch', '12:00', 600)
			],
			'UTC'
		);
		expect(slots[0].daysLogged).toBe(2);
		expect(slots[0].avgCalories).toBe(600);
	});

	test('falls back to a placeholder slot for an entry with no meal type', () => {
		const slots = summarizeMealSlots(
			[{ ...entry('2026-02-01', 'Dinner', '19:00', 500), mealType: '' }],
			'UTC'
		);
		expect(slots[0].mealType).toBe('Unknown');
	});

	test('reports no average time when nothing carried one', () => {
		const slots = summarizeMealSlots(
			[{ ...entry('2026-02-01', 'Dinner', '19:00', 500), eatenAt: null }],
			'UTC'
		);
		expect(slots[0].avgTimeHHmm).toBeNull();
		expect(slots[0].sharePct).toBeCloseTo(100, 5);
	});

	test('returns nothing for no entries rather than dividing by zero', () => {
		expect(summarizeMealSlots([], 'UTC')).toEqual([]);
	});
});

describe('buildEatingPatterns', () => {
	const entries = [
		entry('2026-02-01', 'Breakfast', '07:00', 400, 20),
		entry('2026-02-01', 'Dinner', '19:00', 600, 40)
	];
	const days = [
		{ date: '2026-02-01', calories: 1000, protein: 60, carbs: 100, fat: 30, fiber: 20 }
	];

	test('drops the per-day window series that would bloat an LLM payload', () => {
		const patterns = buildEatingPatterns({ entries, days, timeZone: 'UTC', bodyWeightKg: 80 });
		expect(patterns.mealTiming).not.toHaveProperty('dailyWindows');
		expect(patterns.mealTiming.hourlyDistribution).toHaveLength(24);
	});

	test('scales the protein threshold to body weight', () => {
		const heavy = buildEatingPatterns({ entries, days, timeZone: 'UTC', bodyWeightKg: 100 });
		const light = buildEatingPatterns({ entries, days, timeZone: 'UTC', bodyWeightKg: 50 });
		expect(heavy.proteinThresholdG).toBeGreaterThan(light.proteinThresholdG);
	});

	test('caps the diversity history to the most recent weeks', () => {
		const manyWeeks = Array.from({ length: 20 }, (_, i) => {
			const date = new Date(Date.UTC(2026, 0, 5 + i * 7)).toISOString().slice(0, 10);
			return entry(date, 'Dinner', '19:00', 500);
		});
		const patterns = buildEatingPatterns({
			entries: manyWeeks,
			days,
			timeZone: 'UTC',
			bodyWeightKg: 80,
			maxDiversityWeeks: 3
		});
		expect(patterns.foodDiversity.weeklyData.length).toBeLessThanOrEqual(3);
	});

	test('survives an empty range', () => {
		const patterns = buildEatingPatterns({
			entries: [],
			days: [],
			timeZone: 'UTC',
			bodyWeightKg: null
		});
		expect(patterns.mealSlots).toEqual([]);
		expect(patterns.proteinThresholdG).toBeGreaterThan(0);
	});
});
