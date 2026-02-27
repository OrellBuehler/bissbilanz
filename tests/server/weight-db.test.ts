import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER } from '../helpers/fixtures';

// Create mock DB
const { db, setResult, setError, reset } = createMockDB();

// Import schema for re-export in mock
const schema = await import('$lib/server/schema');

// Mock modules
mock.module('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

// Import after mocking
const { createWeightEntry, getWeightEntries, getLatestWeight, updateWeightEntry, deleteWeightEntry } =
	await import('$lib/server/weight');

const TEST_WEIGHT_ENTRY = {
	id: '10000000-0000-4000-8000-000000000080',
	userId: TEST_USER.id,
	weightKg: 75.5,
	entryDate: '2026-02-10',
	loggedAt: new Date('2026-02-10T08:00:00Z'),
	notes: null,
	updatedAt: null
};

const VALID_WEIGHT_PAYLOAD = {
	weightKg: 75.5,
	entryDate: '2026-02-10'
};

describe('weight-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('createWeightEntry', () => {
		test('creates entry with valid payload', async () => {
			setResult([TEST_WEIGHT_ENTRY]);

			const result = await createWeightEntry(TEST_USER.id, VALID_WEIGHT_PAYLOAD);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.weightKg).toBe(75.5);
				expect(result.data.entryDate).toBe('2026-02-10');
			}
		});

		test('creates entry with notes', async () => {
			const entryWithNotes = { ...TEST_WEIGHT_ENTRY, notes: 'Morning weigh-in' };
			setResult([entryWithNotes]);

			const result = await createWeightEntry(TEST_USER.id, {
				...VALID_WEIGHT_PAYLOAD,
				notes: 'Morning weigh-in'
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.notes).toBe('Morning weigh-in');
			}
		});

		test('returns validation error for negative weight', async () => {
			const result = await createWeightEntry(TEST_USER.id, {
				weightKg: -5,
				entryDate: '2026-02-10'
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns validation error for weight exceeding 500', async () => {
			const result = await createWeightEntry(TEST_USER.id, {
				weightKg: 501,
				entryDate: '2026-02-10'
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns validation error for zero weight', async () => {
			const result = await createWeightEntry(TEST_USER.id, {
				weightKg: 0,
				entryDate: '2026-02-10'
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns validation error for invalid date format', async () => {
			const result = await createWeightEntry(TEST_USER.id, {
				weightKg: 75,
				entryDate: '02-10-2026'
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns validation error for missing entryDate', async () => {
			const result = await createWeightEntry(TEST_USER.id, {
				weightKg: 75
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns validation error for missing weightKg', async () => {
			const result = await createWeightEntry(TEST_USER.id, {
				entryDate: '2026-02-10'
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('coerces string weight to number', async () => {
			setResult([{ ...TEST_WEIGHT_ENTRY, weightKg: 80 }]);

			const result = await createWeightEntry(TEST_USER.id, {
				weightKg: '80',
				entryDate: '2026-02-10'
			});
			expect(result.success).toBe(true);
		});

		test('accepts null notes', async () => {
			setResult([TEST_WEIGHT_ENTRY]);

			const result = await createWeightEntry(TEST_USER.id, {
				...VALID_WEIGHT_PAYLOAD,
				notes: null
			});
			expect(result.success).toBe(true);
		});

		test('returns error when DB insert fails', async () => {
			setError(new Error('DB connection failed'));

			const result = await createWeightEntry(TEST_USER.id, VALID_WEIGHT_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('DB connection failed');
			}
		});
	});

	describe('getWeightEntries', () => {
		test('returns entries for user', async () => {
			setResult([TEST_WEIGHT_ENTRY]);
			const entries = await getWeightEntries(TEST_USER.id);
			expect(entries).toEqual([TEST_WEIGHT_ENTRY]);
		});

		test('returns empty array when no entries', async () => {
			setResult([]);
			const entries = await getWeightEntries(TEST_USER.id);
			expect(entries).toEqual([]);
		});
	});

	describe('getLatestWeight', () => {
		test('returns latest entry when it exists', async () => {
			setResult([TEST_WEIGHT_ENTRY]);
			const entry = await getLatestWeight(TEST_USER.id);
			expect(entry).toEqual(TEST_WEIGHT_ENTRY);
		});

		test('returns null when no entries exist', async () => {
			setResult([]);
			const entry = await getLatestWeight(TEST_USER.id);
			expect(entry).toBeNull();
		});
	});

	describe('updateWeightEntry', () => {
		test('updates entry with valid payload', async () => {
			const updated = { ...TEST_WEIGHT_ENTRY, weightKg: 76.0 };
			setResult([updated]);

			const result = await updateWeightEntry(TEST_USER.id, TEST_WEIGHT_ENTRY.id, {
				weightKg: 76.0
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.weightKg).toBe(76.0);
			}
		});

		test('updates entry date', async () => {
			const updated = { ...TEST_WEIGHT_ENTRY, entryDate: '2026-02-11' };
			setResult([updated]);

			const result = await updateWeightEntry(TEST_USER.id, TEST_WEIGHT_ENTRY.id, {
				entryDate: '2026-02-11'
			});
			expect(result.success).toBe(true);
		});

		test('updates notes', async () => {
			const updated = { ...TEST_WEIGHT_ENTRY, notes: 'After gym' };
			setResult([updated]);

			const result = await updateWeightEntry(TEST_USER.id, TEST_WEIGHT_ENTRY.id, {
				notes: 'After gym'
			});
			expect(result.success).toBe(true);
		});

		test('returns validation error for negative weight', async () => {
			const result = await updateWeightEntry(TEST_USER.id, TEST_WEIGHT_ENTRY.id, {
				weightKg: -1
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns validation error for invalid date format', async () => {
			const result = await updateWeightEntry(TEST_USER.id, TEST_WEIGHT_ENTRY.id, {
				entryDate: 'not-a-date'
			});
			expect(result.success).toBe(false);
		});

		test('returns undefined data when entry not found', async () => {
			setResult([]);

			const result = await updateWeightEntry(TEST_USER.id, 'nonexistent-id', {
				weightKg: 76.0
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeUndefined();
			}
		});
	});

	describe('deleteWeightEntry', () => {
		test('returns true when entry deleted', async () => {
			setResult([TEST_WEIGHT_ENTRY]);
			const deleted = await deleteWeightEntry(TEST_USER.id, TEST_WEIGHT_ENTRY.id);
			expect(deleted).toBe(true);
		});

		test('returns false when entry not found', async () => {
			setResult([]);
			const deleted = await deleteWeightEntry(TEST_USER.id, 'nonexistent-id');
			expect(deleted).toBe(false);
		});
	});
});
