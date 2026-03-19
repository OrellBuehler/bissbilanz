import { describe, expect, test } from 'vitest';
import {
	strictCount,
	tolerantCount,
	overallAdherence,
	filterDaysWithEntries,
	type DayRow,
	type Goals
} from '../../src/lib/utils/insights';

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

describe('filterDaysWithEntries', () => {
	test('excludes days with zero calories', () => {
		const days = [makeDay(), makeDay({ calories: 0 }), makeDay({ calories: 500 })];
		expect(filterDaysWithEntries(days)).toHaveLength(2);
	});

	test('returns empty for empty input', () => {
		expect(filterDaysWithEntries([])).toHaveLength(0);
	});
});

describe('strictCount', () => {
	test('counts days where value >= goal', () => {
		const days = [makeDay({ protein: 100 }), makeDay({ protein: 110 }), makeDay({ protein: 90 })];
		expect(strictCount(days, 'protein', 100)).toBe(2);
	});

	test('exactly at goal counts as hit', () => {
		const days = [makeDay({ calories: 2000 })];
		expect(strictCount(days, 'calories', 2000)).toBe(1);
	});

	test('returns 0 for zero goal', () => {
		const days = [makeDay({ protein: 100 })];
		expect(strictCount(days, 'protein', 0)).toBe(0);
	});

	test('returns 0 for empty array', () => {
		expect(strictCount([], 'calories', 2000)).toBe(0);
	});
});

describe('tolerantCount', () => {
	test('counts days within ±10% of goal', () => {
		const days = [
			makeDay({ protein: 100 }),
			makeDay({ protein: 90 }),
			makeDay({ protein: 110 }),
			makeDay({ protein: 80 }),
			makeDay({ protein: 120 })
		];
		expect(tolerantCount(days, 'protein', 100)).toBe(3);
	});

	test('exactly at goal counts as in range', () => {
		const days = [makeDay({ fat: 60 })];
		expect(tolerantCount(days, 'fat', 60)).toBe(1);
	});

	test('exactly at -10% boundary is included', () => {
		const days = [makeDay({ calories: 1800 })];
		expect(tolerantCount(days, 'calories', 2000)).toBe(1);
	});

	test('exactly at +10% boundary is included', () => {
		const days = [makeDay({ calories: 2200 })];
		expect(tolerantCount(days, 'calories', 2000)).toBe(1);
	});

	test('just outside -10% is excluded', () => {
		const days = [makeDay({ calories: 1799 })];
		expect(tolerantCount(days, 'calories', 2000)).toBe(0);
	});

	test('just outside +10% is excluded', () => {
		const days = [makeDay({ calories: 2201 })];
		expect(tolerantCount(days, 'calories', 2000)).toBe(0);
	});

	test('returns 0 for zero goal', () => {
		expect(tolerantCount([makeDay()], 'calories', 0)).toBe(0);
	});

	test('returns 0 for empty array', () => {
		expect(tolerantCount([], 'calories', 2000)).toBe(0);
	});
});

describe('overallAdherence', () => {
	test('returns percentage of macro-day hits across all macros', () => {
		const days = [makeDay()];
		const result = overallAdherence(days, defaultGoals, strictCount);
		expect(result).toBe(100);
	});

	test('returns 0 for empty data', () => {
		expect(overallAdherence([], defaultGoals, strictCount)).toBe(0);
	});

	test('returns 0 when all days have zero calories (no entries)', () => {
		const days = [makeDay({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })];
		expect(overallAdherence(days, defaultGoals, strictCount)).toBe(0);
	});

	test('handles zero goals gracefully', () => {
		const zeroGoals: Goals = {
			calorieGoal: 0,
			proteinGoal: 0,
			carbGoal: 0,
			fatGoal: 0,
			fiberGoal: 0
		};
		expect(overallAdherence([makeDay()], zeroGoals, strictCount)).toBe(0);
	});

	test('partial adherence gives correct percentage', () => {
		const days = [makeDay({ calories: 2000, protein: 50, carbs: 250, fat: 60, fiber: 30 })];
		const result = overallAdherence(days, defaultGoals, strictCount);
		expect(result).toBe(80);
	});

	test('tolerant mode counts within ±10%', () => {
		const days = [makeDay({ calories: 1900, protein: 95, carbs: 240, fat: 55, fiber: 28 })];
		const result = overallAdherence(days, defaultGoals, tolerantCount);
		expect(result).toBe(100);
	});
});
