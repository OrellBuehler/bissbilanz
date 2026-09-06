import { describe, test, expect } from 'vitest';
import {
	applyDayPropertiesPatch,
	clampActivityCalories,
	clampWaterMl,
	isDayPropertiesEmpty,
	waterProgressPercent,
	DEFAULT_WATER_GOAL_ML,
	MAX_ACTIVITY_CALORIES,
	MAX_WATER_ML
} from '../../src/lib/utils/day-properties';

describe('isDayPropertiesEmpty', () => {
	test('treats null/undefined as empty', () => {
		expect(isDayPropertiesEmpty(null)).toBe(true);
		expect(isDayPropertiesEmpty(undefined)).toBe(true);
	});

	test('treats an all-defaults row as empty', () => {
		expect(
			isDayPropertiesEmpty({
				isFastingDay: false,
				notes: null,
				waterMl: null,
				activityCalories: null,
				activityNote: null
			})
		).toBe(true);
	});

	test('treats whitespace-only text and zeroes as empty', () => {
		expect(isDayPropertiesEmpty({ notes: '   ', activityNote: '\n', waterMl: 0 })).toBe(true);
	});

	test('is not empty when any field carries data', () => {
		expect(isDayPropertiesEmpty({ isFastingDay: true })).toBe(false);
		expect(isDayPropertiesEmpty({ notes: 'rest day' })).toBe(false);
		expect(isDayPropertiesEmpty({ waterMl: 250 })).toBe(false);
		expect(isDayPropertiesEmpty({ activityCalories: 300 })).toBe(false);
		expect(isDayPropertiesEmpty({ activityNote: 'run' })).toBe(false);
	});
});

describe('applyDayPropertiesPatch', () => {
	const current = {
		date: '2026-03-01',
		isFastingDay: true,
		notes: 'before',
		waterMl: 1000,
		activityCalories: 200,
		activityNote: 'walk'
	};

	test('leaves omitted fields unchanged', () => {
		expect(applyDayPropertiesPatch(current, '2026-03-01', { waterMl: 1500 })).toEqual({
			...current,
			waterMl: 1500
		});
	});

	test('clears a field on an explicit null', () => {
		const result = applyDayPropertiesPatch(current, '2026-03-01', {
			notes: null,
			activityNote: null
		});
		expect(result.notes).toBeNull();
		expect(result.activityNote).toBeNull();
		expect(result.waterMl).toBe(1000);
	});

	test('builds a fresh row when nothing is stored yet', () => {
		expect(applyDayPropertiesPatch(null, '2026-03-02', { notes: 'new' })).toEqual({
			date: '2026-03-02',
			isFastingDay: false,
			notes: 'new',
			waterMl: null,
			activityCalories: null,
			activityNote: null
		});
	});

	test('a patch that empties every field yields an empty row', () => {
		const cleared = applyDayPropertiesPatch(current, '2026-03-01', {
			isFastingDay: false,
			notes: null,
			waterMl: null,
			activityCalories: null,
			activityNote: null
		});
		expect(isDayPropertiesEmpty(cleared)).toBe(true);
	});
});

describe('clampWaterMl / clampActivityCalories', () => {
	test('null for empty, zero and negative input', () => {
		expect(clampWaterMl(null)).toBeNull();
		expect(clampWaterMl(undefined)).toBeNull();
		expect(clampWaterMl(0)).toBeNull();
		expect(clampWaterMl(-100)).toBeNull();
		expect(clampWaterMl(Number.NaN)).toBeNull();
		expect(clampActivityCalories(0)).toBeNull();
		expect(clampActivityCalories(-5)).toBeNull();
	});

	test('rounds and caps at the maximum', () => {
		expect(clampWaterMl(249.6)).toBe(250);
		expect(clampWaterMl(999999)).toBe(MAX_WATER_ML);
		expect(clampActivityCalories(300.4)).toBe(300);
		expect(clampActivityCalories(999999)).toBe(MAX_ACTIVITY_CALORIES);
	});
});

describe('waterProgressPercent', () => {
	test('is zero when nothing is logged', () => {
		expect(waterProgressPercent(null, 2000)).toBe(0);
		expect(waterProgressPercent(0, 2000)).toBe(0);
	});

	test('reports rounded progress', () => {
		expect(waterProgressPercent(1000, 2000)).toBe(50);
		expect(waterProgressPercent(667, 2000)).toBe(33);
	});

	test('caps at 100', () => {
		expect(waterProgressPercent(5000, 2000)).toBe(100);
	});

	test('falls back to the default goal when the goal is unusable', () => {
		expect(waterProgressPercent(1000, 0)).toBe(waterProgressPercent(1000, DEFAULT_WATER_GOAL_ML));
	});
});
