import { describe, expect, test } from 'vitest';
import { toEntryUpdate } from '$lib/server/entries';

describe('toEntryUpdate', () => {
	test('maps partial update fields', () => {
		const row = toEntryUpdate({ servings: 1.5, mealType: 'Lunch' });
		expect(row.servings).toBe(1.5);
		expect(row.mealType).toBe('Lunch');
	});

	test('converts eatenAt string to Date object', () => {
		const row = toEntryUpdate({ eatenAt: '2026-02-10T08:30:00+01:00' });
		expect(row.eatenAt).toBeInstanceOf(Date);
		expect((row.eatenAt as Date).toISOString()).toBe('2026-02-10T07:30:00.000Z');
	});

	test('defaults falsy eatenAt to current time', () => {
		const before = new Date();
		// @ts-expect-error - testing runtime behavior with null
		const row = toEntryUpdate({ eatenAt: null });
		expect(Object.prototype.hasOwnProperty.call(row, 'eatenAt')).toBe(true);
		expect(row.eatenAt).toBeInstanceOf(Date);
		expect((row.eatenAt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
	});

	test('omits eatenAt key when not provided', () => {
		const row = toEntryUpdate({ servings: 2 });
		expect(Object.prototype.hasOwnProperty.call(row, 'eatenAt')).toBe(false);
	});

	test('normalizes notes to null when undefined', () => {
		const row = toEntryUpdate({ servings: 1 });
		expect(row.notes).toBeNull();
	});

	test('preserves notes string value', () => {
		const row = toEntryUpdate({ notes: 'Extra portion' });
		expect(row.notes).toBe('Extra portion');
	});

	test('preserves notes null value', () => {
		const row = toEntryUpdate({ notes: null });
		expect(row.notes).toBeNull();
	});
});
