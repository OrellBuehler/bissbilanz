import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import {
	TEST_USER,
	TEST_SUPPLEMENT,
	TEST_SUPPLEMENT_LOG,
	TEST_MULTI_SUPPLEMENT,
	TEST_SUPPLEMENT_INGREDIENTS,
	VALID_SUPPLEMENT_PAYLOAD,
	VALID_MULTI_SUPPLEMENT_PAYLOAD
} from '../helpers/fixtures';

// Create mock DB
const { db, setResult, setError, reset } = createMockDB();

// Import schema for re-export in mock
const schema = await import('$lib/server/schema');

// Mock modules
vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	withDbRetry: <T>(fn: () => Promise<T>) => fn(),
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

vi.mock('$lib/utils/dates', async () => {
	const realDates = await vi.importActual<typeof import('$lib/utils/dates')>('$lib/utils/dates');
	return {
		...realDates,
		today: () => '2026-02-17',
		yesterday: () => '2026-02-16'
	};
});

// Import after mocking
const {
	listSupplements,
	getSupplementById,
	createSupplement,
	updateSupplement,
	deleteSupplement,
	logSupplement,
	unlogSupplement,
	getLogsForDate,
	getLogsForRange,
	getSupplementIngredients,
	getIngredientsForSupplements,
	getSupplementChecklist
} = await import('$lib/server/supplements');

// Note: The mock DB returns the SAME result for all queries in a call chain.
// Functions that make multiple queries (e.g. supplement + ingredients) will
// both get the same result. Since supplement objects lack `supplementId`,
// the ingredients grouping logic won't match them, yielding empty ingredients.

describe('supplements-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('listSupplements', () => {
		test('returns active supplements for user', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await listSupplements(TEST_USER.id);
			expect(result.length).toBe(1);
			expect(result[0].name).toBe('Vitamin D3');
			expect(result[0].id).toBe(TEST_SUPPLEMENT.id);
		});

		test('returns all supplements when activeOnly is false', async () => {
			const inactive = { ...TEST_SUPPLEMENT, isActive: false };
			setResult([TEST_SUPPLEMENT, inactive]);
			const result = await listSupplements(TEST_USER.id, false);
			expect(result.length).toBe(2);
		});

		test('returns empty array when no supplements exist', async () => {
			setResult([]);
			const result = await listSupplements(TEST_USER.id);
			expect(result).toEqual([]);
		});

		test('supplements include ingredients array', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await listSupplements(TEST_USER.id);
			expect(Array.isArray(result[0].ingredients)).toBe(true);
		});
	});

	describe('getSupplementById', () => {
		test('returns supplement when found', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await getSupplementById(TEST_USER.id, TEST_SUPPLEMENT.id);
			expect(result).not.toBeNull();
			expect(result!.name).toBe('Vitamin D3');
			expect(Array.isArray(result!.ingredients)).toBe(true);
		});

		test('returns null when not found', async () => {
			setResult([]);
			const result = await getSupplementById(TEST_USER.id, 'nonexistent-id');
			expect(result).toBeNull();
		});
	});

	describe('createSupplement', () => {
		test('creates supplement with valid payload', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await createSupplement(TEST_USER.id, VALID_SUPPLEMENT_PAYLOAD);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe('Vitamin D3');
				expect(result.data.dosage).toBe(1000);
				expect(result.data.dosageUnit).toBe('IU');
				expect(result.data.ingredients).toEqual([]);
			}
		});

		test('creates supplement with ingredients (validation passes)', async () => {
			setResult([
				{ ...TEST_SUPPLEMENT, name: 'Daily Multivitamin', dosage: 1, dosageUnit: 'capsule' }
			]);
			const result = await createSupplement(TEST_USER.id, VALID_MULTI_SUPPLEMENT_PAYLOAD);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe('Daily Multivitamin');
			}
		});

		test('returns validation error for missing name', async () => {
			const result = await createSupplement(TEST_USER.id, { dosage: 1000 });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns validation error for missing dosage', async () => {
			const result = await createSupplement(TEST_USER.id, {
				name: 'Vitamin D3',
				dosageUnit: 'IU',
				scheduleType: 'daily'
			});
			expect(result.success).toBe(false);
		});

		test('returns validation error for missing scheduleType', async () => {
			const result = await createSupplement(TEST_USER.id, {
				name: 'Vitamin D3',
				dosage: 1000,
				dosageUnit: 'IU'
			});
			expect(result.success).toBe(false);
		});

		test('requires scheduleDays for specific_days type', async () => {
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				scheduleType: 'specific_days'
			});
			expect(result.success).toBe(false);
		});

		test('requires scheduleDays for weekly type', async () => {
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				scheduleType: 'weekly'
			});
			expect(result.success).toBe(false);
		});

		test('accepts weekly type with scheduleDays', async () => {
			const weeklyPayload = {
				...VALID_SUPPLEMENT_PAYLOAD,
				scheduleType: 'weekly',
				scheduleDays: [1, 3, 5]
			};
			const weeklySupplement = {
				...TEST_SUPPLEMENT,
				scheduleType: 'weekly',
				scheduleDays: [1, 3, 5]
			};
			setResult([weeklySupplement]);
			const result = await createSupplement(TEST_USER.id, weeklyPayload);
			expect(result.success).toBe(true);
		});

		test('returns validation error for invalid scheduleType', async () => {
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				scheduleType: 'biweekly'
			});
			expect(result.success).toBe(false);
		});

		test('validates ingredient name is required', async () => {
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				ingredients: [{ name: '', dosage: 10, dosageUnit: 'mg' }]
			});
			expect(result.success).toBe(false);
		});

		test('validates ingredient dosage must be positive', async () => {
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				ingredients: [{ name: 'Vitamin C', dosage: -1, dosageUnit: 'mg' }]
			});
			expect(result.success).toBe(false);
		});

		test('validates ingredient dosageUnit is required', async () => {
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				ingredients: [{ name: 'Vitamin C', dosage: 80 }]
			});
			expect(result.success).toBe(false);
		});

		test('accepts empty ingredients array (simple supplement)', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				ingredients: []
			});
			expect(result.success).toBe(true);
		});
	});

	describe('updateSupplement', () => {
		test('updates supplement with valid payload', async () => {
			const updated = { ...TEST_SUPPLEMENT, dosage: 2000 };
			setResult([updated]);
			const result = await updateSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, { dosage: 2000 });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.dosage).toBe(2000);
			}
		});

		test('updates supplement name', async () => {
			const updated = { ...TEST_SUPPLEMENT, name: 'Vitamin D3 + K2' };
			setResult([updated]);
			const result = await updateSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, {
				name: 'Vitamin D3 + K2'
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.name).toBe('Vitamin D3 + K2');
			}
		});

		test('deactivates supplement', async () => {
			const updated = { ...TEST_SUPPLEMENT, isActive: false };
			setResult([updated]);
			const result = await updateSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, { isActive: false });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.isActive).toBe(false);
			}
		});

		test('returns undefined when supplement not found', async () => {
			setResult([]);
			const result = await updateSupplement(TEST_USER.id, 'nonexistent-id', { dosage: 2000 });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeUndefined();
			}
		});

		test('accepts ingredients in update payload', async () => {
			const updated = { ...TEST_SUPPLEMENT };
			setResult([updated]);
			const result = await updateSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, {
				ingredients: [{ name: 'Vitamin A', dosage: 800, dosageUnit: 'mcg' }]
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).not.toBeUndefined();
			}
		});

		test('accepts null ingredients to clear', async () => {
			const updated = { ...TEST_SUPPLEMENT };
			setResult([updated]);
			const result = await updateSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, {
				ingredients: null
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).not.toBeUndefined();
			}
		});

		test('validates ingredient fields in update', async () => {
			const result = await updateSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, {
				ingredients: [{ name: '', dosage: 10, dosageUnit: 'mg' }]
			});
			expect(result.success).toBe(false);
		});
	});

	describe('deleteSupplement', () => {
		test('deletes supplement', async () => {
			setResult(undefined);
			await deleteSupplement(TEST_USER.id, TEST_SUPPLEMENT.id);
			// No assertion needed - just verifies it doesn't throw
		});

		test('does not throw when deleting nonexistent supplement', async () => {
			setResult(undefined);
			await deleteSupplement(TEST_USER.id, 'nonexistent-id');
		});
	});

	describe('logSupplement', () => {
		test('logs supplement as taken', async () => {
			setResult([TEST_SUPPLEMENT_LOG]);
			const result = await logSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, '2026-02-17');
			// Mock returns TEST_SUPPLEMENT_LOG for all queries, including getSupplementById
			// which treats any non-empty result as "found". The log insert also gets this result.
			expect(result.success).toBe(true);
		});

		test('returns error when supplement not found', async () => {
			setResult([]);
			const result = await logSupplement(TEST_USER.id, 'nonexistent-id', '2026-02-17');
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('Supplement not found');
			}
		});
	});

	describe('unlogSupplement', () => {
		test('removes log for supplement on date', async () => {
			setResult(undefined);
			await unlogSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, '2026-02-17');
			// No assertion needed - just verifies it doesn't throw
		});
	});

	describe('getLogsForDate', () => {
		test('returns logs for a date', async () => {
			setResult([TEST_SUPPLEMENT_LOG]);
			const result = await getLogsForDate(TEST_USER.id, '2026-02-17');
			expect(result).toEqual([TEST_SUPPLEMENT_LOG]);
		});

		test('returns empty array when no logs for date', async () => {
			setResult([]);
			const result = await getLogsForDate(TEST_USER.id, '2026-02-17');
			expect(result).toEqual([]);
		});
	});

	describe('getLogsForRange', () => {
		test('returns logs with supplement details for range', async () => {
			const logWithDetails = {
				log: TEST_SUPPLEMENT_LOG,
				supplementName: TEST_SUPPLEMENT.name,
				dosage: TEST_SUPPLEMENT.dosage,
				dosageUnit: TEST_SUPPLEMENT.dosageUnit
			};
			setResult([logWithDetails]);
			const result = await getLogsForRange(TEST_USER.id, '2026-02-01', '2026-02-28');
			expect(result).toEqual([logWithDetails]);
			expect(result[0].supplementName).toBe('Vitamin D3');
		});

		test('returns empty array when no logs in range', async () => {
			setResult([]);
			const result = await getLogsForRange(TEST_USER.id, '2026-01-01', '2026-01-31');
			expect(result).toEqual([]);
		});
	});

	describe('getSupplementIngredients', () => {
		test('returns ingredients for supplement', async () => {
			setResult(TEST_SUPPLEMENT_INGREDIENTS);
			const result = await getSupplementIngredients(TEST_MULTI_SUPPLEMENT.id);
			expect(result).toEqual(TEST_SUPPLEMENT_INGREDIENTS);
		});

		test('returns empty array when no ingredients', async () => {
			setResult([]);
			const result = await getSupplementIngredients(TEST_SUPPLEMENT.id);
			expect(result).toEqual([]);
		});
	});

	describe('getIngredientsForSupplements', () => {
		test('returns empty map for empty array', async () => {
			const result = await getIngredientsForSupplements([]);
			expect(result.size).toBe(0);
		});

		test('returns grouped ingredients by supplementId', async () => {
			setResult(TEST_SUPPLEMENT_INGREDIENTS);
			const result = await getIngredientsForSupplements([TEST_MULTI_SUPPLEMENT.id]);
			expect(result.get(TEST_MULTI_SUPPLEMENT.id)?.length).toBe(3);
			expect(result.get(TEST_MULTI_SUPPLEMENT.id)?.[0].name).toBe('Vitamin A');
		});

		test('groups ingredients from multiple supplements', async () => {
			const mixedIngredients = [
				...TEST_SUPPLEMENT_INGREDIENTS,
				{
					id: '10000000-0000-4000-8000-000000000080',
					supplementId: TEST_SUPPLEMENT.id,
					name: 'Vitamin D',
					dosage: 1000,
					dosageUnit: 'IU',
					sortOrder: 0
				}
			];
			setResult(mixedIngredients);
			const result = await getIngredientsForSupplements([
				TEST_MULTI_SUPPLEMENT.id,
				TEST_SUPPLEMENT.id
			]);
			expect(result.get(TEST_MULTI_SUPPLEMENT.id)?.length).toBe(3);
			expect(result.get(TEST_SUPPLEMENT.id)?.length).toBe(1);
			expect(result.get(TEST_SUPPLEMENT.id)?.[0].name).toBe('Vitamin D');
		});

		test('returns empty map entries for supplements with no ingredients', async () => {
			setResult([]);
			const result = await getIngredientsForSupplements([TEST_SUPPLEMENT.id]);
			expect(result.size).toBe(0);
		});
	});

	describe('logSupplement', () => {
		test('returns existing log when supplement already logged for date', async () => {
			// onConflictDoNothing returns empty array, then fallback select returns existing log
			// Mock returns TEST_SUPPLEMENT_LOG for all queries including the ownership check
			// and the fallback select — this simulates the "already logged" path
			setResult([TEST_SUPPLEMENT_LOG]);
			const result = await logSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, '2026-02-17');
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.supplementId).toBe(TEST_SUPPLEMENT.id);
				expect(result.data.date).toBe('2026-02-17');
			}
		});

		test('returns error when db throws', async () => {
			setError(new Error('DB connection failed'));
			const result = await logSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, '2026-02-17');
			expect(result.success).toBe(false);
		});
	});

	describe('createSupplement', () => {
		test('returns error when db throws during insert', async () => {
			setError(new Error('DB connection failed'));
			const result = await createSupplement(TEST_USER.id, VALID_SUPPLEMENT_PAYLOAD);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('DB connection failed');
			}
		});
	});

	describe('updateSupplement', () => {
		test('returns error when db throws during update', async () => {
			setError(new Error('DB connection failed'));
			const result = await updateSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, { dosage: 2000 });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('DB connection failed');
			}
		});
	});

	describe('getSupplementChecklist', () => {
		test('returns due supplements with taken status false when not logged', async () => {
			// Mock returns the same result for listSupplements (supplement rows) and
			// getLogsForDate (empty). Because the mock returns one result for all queries,
			// we set the supplement result and accept that the log query also returns it.
			// The logMap uses supplementId as key — supplement rows lack that field, so
			// logMap will be empty and taken will be false.
			setResult([TEST_SUPPLEMENT]);
			const result = await getSupplementChecklist(TEST_USER.id, '2026-02-17');
			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBe(1);
			expect(result[0].supplement.id).toBe(TEST_SUPPLEMENT.id);
			expect(result[0].taken).toBe(false);
			expect(result[0].takenAt).toBeNull();
		});

		test('returns empty array when no active supplements', async () => {
			setResult([]);
			const result = await getSupplementChecklist(TEST_USER.id, '2026-02-17');
			expect(result).toEqual([]);
		});

		test('filters out supplements not due on the given date', async () => {
			// 2026-02-17 is a Tuesday (day 2). A supplement scheduled only on Mondays
			// should not appear.
			const mondayOnly = {
				...TEST_SUPPLEMENT,
				scheduleType: 'specific_days' as const,
				scheduleDays: [1]
			};
			setResult([mondayOnly]);
			const result = await getSupplementChecklist(TEST_USER.id, '2026-02-17');
			expect(result).toEqual([]);
		});

		test('includes supplements due on the given day of week', async () => {
			// 2026-02-17 is a Tuesday (day 2).
			const tuesdaySupplement = {
				...TEST_SUPPLEMENT,
				id: '10000000-0000-4000-8000-000000000065',
				scheduleType: 'specific_days' as const,
				scheduleDays: [2]
			};
			setResult([tuesdaySupplement]);
			const result = await getSupplementChecklist(TEST_USER.id, '2026-02-17');
			expect(result.length).toBe(1);
			expect(result[0].supplement.id).toBe(tuesdaySupplement.id);
		});

		test('marks supplement as taken when log exists', async () => {
			// When the mock result includes objects with a supplementId field that matches,
			// the logMap will find it and mark taken=true.
			// We build a result that works for both the supplement query and the log query:
			// supplement rows are identified by having an `id` field that matches the log's
			// `supplementId`. The trick: set result to an array where one item looks like a
			// supplement (for listSupplements) and the same item also looks like a log (for
			// getLogsForDate). The logMap.has(s.id) check requires the log's supplementId
			// to equal the supplement's id.
			//
			// Since both queries get the same mock result, we craft an object that satisfies
			// both: a supplement row where id === supplementId so it appears in both contexts.
			const hybridRow = {
				...TEST_SUPPLEMENT,
				supplementId: TEST_SUPPLEMENT.id,
				takenAt: new Date('2026-02-17T08:00:00Z'),
				date: '2026-02-17'
			};
			setResult([hybridRow]);
			const result = await getSupplementChecklist(TEST_USER.id, '2026-02-17');
			expect(result.length).toBe(1);
			expect(result[0].taken).toBe(true);
			expect(result[0].takenAt).toEqual(new Date('2026-02-17T08:00:00Z'));
		});

		test('handles every_other_day schedule correctly', async () => {
			// scheduleStartDate '2026-02-01', date '2026-02-17'
			// diff = 16 days (even) → due
			const everyOtherDay = {
				...TEST_SUPPLEMENT,
				scheduleType: 'every_other_day' as const,
				scheduleStartDate: '2026-02-01'
			};
			setResult([everyOtherDay]);
			const result = await getSupplementChecklist(TEST_USER.id, '2026-02-17');
			expect(result.length).toBe(1);
		});

		test('handles every_other_day schedule on off day', async () => {
			// scheduleStartDate '2026-02-01', date '2026-02-18'
			// diff = 17 days (odd) → not due
			const everyOtherDay = {
				...TEST_SUPPLEMENT,
				scheduleType: 'every_other_day' as const,
				scheduleStartDate: '2026-02-01'
			};
			setResult([everyOtherDay]);
			const result = await getSupplementChecklist(TEST_USER.id, '2026-02-18');
			expect(result).toEqual([]);
		});
	});
});
