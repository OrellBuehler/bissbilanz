import { describe, test, expect } from 'vitest';
import { supplementCreateSchema, supplementUpdateSchema } from '../../src/lib/server/validation';

const VALID_UUID = '10000000-0000-4000-8000-000000000001';

const baseSupplement = {
	name: 'Vitamin D',
	scheduleType: 'daily' as const,
	ingredients: [{ foodId: VALID_UUID, servings: 1, sortOrder: 0 }]
};

const parseCreate = (reminderTimes: unknown) =>
	supplementCreateSchema.safeParse({ ...baseSupplement, reminderTimes });

describe('supplementCreateSchema reminderTimes', () => {
	test('accepts well-formed HH:MM times', () => {
		const result = parseCreate(['08:00', '20:30']);
		expect(result.success).toBe(true);
		expect(result.success && result.data.reminderTimes).toEqual(['08:00', '20:30']);
	});

	test('accepts the extremes of the 24h clock', () => {
		expect(parseCreate(['00:00', '23:59']).success).toBe(true);
	});

	test('accepts an empty array (reminders cleared) and null', () => {
		expect(parseCreate([]).success).toBe(true);
		expect(parseCreate(null).success).toBe(true);
	});

	test('is optional — omitting it leaves the supplement valid', () => {
		expect(supplementCreateSchema.safeParse(baseSupplement).success).toBe(true);
	});

	test.each([['8:00'], ['24:00'], ['08:60'], ['08:00:00'], [''], ['0800'], ['08-00'], ['ab:cd']])(
		'rejects %s',
		(bad) => {
			expect(parseCreate([bad]).success).toBe(false);
		}
	);

	test('rejects more than six times', () => {
		const seven = ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00'];
		expect(parseCreate(seven).success).toBe(false);
		expect(parseCreate(seven.slice(0, 6)).success).toBe(true);
	});

	test('de-duplicates and sorts so the stored order is stable', () => {
		// iOS derives notification identifiers from these; a reshuffle on every save
		// would churn the whole pending set.
		const result = parseCreate(['20:00', '08:00', '20:00', '12:30']);
		expect(result.success).toBe(true);
		expect(result.success && result.data.reminderTimes).toEqual(['08:00', '12:30', '20:00']);
	});
});

describe('supplementUpdateSchema reminderTimes', () => {
	test('accepts a partial update carrying only reminderTimes', () => {
		const result = supplementUpdateSchema.safeParse({ reminderTimes: ['09:15'] });
		expect(result.success).toBe(true);
		expect(result.success && result.data.reminderTimes).toEqual(['09:15']);
	});

	test('clears reminders with an empty array', () => {
		const result = supplementUpdateSchema.safeParse({ reminderTimes: [] });
		expect(result.success).toBe(true);
		expect(result.success && result.data.reminderTimes).toEqual([]);
	});

	test('leaves reminderTimes undefined when omitted, so a PATCH cannot clobber it', () => {
		const result = supplementUpdateSchema.safeParse({ name: 'Renamed' });
		expect(result.success).toBe(true);
		expect(result.success && result.data.reminderTimes).toBeUndefined();
	});

	test('applies the same format and cardinality rules as create', () => {
		expect(supplementUpdateSchema.safeParse({ reminderTimes: ['24:00'] }).success).toBe(false);
		expect(
			supplementUpdateSchema.safeParse({
				reminderTimes: ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00']
			}).success
		).toBe(false);
	});
});
