import { describe, expect, test } from 'vitest';
import { filterDaysWithEntries, type DayRow, type Goals } from '../../src/lib/utils/insights';
import {
	classifyGoalOutcome,
	summarizeGoalAdherence
} from '../../src/lib/analytics/goal-adherence';

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

const noActivity = { enabled: false, creditPercent: 100 };

describe('filterDaysWithEntries', () => {
	test('excludes days with zero calories', () => {
		const days = [makeDay(), makeDay({ calories: 0 }), makeDay({ calories: 500 })];
		expect(filterDaysWithEntries(days)).toHaveLength(2);
	});

	test('returns empty for empty input', () => {
		expect(filterDaysWithEntries([])).toHaveLength(0);
	});
});

describe('classifyGoalOutcome', () => {
	test('minimum is met at or above the goal', () => {
		expect(classifyGoalOutcome('minimum', 100, 100)).toBe('met');
		expect(classifyGoalOutcome('minimum', 150, 100)).toBe('met');
		expect(classifyGoalOutcome('minimum', 99.9, 100)).toBe('below');
	});

	test('maximum is met at or below the goal', () => {
		expect(classifyGoalOutcome('maximum', 60, 60)).toBe('met');
		expect(classifyGoalOutcome('maximum', 10, 60)).toBe('met');
		expect(classifyGoalOutcome('maximum', 60.1, 60)).toBe('above');
	});

	test('range is met within ±10%', () => {
		expect(classifyGoalOutcome('range', 1800, 2000)).toBe('met');
		expect(classifyGoalOutcome('range', 2200, 2000)).toBe('met');
		expect(classifyGoalOutcome('range', 1799, 2000)).toBe('below');
		expect(classifyGoalOutcome('range', 2201, 2000)).toBe('above');
	});

	test('no goal yields no outcome', () => {
		expect(classifyGoalOutcome('minimum', 100, 0)).toBeNull();
	});
});

describe('summarizeGoalAdherence', () => {
	test('applies the rule for each macro', () => {
		const days = [makeDay({ calories: 2500, protein: 80, carbs: 200, fat: 70, fiber: 35 })];
		const summary = summarizeGoalAdherence(days, defaultGoals, noActivity);
		const byKey = Object.fromEntries(summary.macros.map((m) => [m.key, m]));
		expect(byKey.calories).toMatchObject({ rule: 'range', above: 1, met: 0 });
		expect(byKey.protein).toMatchObject({ rule: 'minimum', below: 1 });
		expect(byKey.carbs).toMatchObject({ rule: 'maximum', met: 1 });
		expect(byKey.fat).toMatchObject({ rule: 'maximum', above: 1 });
		expect(byKey.fiber).toMatchObject({ rule: 'minimum', met: 1 });
		expect(summary).toMatchObject({ met: 2, eligible: 5 });
	});

	test('skips days without entries and macros without a goal', () => {
		const days = [makeDay(), makeDay({ calories: 0 })];
		const summary = summarizeGoalAdherence(days, { ...defaultGoals, fiberGoal: 0 }, noActivity);
		expect(summary.macros.map((m) => m.key)).toEqual(['calories', 'protein', 'carbs', 'fat']);
		expect(summary.macros.every((m) => m.eligible === 1)).toBe(true);
	});

	test('judges each day against its activity-adjusted goal', () => {
		const days = [makeDay({ calories: 2400, activityCalories: 400 })];
		const plain = summarizeGoalAdherence(days, defaultGoals, noActivity);
		const adjusted = summarizeGoalAdherence(days, defaultGoals, {
			enabled: true,
			creditPercent: 100
		});
		expect(plain.macros[0]).toMatchObject({ key: 'calories', above: 1 });
		expect(adjusted.macros[0]).toMatchObject({ key: 'calories', met: 1 });
	});

	test('empty input has nothing eligible', () => {
		expect(summarizeGoalAdherence([], defaultGoals, noActivity)).toMatchObject({
			met: 0,
			eligible: 0
		});
	});
});
