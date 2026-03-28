import { describe, test, expect } from 'vitest';
import { computeAverages, computeDailyBreakdown, computeCalendarDays } from '$lib/server/stats';

const entry = (
	date: string,
	calories: number,
	protein: number,
	carbs: number,
	fat: number,
	fiber: number,
	servings = 1
) => ({ date, servings, calories, protein, carbs, fat, fiber });

const nullEntry = (date: string) => ({
	date,
	servings: 1,
	calories: null,
	protein: null,
	carbs: null,
	fat: null,
	fiber: null
});

describe('computeAverages', () => {
	test('empty entries returns zeros', () => {
		const result = computeAverages([], new Set());
		expect(result).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
	});

	test('single day single entry', () => {
		const result = computeAverages([entry('2026-03-01', 800, 40, 80, 30, 15)], new Set());
		expect(result.calories).toBe(800);
		expect(result.protein).toBe(40);
		expect(result.carbs).toBe(80);
		expect(result.fat).toBe(30);
		expect(result.fiber).toBe(15);
	});

	test('single day multiple entries are grouped before averaging', () => {
		const entries = [
			entry('2026-03-01', 300, 15, 30, 10, 5),
			entry('2026-03-01', 500, 25, 50, 20, 10)
		];
		const result = computeAverages(entries, new Set());
		expect(result.calories).toBe(800);
		expect(result.protein).toBe(40);
		expect(result.carbs).toBe(80);
		expect(result.fat).toBe(30);
		expect(result.fiber).toBe(15);
	});

	test('multiple days averages across day count', () => {
		const entries = [
			entry('2026-03-01', 600, 30, 60, 20, 10),
			entry('2026-03-02', 1000, 50, 100, 40, 20)
		];
		const result = computeAverages(entries, new Set());
		expect(result.calories).toBe(800);
		expect(result.protein).toBe(40);
		expect(result.carbs).toBe(80);
		expect(result.fat).toBe(30);
		expect(result.fiber).toBe(15);
	});

	test('fasting day with no entries counts as a zero-calorie day', () => {
		const entries = [entry('2026-03-01', 800, 40, 80, 30, 15)];
		const fastingDays = new Set(['2026-03-02']);
		const result = computeAverages(entries, fastingDays);
		expect(result.calories).toBe(400);
		expect(result.protein).toBe(20);
		expect(result.carbs).toBe(40);
		expect(result.fat).toBe(15);
		expect(result.fiber).toBe(7.5);
	});

	test('fasting day that already has entries does not add a duplicate day', () => {
		const entries = [entry('2026-03-01', 400, 20, 40, 15, 8)];
		const fastingDays = new Set(['2026-03-01']);
		const result = computeAverages(entries, fastingDays);
		expect(result.calories).toBe(400);
	});

	test('multiple fasting days with no entries', () => {
		const entries = [entry('2026-03-01', 900, 45, 90, 35, 18)];
		const fastingDays = new Set(['2026-03-02', '2026-03-03']);
		const result = computeAverages(entries, fastingDays);
		expect(result.calories).toBe(300);
	});

	test('null nutrient values treated as zero', () => {
		const result = computeAverages([nullEntry('2026-03-01')], new Set());
		expect(result).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
	});

	test('servings multiplier applied before averaging', () => {
		const entries = [
			{ date: '2026-03-01', servings: 2, calories: 200, protein: 10, carbs: 20, fat: 8, fiber: 4 }
		];
		const result = computeAverages(entries, new Set());
		expect(result.calories).toBe(400);
		expect(result.protein).toBe(20);
	});
});

describe('computeDailyBreakdown', () => {
	test('empty entries fills every date in range with zeros', () => {
		const result = computeDailyBreakdown([], '2026-03-01', '2026-03-03');
		expect(result).toHaveLength(3);
		expect(result[0].date).toBe('2026-03-01');
		expect(result[1].date).toBe('2026-03-02');
		expect(result[2].date).toBe('2026-03-03');
		for (const day of result) {
			expect(day.calories).toBe(0);
			expect(day.protein).toBe(0);
			expect(day.carbs).toBe(0);
			expect(day.fat).toBe(0);
			expect(day.fiber).toBe(0);
		}
	});

	test('single-day range returns one entry', () => {
		const result = computeDailyBreakdown(
			[entry('2026-03-01', 800, 40, 80, 30, 15)],
			'2026-03-01',
			'2026-03-01'
		);
		expect(result).toHaveLength(1);
		expect(result[0].date).toBe('2026-03-01');
		expect(result[0].calories).toBe(800);
	});

	test('days without entries appear as zeros', () => {
		const entries = [entry('2026-03-03', 700, 35, 70, 25, 12)];
		const result = computeDailyBreakdown(entries, '2026-03-01', '2026-03-03');
		expect(result).toHaveLength(3);
		expect(result[0].calories).toBe(0);
		expect(result[1].calories).toBe(0);
		expect(result[2].calories).toBe(700);
	});

	test('multiple entries on same day are summed', () => {
		const entries = [
			entry('2026-03-01', 300, 15, 30, 10, 5),
			entry('2026-03-01', 500, 25, 50, 20, 10)
		];
		const result = computeDailyBreakdown(entries, '2026-03-01', '2026-03-02');
		expect(result[0].calories).toBe(800);
		expect(result[0].protein).toBe(40);
		expect(result[1].calories).toBe(0);
	});

	test('entries spanning multiple days', () => {
		const entries = [
			entry('2026-03-01', 600, 30, 60, 20, 10),
			entry('2026-03-02', 400, 20, 40, 15, 8),
			entry('2026-03-02', 200, 10, 20, 5, 4)
		];
		const result = computeDailyBreakdown(entries, '2026-03-01', '2026-03-02');
		expect(result[0].calories).toBe(600);
		expect(result[1].calories).toBe(600);
	});

	test('values are rounded in output', () => {
		const entries = [
			{ date: '2026-03-01', servings: 3, calories: 10, protein: 1, carbs: 1, fat: 1, fiber: 1 }
		];
		const result = computeDailyBreakdown(entries, '2026-03-01', '2026-03-01');
		expect(result[0].calories).toBe(30);
		expect(result[0].protein).toBe(3);
	});

	test('null nutrient values treated as zero', () => {
		const result = computeDailyBreakdown([nullEntry('2026-03-01')], '2026-03-01', '2026-03-01');
		expect(result[0].calories).toBe(0);
		expect(result[0].protein).toBe(0);
	});
});

describe('computeCalendarDays', () => {
	test('empty entries returns empty object', () => {
		const result = computeCalendarDays([]);
		expect(result).toEqual({});
	});

	test('single entry sets hasEntries true and correct calories', () => {
		const result = computeCalendarDays([entry('2026-03-01', 800, 40, 80, 30, 15)]);
		expect(result['2026-03-01']).toEqual({ calories: 800, hasEntries: true });
	});

	test('multiple entries on same day are summed and rounded', () => {
		const entries = [
			entry('2026-03-01', 300, 15, 30, 10, 5),
			entry('2026-03-01', 500, 25, 50, 20, 10)
		];
		const result = computeCalendarDays(entries);
		expect(result['2026-03-01']).toEqual({ calories: 800, hasEntries: true });
	});

	test('entries on different dates appear as separate keys', () => {
		const entries = [
			entry('2026-03-01', 600, 30, 60, 20, 10),
			entry('2026-03-02', 400, 20, 40, 15, 8)
		];
		const result = computeCalendarDays(entries);
		expect(Object.keys(result)).toHaveLength(2);
		expect(result['2026-03-01'].calories).toBe(600);
		expect(result['2026-03-02'].calories).toBe(400);
	});

	test('calories are rounded to whole numbers', () => {
		const entries = [
			{ date: '2026-03-01', servings: 1, calories: 333.7, protein: 0, carbs: 0, fat: 0, fiber: 0 }
		];
		const result = computeCalendarDays(entries);
		expect(result['2026-03-01'].calories).toBe(334);
	});

	test('servings multiplier applied to calories', () => {
		const entries = [
			{ date: '2026-03-01', servings: 2.5, calories: 200, protein: 0, carbs: 0, fat: 0, fiber: 0 }
		];
		const result = computeCalendarDays(entries);
		expect(result['2026-03-01'].calories).toBe(500);
	});

	test('null calorie values treated as zero', () => {
		const result = computeCalendarDays([nullEntry('2026-03-01')]);
		expect(result['2026-03-01']).toEqual({ calories: 0, hasEntries: true });
	});
});
