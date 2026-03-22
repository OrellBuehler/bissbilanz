import { describe, it, expect } from 'vitest';
import { sleepCreateSchema, sleepUpdateSchema } from '$lib/server/validation/sleep';
import { analyticsDateRangeSchema } from '$lib/server/validation/analytics';

describe('sleepCreateSchema', () => {
	it('accepts valid input', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 8,
			entryDate: '2026-03-01'
		});
		expect(result.success).toBe(true);
	});

	it('rejects quality < 1', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 0,
			entryDate: '2026-03-01'
		});
		expect(result.success).toBe(false);
	});

	it('accepts quality = 1 (boundary)', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 1,
			entryDate: '2026-03-01'
		});
		expect(result.success).toBe(true);
	});

	it('rejects quality > 10', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 11,
			entryDate: '2026-03-01'
		});
		expect(result.success).toBe(false);
	});

	it('accepts quality = 10 (boundary)', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 10,
			entryDate: '2026-03-01'
		});
		expect(result.success).toBe(true);
	});

	it('rejects durationMinutes <= 0', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 0,
			quality: 8,
			entryDate: '2026-03-01'
		});
		expect(result.success).toBe(false);
	});

	it('accepts durationMinutes = 1 (boundary)', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 1,
			quality: 8,
			entryDate: '2026-03-01'
		});
		expect(result.success).toBe(true);
	});

	it('rejects durationMinutes > 1440', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 1441,
			quality: 8,
			entryDate: '2026-03-01'
		});
		expect(result.success).toBe(false);
	});

	it('accepts durationMinutes = 1440 (boundary)', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 1440,
			quality: 8,
			entryDate: '2026-03-01'
		});
		expect(result.success).toBe(true);
	});

	it('rejects invalid date format', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 8,
			entryDate: '01/03/2026'
		});
		expect(result.success).toBe(false);
	});

	it('rejects date with extra text', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 8,
			entryDate: '2026-03-01T00:00:00Z'
		});
		expect(result.success).toBe(false);
	});

	it('accepts optional fields as null', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 8,
			entryDate: '2026-03-01',
			bedtime: null,
			wakeTime: null,
			wakeUps: null,
			notes: null
		});
		expect(result.success).toBe(true);
	});

	it('accepts optional fields as undefined (omitted)', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 8,
			entryDate: '2026-03-01'
		});
		expect(result.success).toBe(true);
	});

	it('accepts valid ISO datetime for bedtime', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 8,
			entryDate: '2026-03-01',
			bedtime: '2026-02-28T22:00:00.000Z'
		});
		expect(result.success).toBe(true);
	});

	it('rejects non-ISO string for bedtime', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 8,
			entryDate: '2026-03-01',
			bedtime: '22:00'
		});
		expect(result.success).toBe(false);
	});

	it('rejects notes > 2000 chars', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 8,
			entryDate: '2026-03-01',
			notes: 'a'.repeat(2001)
		});
		expect(result.success).toBe(false);
	});

	it('accepts notes exactly 2000 chars', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 8,
			entryDate: '2026-03-01',
			notes: 'a'.repeat(2000)
		});
		expect(result.success).toBe(true);
	});

	it('coerces string durationMinutes to number', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: '480',
			quality: 8,
			entryDate: '2026-03-01'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.durationMinutes).toBe(480);
		}
	});

	it('coerces string quality to number', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: '8',
			entryDate: '2026-03-01'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.quality).toBe(8);
		}
	});

	it('rejects negative wakeUps', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 8,
			entryDate: '2026-03-01',
			wakeUps: -1
		});
		expect(result.success).toBe(false);
	});

	it('accepts wakeUps = 0', () => {
		const result = sleepCreateSchema.safeParse({
			durationMinutes: 480,
			quality: 8,
			entryDate: '2026-03-01',
			wakeUps: 0
		});
		expect(result.success).toBe(true);
	});
});

describe('sleepUpdateSchema', () => {
	it('accepts empty object (all fields optional)', () => {
		const result = sleepUpdateSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it('accepts partial update with quality only', () => {
		const result = sleepUpdateSchema.safeParse({ quality: 5 });
		expect(result.success).toBe(true);
	});

	it('rejects quality out of range on update', () => {
		const result = sleepUpdateSchema.safeParse({ quality: 11 });
		expect(result.success).toBe(false);
	});

	it('accepts null to clear notes', () => {
		const result = sleepUpdateSchema.safeParse({ notes: null });
		expect(result.success).toBe(true);
	});
});

describe('analyticsDateRangeSchema', () => {
	it('accepts valid date range', () => {
		const result = analyticsDateRangeSchema.safeParse({
			startDate: '2026-01-01',
			endDate: '2026-03-01'
		});
		expect(result.success).toBe(true);
	});

	it('rejects startDate > endDate', () => {
		const result = analyticsDateRangeSchema.safeParse({
			startDate: '2026-03-01',
			endDate: '2026-01-01'
		});
		expect(result.success).toBe(false);
	});

	it('accepts startDate == endDate (same day)', () => {
		const result = analyticsDateRangeSchema.safeParse({
			startDate: '2026-01-01',
			endDate: '2026-01-01'
		});
		expect(result.success).toBe(true);
	});

	it('rejects range > 366 days', () => {
		const result = analyticsDateRangeSchema.safeParse({
			startDate: '2024-01-01',
			endDate: '2026-01-01'
		});
		expect(result.success).toBe(false);
	});

	it('accepts exactly 366 days', () => {
		const result = analyticsDateRangeSchema.safeParse({
			startDate: '2025-01-01',
			endDate: '2026-01-02'
		});
		expect(result.success).toBe(true);
	});

	it('rejects invalid date format for startDate', () => {
		const result = analyticsDateRangeSchema.safeParse({
			startDate: '01/01/2026',
			endDate: '2026-03-01'
		});
		expect(result.success).toBe(false);
	});

	it('rejects invalid date format for endDate', () => {
		const result = analyticsDateRangeSchema.safeParse({
			startDate: '2026-01-01',
			endDate: 'March 2026'
		});
		expect(result.success).toBe(false);
	});

	it('rejects missing startDate', () => {
		const result = analyticsDateRangeSchema.safeParse({ endDate: '2026-03-01' });
		expect(result.success).toBe(false);
	});

	it('rejects missing endDate', () => {
		const result = analyticsDateRangeSchema.safeParse({ startDate: '2026-01-01' });
		expect(result.success).toBe(false);
	});
});
