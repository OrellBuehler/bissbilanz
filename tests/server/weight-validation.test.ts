import { describe, test, expect } from 'bun:test';
import { weightCreateSchema, weightUpdateSchema } from '../../src/lib/server/validation';

describe('weightCreateSchema', () => {
	test('validates complete payload', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: 75.5,
			entryDate: '2026-02-10'
		});
		expect(result.success).toBe(true);
	});

	test('accepts optional notes', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: 75.5,
			entryDate: '2026-02-10',
			notes: 'Morning weigh-in'
		});
		expect(result.success).toBe(true);
	});

	test('accepts null notes', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: 75.5,
			entryDate: '2026-02-10',
			notes: null
		});
		expect(result.success).toBe(true);
	});

	test('rejects missing weightKg', () => {
		const result = weightCreateSchema.safeParse({
			entryDate: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('rejects missing entryDate', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: 75.5
		});
		expect(result.success).toBe(false);
	});

	test('rejects zero weight', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: 0,
			entryDate: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('rejects negative weight', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: -10,
			entryDate: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('rejects weight above 500', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: 501,
			entryDate: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('accepts weight at boundary (500)', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: 500,
			entryDate: '2026-02-10'
		});
		expect(result.success).toBe(true);
	});

	test('accepts small positive weight', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: 0.1,
			entryDate: '2026-02-10'
		});
		expect(result.success).toBe(true);
	});

	test('coerces string weight to number', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: '80.5',
			entryDate: '2026-02-10'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.weightKg).toBe(80.5);
		}
	});

	test('rejects invalid date format (MM-DD-YYYY)', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: 75,
			entryDate: '02-10-2026'
		});
		expect(result.success).toBe(false);
	});

	test('rejects invalid date format (no dashes)', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: 75,
			entryDate: '20260210'
		});
		expect(result.success).toBe(false);
	});

	test('rejects date with time', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: 75,
			entryDate: '2026-02-10T08:00:00Z'
		});
		expect(result.success).toBe(false);
	});

	test('rejects non-numeric weight string', () => {
		const result = weightCreateSchema.safeParse({
			weightKg: 'heavy',
			entryDate: '2026-02-10'
		});
		expect(result.success).toBe(false);
	});

	test('rejects empty object', () => {
		const result = weightCreateSchema.safeParse({});
		expect(result.success).toBe(false);
	});
});

describe('weightUpdateSchema', () => {
	test('allows updating only weightKg', () => {
		const result = weightUpdateSchema.safeParse({
			weightKg: 76.0
		});
		expect(result.success).toBe(true);
	});

	test('allows updating only entryDate', () => {
		const result = weightUpdateSchema.safeParse({
			entryDate: '2026-02-11'
		});
		expect(result.success).toBe(true);
	});

	test('allows updating only notes', () => {
		const result = weightUpdateSchema.safeParse({
			notes: 'Updated note'
		});
		expect(result.success).toBe(true);
	});

	test('allows empty update (all fields optional)', () => {
		const result = weightUpdateSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	test('rejects negative weight in update', () => {
		const result = weightUpdateSchema.safeParse({
			weightKg: -5
		});
		expect(result.success).toBe(false);
	});

	test('rejects weight above 500 in update', () => {
		const result = weightUpdateSchema.safeParse({
			weightKg: 600
		});
		expect(result.success).toBe(false);
	});

	test('rejects invalid date format in update', () => {
		const result = weightUpdateSchema.safeParse({
			entryDate: 'bad-date'
		});
		expect(result.success).toBe(false);
	});

	test('allows setting notes to null', () => {
		const result = weightUpdateSchema.safeParse({
			notes: null
		});
		expect(result.success).toBe(true);
	});

	test('allows updating all fields at once', () => {
		const result = weightUpdateSchema.safeParse({
			weightKg: 77.3,
			entryDate: '2026-02-15',
			notes: 'After lunch'
		});
		expect(result.success).toBe(true);
	});
});
