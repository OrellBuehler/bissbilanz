import { describe, expect, test } from 'vitest';
import { radarAverages, radarPercentages, type DayRow, type Goals } from '../../src/lib/utils/insights';

const makeDay = (overrides: Partial<DayRow> = {}): DayRow => ({
	date: '2026-03-01',
	calories: 2000,
	protein: 100,
	carbs: 250,
	fat: 60,
	fiber: 30,
	...overrides
});

const defaultGoals: Goals = {
	calorieGoal: 2000,
	proteinGoal: 100,
	carbGoal: 250,
	fatGoal: 60,
	fiberGoal: 30
};

describe('radarAverages', () => {
	test('averages macros across days with entries', () => {
		const days = [
			makeDay({ calories: 2000, protein: 100 }),
			makeDay({ calories: 1800, protein: 80 })
		];
		const avg = radarAverages(days);
		expect(avg.calories).toBe(1900);
		expect(avg.protein).toBe(90);
	});

	test('excludes days with zero calories', () => {
		const days = [
			makeDay({ calories: 2000, protein: 100 }),
			makeDay({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })
		];
		const avg = radarAverages(days);
		expect(avg.calories).toBe(2000);
		expect(avg.protein).toBe(100);
	});

	test('returns zeros for empty array', () => {
		const avg = radarAverages([]);
		expect(avg).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
	});

	test('returns zeros when all days have zero calories', () => {
		const days = [makeDay({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })];
		const avg = radarAverages(days);
		expect(avg).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
	});

	test('rounds averages to whole numbers', () => {
		const days = [
			makeDay({ protein: 101 }),
			makeDay({ protein: 102 })
		];
		const avg = radarAverages(days);
		expect(avg.protein).toBe(102);
	});
});

describe('radarPercentages', () => {
	test('returns percentage of goal for each macro', () => {
		const avg = { calories: 2000, protein: 100, carbs: 250, fat: 60, fiber: 30 };
		const pcts = radarPercentages(avg, defaultGoals);
		expect(pcts).toEqual([100, 100, 100, 100, 100]);
	});

	test('returns all zeros when goals is null', () => {
		const avg = { calories: 2000, protein: 100, carbs: 250, fat: 60, fiber: 30 };
		const pcts = radarPercentages(avg, null);
		expect(pcts).toEqual([0, 0, 0, 0, 0]);
	});

	test('caps at 150% by default', () => {
		const avg = { calories: 4000, protein: 200, carbs: 500, fat: 120, fiber: 60 };
		const pcts = radarPercentages(avg, defaultGoals);
		expect(pcts).toEqual([150, 150, 150, 150, 150]);
	});

	test('respects custom cap', () => {
		const avg = { calories: 4000, protein: 100, carbs: 250, fat: 60, fiber: 30 };
		const pcts = radarPercentages(avg, defaultGoals, 200);
		expect(pcts[0]).toBe(200);
		expect(pcts[1]).toBe(100);
	});

	test('returns 0 for zero goal value', () => {
		const goals: Goals = { ...defaultGoals, proteinGoal: 0 };
		const avg = { calories: 2000, protein: 100, carbs: 250, fat: 60, fiber: 30 };
		const pcts = radarPercentages(avg, goals);
		expect(pcts[1]).toBe(0);
	});

	test('handles partial goal achievement', () => {
		const avg = { calories: 1000, protein: 50, carbs: 125, fat: 30, fiber: 15 };
		const pcts = radarPercentages(avg, defaultGoals);
		expect(pcts).toEqual([50, 50, 50, 50, 50]);
	});
});
