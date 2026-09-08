import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER } from '../helpers/fixtures';

const { db, setResult, reset, getCalls } = createMockDB();

const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const {
	getDayProperties,
	getDayPropertiesRange,
	setDayProperties,
	deleteDayProperties,
	getFastingDays,
	getFastingDaysForDates
} = await import('$lib/server/day-properties');

const TEST_DAY_PROPS = {
	date: '2026-03-01',
	isFastingDay: false
};

const TEST_DAY_PROPS_FASTING = {
	date: '2026-03-10',
	isFastingDay: true
};

describe('day-properties-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('getDayProperties', () => {
		test('returns day properties when found', async () => {
			setResult([TEST_DAY_PROPS]);

			const result = await getDayProperties(TEST_USER.id, '2026-03-01');
			expect(result).toEqual(TEST_DAY_PROPS);
		});

		test('returns null when not found', async () => {
			setResult([]);

			const result = await getDayProperties(TEST_USER.id, '2026-03-01');
			expect(result).toBeNull();
		});
	});

	describe('getDayPropertiesRange', () => {
		test('returns multiple results in range', async () => {
			const rows = [TEST_DAY_PROPS, TEST_DAY_PROPS_FASTING];
			setResult(rows);

			const result = await getDayPropertiesRange(TEST_USER.id, '2026-03-01', '2026-03-31');
			expect(result).toEqual(rows);
		});

		test('returns empty array for empty range', async () => {
			setResult([]);

			const result = await getDayPropertiesRange(TEST_USER.id, '2026-01-01', '2026-01-31');
			expect(result).toEqual([]);
		});
	});

	describe('setDayProperties', () => {
		test('returns the upserted row on create', async () => {
			setResult([TEST_DAY_PROPS]);

			const result = await setDayProperties(TEST_USER.id, '2026-03-01', { isFastingDay: false });
			expect(result).toEqual(TEST_DAY_PROPS);
		});

		test('returns the upserted row on update', async () => {
			const updated = { date: '2026-03-01', isFastingDay: true };
			setResult([updated]);

			const result = await setDayProperties(TEST_USER.id, '2026-03-01', { isFastingDay: true });
			expect(result).toEqual(updated);
		});
	});

	describe('setDayProperties (patch)', () => {
		test('accepts a note-only patch without touching the fasting flag', async () => {
			const updated = { date: '2026-03-01', isFastingDay: false, notes: 'long run day' };
			setResult([updated]);

			const result = await setDayProperties(TEST_USER.id, '2026-03-01', { notes: 'long run day' });
			expect(result).toEqual(updated);
		});

		test('accepts water and activity fields', async () => {
			const updated = {
				date: '2026-03-01',
				isFastingDay: false,
				waterMl: 1500,
				activityCalories: 420,
				activityNote: '45 min run'
			};
			setResult([updated]);

			const result = await setDayProperties(TEST_USER.id, '2026-03-01', {
				waterMl: 1500,
				activityCalories: 420,
				activityNote: '45 min run'
			});
			expect(result).toEqual(updated);
		});
	});

	describe('setDayProperties (empty row cleanup)', () => {
		test('drops the row when the merged result carries no data', async () => {
			setResult([
				{
					date: '2026-03-01',
					isFastingDay: false,
					notes: null,
					waterMl: null,
					activityCalories: null,
					activityNote: null
				}
			]);

			await setDayProperties(TEST_USER.id, '2026-03-01', { isFastingDay: false });
			expect(getCalls().some((call) => call.method === 'delete')).toBe(true);
		});

		test('keeps the row when any field still holds data', async () => {
			setResult([
				{
					date: '2026-03-01',
					isFastingDay: false,
					notes: 'rest day',
					waterMl: null,
					activityCalories: null,
					activityNote: null
				}
			]);

			await setDayProperties(TEST_USER.id, '2026-03-01', { isFastingDay: false });
			expect(getCalls().some((call) => call.method === 'delete')).toBe(false);
		});
	});

	describe('deleteDayProperties', () => {
		test("returns 'deleted' when a row was deleted", async () => {
			setResult([
				{ date: '2026-03-01', userId: TEST_USER.id, isFastingDay: false, updatedAt: new Date() }
			]);

			const result = await deleteDayProperties(TEST_USER.id, '2026-03-01');
			expect(result).toBe('deleted');
		});

		test("returns 'missing' when no rows affected", async () => {
			setResult([]);

			const result = await deleteDayProperties(TEST_USER.id, '2026-03-99');
			expect(result).toBe('missing');
		});

		test("returns 'stale' when the server row is newer than the client edit", async () => {
			setResult([{ updatedAt: new Date('2026-03-02T10:00:00Z') }]);

			const result = await deleteDayProperties(
				TEST_USER.id,
				'2026-03-01',
				new Date('2026-03-01T10:00:00Z')
			);
			expect(result).toBe('stale');
			expect(getCalls().some((call) => call.method === 'delete')).toBe(false);
		});

		test('deletes when the client edit is at least as new as the row', async () => {
			setResult([{ updatedAt: new Date('2026-03-01T10:00:00Z') }]);

			const result = await deleteDayProperties(
				TEST_USER.id,
				'2026-03-01',
				new Date('2026-03-01T12:00:00Z')
			);
			expect(result).toBe('deleted');
		});
	});

	describe('getFastingDays', () => {
		test('returns a set of fasting dates in range', async () => {
			setResult([{ date: '2026-03-10' }, { date: '2026-03-15' }]);

			const result = await getFastingDays(TEST_USER.id, '2026-03-01', '2026-03-31');
			expect(result).toBeInstanceOf(Set);
			expect(result.has('2026-03-10')).toBe(true);
			expect(result.has('2026-03-15')).toBe(true);
			expect(result.size).toBe(2);
		});

		test('returns empty set when no fasting days in range', async () => {
			setResult([]);

			const result = await getFastingDays(TEST_USER.id, '2026-01-01', '2026-01-31');
			expect(result).toBeInstanceOf(Set);
			expect(result.size).toBe(0);
		});
	});

	describe('getFastingDaysForDates', () => {
		test('returns a set of fasting dates for specific dates', async () => {
			setResult([{ date: '2026-03-10' }]);

			const result = await getFastingDaysForDates(TEST_USER.id, ['2026-03-10', '2026-03-11']);
			expect(result).toBeInstanceOf(Set);
			expect(result.has('2026-03-10')).toBe(true);
			expect(result.has('2026-03-11')).toBe(false);
		});

		test('returns empty set for empty dates array without querying db', async () => {
			const result = await getFastingDaysForDates(TEST_USER.id, []);
			expect(result).toBeInstanceOf(Set);
			expect(result.size).toBe(0);
		});
	});
});
