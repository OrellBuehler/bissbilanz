import { describe, test, expect } from 'vitest';
import { reminderCreateSchema, reminderUpdateSchema } from '../../src/lib/server/validation';

describe('reminderCreateSchema', () => {
	test('accepts a minimal weight reminder and defaults weekdays to every day', () => {
		const result = reminderCreateSchema.safeParse({ kind: 'weight', time: '08:00' });
		expect(result.success).toBe(true);
		expect(result.success && result.data.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(result.success && result.data.enabled).toBeUndefined();
	});

	test('accepts a sleep reminder without mealType', () => {
		expect(reminderCreateSchema.safeParse({ kind: 'sleep', time: '07:30' }).success).toBe(true);
	});

	test('requires mealType when kind is meal', () => {
		const result = reminderCreateSchema.safeParse({ kind: 'meal', time: '12:00' });
		expect(result.success).toBe(false);
	});

	test('accepts a meal reminder with mealType', () => {
		const result = reminderCreateSchema.safeParse({
			kind: 'meal',
			mealType: 'Lunch',
			time: '12:00'
		});
		expect(result.success).toBe(true);
		expect(result.success && result.data.mealType).toBe('Lunch');
	});

	test('rejects mealType on a non-meal kind', () => {
		const result = reminderCreateSchema.safeParse({
			kind: 'weight',
			mealType: 'Lunch',
			time: '08:00'
		});
		expect(result.success).toBe(false);
	});

	test.each([['8:00'], ['24:00'], ['08:60'], ['08:00:00'], [''], ['0800']])(
		'rejects malformed time %s',
		(bad) => {
			expect(reminderCreateSchema.safeParse({ kind: 'weight', time: bad }).success).toBe(false);
		}
	);

	test('dedupes and sorts weekdays', () => {
		const result = reminderCreateSchema.safeParse({
			kind: 'weight',
			time: '08:00',
			weekdays: [3, 1, 3, 0]
		});
		expect(result.success).toBe(true);
		expect(result.success && result.data.weekdays).toEqual([0, 1, 3]);
	});

	test('rejects an out-of-range weekday', () => {
		expect(
			reminderCreateSchema.safeParse({ kind: 'weight', time: '08:00', weekdays: [7] }).success
		).toBe(false);
	});

	test('rejects an invalid kind', () => {
		expect(reminderCreateSchema.safeParse({ kind: 'sleeping', time: '08:00' }).success).toBe(false);
	});

	test('requires kind and time', () => {
		expect(reminderCreateSchema.safeParse({}).success).toBe(false);
		expect(reminderCreateSchema.safeParse({ kind: 'weight' }).success).toBe(false);
	});
});

describe('reminderUpdateSchema', () => {
	test('accepts a partial update carrying only time', () => {
		const result = reminderUpdateSchema.safeParse({ time: '09:15' });
		expect(result.success).toBe(true);
		expect(result.success && result.data.weekdays).toBeUndefined();
	});

	test('leaves weekdays undefined when omitted, so a PATCH cannot clobber it', () => {
		const result = reminderUpdateSchema.safeParse({ enabled: false });
		expect(result.success).toBe(true);
		expect(result.success && result.data.weekdays).toBeUndefined();
	});

	test('rejects an empty weekdays array (cannot clear to zero days)', () => {
		expect(reminderUpdateSchema.safeParse({ weekdays: [] }).success).toBe(false);
	});

	test('dedupes and sorts weekdays when provided', () => {
		const result = reminderUpdateSchema.safeParse({ weekdays: [5, 2, 2] });
		expect(result.success).toBe(true);
		expect(result.success && result.data.weekdays).toEqual([2, 5]);
	});

	test('switching kind to meal requires mealType', () => {
		expect(reminderUpdateSchema.safeParse({ kind: 'meal' }).success).toBe(false);
		expect(reminderUpdateSchema.safeParse({ kind: 'meal', mealType: 'Dinner' }).success).toBe(true);
	});

	test('switching kind away from meal rejects a lingering mealType', () => {
		expect(reminderUpdateSchema.safeParse({ kind: 'weight', mealType: 'Dinner' }).success).toBe(
			false
		);
	});

	test('mealType alone (no kind change) is not constrained by the refine', () => {
		// The domain layer resolves this against the stored kind; the schema only
		// enforces the pairing when `kind` itself is part of the payload.
		expect(reminderUpdateSchema.safeParse({ mealType: 'Dinner' }).success).toBe(true);
	});

	test('applies the same time format rule as create', () => {
		expect(reminderUpdateSchema.safeParse({ time: '24:00' }).success).toBe(false);
	});
});
