import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER } from '../helpers/fixtures';

const { db, setResult, setError, reset } = createMockDB();

const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const {
	createSleepEntry,
	getSleepEntries,
	getSleepEntriesByDateRange,
	getLatestSleep,
	updateSleepEntry,
	deleteSleepEntry
} = await import('$lib/server/sleep');

const TEST_SLEEP_ENTRY = {
	id: '20000000-0000-4000-8000-000000000090',
	userId: TEST_USER.id,
	entryDate: '2026-03-01',
	durationMinutes: 480,
	quality: 8,
	bedtime: new Date('2026-02-28T22:00:00Z'),
	wakeTime: new Date('2026-03-01T06:00:00Z'),
	wakeUps: 1,
	notes: 'Good sleep',
	loggedAt: new Date('2026-03-01T06:05:00Z'),
	createdAt: new Date('2026-03-01T06:05:00Z'),
	updatedAt: null
};

const VALID_SLEEP_PAYLOAD = {
	durationMinutes: 480,
	quality: 8,
	entryDate: '2026-03-01'
};

describe('sleep-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('createSleepEntry', () => {
		test('creates entry with valid payload', async () => {
			setResult([TEST_SLEEP_ENTRY]);

			const result = await createSleepEntry(TEST_USER.id, VALID_SLEEP_PAYLOAD);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.durationMinutes).toBe(480);
				expect(result.data.quality).toBe(8);
				expect(result.data.entryDate).toBe('2026-03-01');
			}
		});

		test('creates entry with all optional fields', async () => {
			const fullEntry = {
				...TEST_SLEEP_ENTRY,
				bedtime: new Date('2026-02-28T22:00:00Z'),
				wakeTime: new Date('2026-03-01T06:00:00Z'),
				wakeUps: 2,
				notes: 'Woke up twice'
			};
			setResult([fullEntry]);

			const result = await createSleepEntry(TEST_USER.id, {
				...VALID_SLEEP_PAYLOAD,
				bedtime: '2026-02-28T22:00:00.000Z',
				wakeTime: '2026-03-01T06:00:00.000Z',
				wakeUps: 2,
				notes: 'Woke up twice'
			});
			expect(result.success).toBe(true);
		});

		test('returns validation error for quality 0', async () => {
			const result = await createSleepEntry(TEST_USER.id, {
				...VALID_SLEEP_PAYLOAD,
				quality: 0
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns validation error for quality 11', async () => {
			const result = await createSleepEntry(TEST_USER.id, {
				...VALID_SLEEP_PAYLOAD,
				quality: 11
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns validation error for duration 0', async () => {
			const result = await createSleepEntry(TEST_USER.id, {
				...VALID_SLEEP_PAYLOAD,
				durationMinutes: 0
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns validation error for duration 1441', async () => {
			const result = await createSleepEntry(TEST_USER.id, {
				...VALID_SLEEP_PAYLOAD,
				durationMinutes: 1441
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('accepts boundary values quality=1 and quality=10', async () => {
			setResult([{ ...TEST_SLEEP_ENTRY, quality: 1 }]);
			const result1 = await createSleepEntry(TEST_USER.id, { ...VALID_SLEEP_PAYLOAD, quality: 1 });
			expect(result1.success).toBe(true);

			setResult([{ ...TEST_SLEEP_ENTRY, quality: 10 }]);
			const result10 = await createSleepEntry(TEST_USER.id, {
				...VALID_SLEEP_PAYLOAD,
				quality: 10
			});
			expect(result10.success).toBe(true);
		});

		test('accepts boundary values duration=1 and duration=1440', async () => {
			setResult([{ ...TEST_SLEEP_ENTRY, durationMinutes: 1 }]);
			const result1 = await createSleepEntry(TEST_USER.id, {
				...VALID_SLEEP_PAYLOAD,
				durationMinutes: 1
			});
			expect(result1.success).toBe(true);

			setResult([{ ...TEST_SLEEP_ENTRY, durationMinutes: 1440 }]);
			const result1440 = await createSleepEntry(TEST_USER.id, {
				...VALID_SLEEP_PAYLOAD,
				durationMinutes: 1440
			});
			expect(result1440.success).toBe(true);
		});

		test('returns error when DB insert fails', async () => {
			setError(new Error('DB connection failed'));

			const result = await createSleepEntry(TEST_USER.id, VALID_SLEEP_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toContain('DB connection failed');
			}
		});
	});

	describe('getSleepEntries', () => {
		test('returns entries for user sorted by date desc', async () => {
			const entry1 = { ...TEST_SLEEP_ENTRY, entryDate: '2026-03-02' };
			const entry2 = { ...TEST_SLEEP_ENTRY, entryDate: '2026-03-01' };
			setResult([entry1, entry2]);

			const entries = await getSleepEntries(TEST_USER.id);
			expect(entries).toHaveLength(2);
			expect(entries[0].entryDate).toBe('2026-03-02');
			expect(entries[1].entryDate).toBe('2026-03-01');
		});

		test('returns empty array when no entries', async () => {
			setResult([]);
			const entries = await getSleepEntries(TEST_USER.id);
			expect(entries).toEqual([]);
		});
	});

	describe('getSleepEntriesByDateRange', () => {
		test('returns entries within date range', async () => {
			const entries = [
				{ ...TEST_SLEEP_ENTRY, entryDate: '2026-03-05' },
				{ ...TEST_SLEEP_ENTRY, entryDate: '2026-03-03' },
				{ ...TEST_SLEEP_ENTRY, entryDate: '2026-03-01' }
			];
			setResult(entries);

			const result = await getSleepEntriesByDateRange(TEST_USER.id, '2026-03-01', '2026-03-05');
			expect(result).toHaveLength(3);
		});

		test('returns empty array when no entries in range', async () => {
			setResult([]);
			const result = await getSleepEntriesByDateRange(TEST_USER.id, '2026-04-01', '2026-04-30');
			expect(result).toEqual([]);
		});
	});

	describe('getLatestSleep', () => {
		test('returns latest entry when it exists', async () => {
			setResult([TEST_SLEEP_ENTRY]);
			const entry = await getLatestSleep(TEST_USER.id);
			expect(entry).toEqual(TEST_SLEEP_ENTRY);
		});

		test('returns null when no entries exist', async () => {
			setResult([]);
			const entry = await getLatestSleep(TEST_USER.id);
			expect(entry).toBeNull();
		});
	});

	describe('updateSleepEntry', () => {
		test('updates entry with valid payload', async () => {
			const updated = { ...TEST_SLEEP_ENTRY, durationMinutes: 420, quality: 6 };
			setResult([updated]);

			const result = await updateSleepEntry(TEST_USER.id, TEST_SLEEP_ENTRY.id, {
				durationMinutes: 420,
				quality: 6
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.durationMinutes).toBe(420);
				expect(result.data?.quality).toBe(6);
			}
		});

		test('updates notes field', async () => {
			const updated = { ...TEST_SLEEP_ENTRY, notes: 'Updated notes' };
			setResult([updated]);

			const result = await updateSleepEntry(TEST_USER.id, TEST_SLEEP_ENTRY.id, {
				notes: 'Updated notes'
			});
			expect(result.success).toBe(true);
		});

		test('clears notes when set to null', async () => {
			const updated = { ...TEST_SLEEP_ENTRY, notes: null };
			setResult([updated]);

			const result = await updateSleepEntry(TEST_USER.id, TEST_SLEEP_ENTRY.id, {
				notes: null
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.notes).toBeNull();
			}
		});

		test('returns validation error for quality out of range', async () => {
			const result = await updateSleepEntry(TEST_USER.id, TEST_SLEEP_ENTRY.id, { quality: 11 });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns undefined data when entry not found', async () => {
			setResult([]);

			const result = await updateSleepEntry(TEST_USER.id, 'nonexistent-id', { quality: 5 });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeUndefined();
			}
		});
	});

	describe('deleteSleepEntry', () => {
		test('returns true when entry deleted', async () => {
			setResult([TEST_SLEEP_ENTRY]);
			const deleted = await deleteSleepEntry(TEST_USER.id, TEST_SLEEP_ENTRY.id);
			expect(deleted).toBe(true);
		});

		test('returns false when entry not found', async () => {
			setResult([]);
			const deleted = await deleteSleepEntry(TEST_USER.id, 'nonexistent-id');
			expect(deleted).toBe(false);
		});
	});
});
