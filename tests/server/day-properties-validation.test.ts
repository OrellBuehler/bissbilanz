import { describe, test, expect } from 'vitest';
import { dayPropertiesSetSchema } from '../../src/lib/server/validation/day-properties';

describe('dayPropertiesSetSchema', () => {
	test('accepts a date-only payload (nothing changes)', () => {
		const result = dayPropertiesSetSchema.safeParse({ date: '2026-03-01' });
		expect(result.success).toBe(true);
		expect(result.data).toEqual({ date: '2026-03-01' });
	});

	test('rejects an invalid date', () => {
		expect(dayPropertiesSetSchema.safeParse({ date: '01-03-2026' }).success).toBe(false);
	});

	test('keeps omitted fields out of the parsed payload', () => {
		const result = dayPropertiesSetSchema.safeParse({ date: '2026-03-01', notes: 'rest day' });
		expect(result.success).toBe(true);
		expect('waterMl' in result.data!).toBe(false);
		expect('isFastingDay' in result.data!).toBe(false);
	});

	test('keeps an explicit null so the field can be cleared', () => {
		const result = dayPropertiesSetSchema.safeParse({
			date: '2026-03-01',
			notes: null,
			waterMl: null,
			activityCalories: null,
			activityNote: null
		});
		expect(result.success).toBe(true);
		expect(result.data).toEqual({
			date: '2026-03-01',
			notes: null,
			waterMl: null,
			activityCalories: null,
			activityNote: null
		});
	});

	test('accepts a full payload', () => {
		const result = dayPropertiesSetSchema.safeParse({
			date: '2026-03-01',
			isFastingDay: true,
			notes: 'travel day',
			waterMl: 2500,
			activityCalories: 600,
			activityNote: '45 min run'
		});
		expect(result.success).toBe(true);
	});

	test('coerces numeric strings', () => {
		const result = dayPropertiesSetSchema.safeParse({
			date: '2026-03-01',
			waterMl: '1500',
			activityCalories: '250'
		});
		expect(result.success).toBe(true);
		expect(result.data?.waterMl).toBe(1500);
		expect(result.data?.activityCalories).toBe(250);
	});

	test('rejects negative water and activity', () => {
		expect(dayPropertiesSetSchema.safeParse({ date: '2026-03-01', waterMl: -1 }).success).toBe(
			false
		);
		expect(
			dayPropertiesSetSchema.safeParse({ date: '2026-03-01', activityCalories: -1 }).success
		).toBe(false);
	});

	test('rejects non-integer water', () => {
		expect(dayPropertiesSetSchema.safeParse({ date: '2026-03-01', waterMl: 100.5 }).success).toBe(
			false
		);
	});

	test('rejects out-of-range values', () => {
		expect(dayPropertiesSetSchema.safeParse({ date: '2026-03-01', waterMl: 20001 }).success).toBe(
			false
		);
		expect(
			dayPropertiesSetSchema.safeParse({ date: '2026-03-01', activityCalories: 20001 }).success
		).toBe(false);
	});

	test('rejects an over-long note', () => {
		expect(
			dayPropertiesSetSchema.safeParse({ date: '2026-03-01', notes: 'x'.repeat(2001) }).success
		).toBe(false);
		expect(
			dayPropertiesSetSchema.safeParse({ date: '2026-03-01', activityNote: 'x'.repeat(201) })
				.success
		).toBe(false);
	});
});
