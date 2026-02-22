import { describe, expect, test } from 'bun:test';
import {
	mergeMealTypes,
	parseTimeToMinutes,
	resolveMealTypeForMinute,
	validateFavoriteMealTimeframes
} from '../../src/lib/utils/meals';

describe('mergeMealTypes', () => {
	test('appends custom meal types after defaults', () => {
		const merged = mergeMealTypes(['Breakfast', 'Lunch'], ['Snack 2']);
		expect(merged).toEqual(['Breakfast', 'Lunch', 'Snack 2']);
	});
});

describe('parseTimeToMinutes', () => {
	test('parses HH:mm values', () => {
		expect(parseTimeToMinutes('08:00')).toBe(480);
		expect(parseTimeToMinutes('23:59')).toBe(1439);
	});

	test('returns null for invalid values', () => {
		expect(parseTimeToMinutes('24:00')).toBeNull();
		expect(parseTimeToMinutes('8:00')).toBeNull();
		expect(parseTimeToMinutes('12:60')).toBeNull();
	});
});

describe('validateFavoriteMealTimeframes', () => {
	test('accepts sorted non-overlapping windows', () => {
		const result = validateFavoriteMealTimeframes([
			{ mealType: 'Breakfast', startTime: '08:00', endTime: '10:00' },
			{ mealType: 'Lunch', startTime: '11:00', endTime: '13:00' }
		]);

		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.normalized).toEqual([
				{ mealType: 'Breakfast', startMinute: 480, endMinute: 600 },
				{ mealType: 'Lunch', startMinute: 660, endMinute: 780 }
			]);
		}
	});

	test('rejects overlapping windows', () => {
		const result = validateFavoriteMealTimeframes([
			{ mealType: 'Breakfast', startTime: '08:00', endTime: '10:30' },
			{ mealType: 'Lunch', startTime: '10:00', endTime: '13:00' }
		]);

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toBe('overlap');
		}
	});

	test('rejects cross-midnight windows', () => {
		const result = validateFavoriteMealTimeframes([
			{ mealType: 'Late meal', startTime: '22:00', endTime: '02:00' }
		]);

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toBe('invalid-range');
		}
	});

	test('rejects empty meal type', () => {
		const result = validateFavoriteMealTimeframes([
			{ mealType: '', startTime: '08:00', endTime: '09:00' }
		]);
		expect(result.valid).toBe(false);
	});
});

describe('resolveMealTypeForMinute', () => {
	test('returns matched meal for minute inside configured range', () => {
		const meal = resolveMealTypeForMinute(700, [
			{ mealType: 'Breakfast', startMinute: 480, endMinute: 600 },
			{ mealType: 'Lunch', startMinute: 660, endMinute: 780 }
		]);

		expect(meal).toBe('Lunch');
	});

	test('returns null when no range matches', () => {
		const meal = resolveMealTypeForMinute(640, [
			{ mealType: 'Breakfast', startMinute: 480, endMinute: 600 },
			{ mealType: 'Lunch', startMinute: 660, endMinute: 780 }
		]);

		expect(meal).toBeNull();
	});

	test('treats end minute as exclusive', () => {
		const meal = resolveMealTypeForMinute(600, [
			{ mealType: 'Breakfast', startMinute: 480, endMinute: 600 }
		]);

		expect(meal).toBeNull();
	});
});
