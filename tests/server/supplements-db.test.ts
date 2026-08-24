import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import {
	TEST_USER,
	TEST_SUPPLEMENT,
	VALID_SUPPLEMENT_PAYLOAD,
	VALID_MULTI_SUPPLEMENT_PAYLOAD
} from '../helpers/fixtures';

const { db, setResult, setError, reset } = createMockDB();
const schema = await import('$lib/server/schema');

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
	getSupplementChecklist
} = await import('$lib/server/supplements');

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

		test('normalises a missing reminderTimes column to null', async () => {
			// Rows written before the reminder_times migration come back without the key.
			setResult([TEST_SUPPLEMENT]);
			const result = await listSupplements(TEST_USER.id);
			expect(result[0].reminderTimes).toBeNull();
		});

		test('passes stored reminder times through untouched', async () => {
			setResult([{ ...TEST_SUPPLEMENT, reminderTimes: ['08:00', '20:00'] }]);
			const result = await listSupplements(TEST_USER.id);
			expect(result[0].reminderTimes).toEqual(['08:00', '20:00']);
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
		test('creates supplement with ingredient-backed foods', async () => {
			// Mock returns a supplement row for all inserts; ingredient FK resolution
			// just needs any non-empty food lookup result.
			setResult([TEST_SUPPLEMENT]);
			const result = await createSupplement(TEST_USER.id, VALID_SUPPLEMENT_PAYLOAD);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe('Vitamin D3');
			}
		});

		test('creates multi-ingredient supplement', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await createSupplement(TEST_USER.id, VALID_MULTI_SUPPLEMENT_PAYLOAD);
			expect(result.success).toBe(true);
		});

		test('accepts reminder times', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				reminderTimes: ['20:00', '08:00']
			});
			expect(result.success).toBe(true);
		});

		test('rejects a malformed reminder time', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				reminderTimes: ['8:00']
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('rejects more than six reminder times', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				reminderTimes: ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00']
			});
			expect(result.success).toBe(false);
		});

		test('returns validation error for missing name', async () => {
			const result = await createSupplement(TEST_USER.id, {
				scheduleType: 'daily',
				ingredients: [{ foodId: 'abc' }]
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('returns validation error for missing scheduleType', async () => {
			const result = await createSupplement(TEST_USER.id, {
				name: 'Vitamin D3',
				ingredients: [{ foodId: '10000000-0000-4000-8000-000000000099' }]
			});
			expect(result.success).toBe(false);
		});

		test('requires at least one ingredient', async () => {
			const result = await createSupplement(TEST_USER.id, {
				name: 'Empty',
				scheduleType: 'daily',
				ingredients: []
			});
			expect(result.success).toBe(false);
		});

		test('rejects ingredient with neither foodId nor food', async () => {
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				ingredients: [{ servings: 1 }]
			});
			expect(result.success).toBe(false);
		});

		test('rejects ingredient with both foodId and food', async () => {
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				ingredients: [
					{
						foodId: '10000000-0000-4000-8000-000000000099',
						food: {
							name: 'X',
							servingSize: 1,
							servingUnit: 'g',
							calories: 0,
							protein: 0,
							carbs: 0,
							fat: 0,
							fiber: 0
						}
					}
				]
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

		test('requires scheduleDays for specific_days type', async () => {
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				scheduleType: 'specific_days'
			});
			expect(result.success).toBe(false);
		});

		test('accepts weekly schedule with scheduleDays', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				scheduleType: 'weekly',
				scheduleDays: [1, 3, 5]
			});
			expect(result.success).toBe(true);
		});

		test('rejects invalid scheduleType', async () => {
			const result = await createSupplement(TEST_USER.id, {
				...VALID_SUPPLEMENT_PAYLOAD,
				scheduleType: 'biweekly'
			});
			expect(result.success).toBe(false);
		});

		test('returns error when db throws', async () => {
			setError(new Error('DB connection failed'));
			const result = await createSupplement(TEST_USER.id, VALID_SUPPLEMENT_PAYLOAD);
			expect(result.success).toBe(false);
		});
	});

	describe('updateSupplement', () => {
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
			const result = await updateSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, {
				isActive: false
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.isActive).toBe(false);
			}
		});

		test('returns undefined when supplement not found', async () => {
			setResult([]);
			const result = await updateSupplement(TEST_USER.id, 'nonexistent-id', {
				name: 'New Name'
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeUndefined();
			}
		});

		test('returns error when db throws', async () => {
			setError(new Error('DB connection failed'));
			const result = await updateSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, {
				name: 'New Name'
			});
			expect(result.success).toBe(false);
		});

		test('rejects empty ingredients array', async () => {
			const result = await updateSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, {
				ingredients: []
			});
			expect(result.success).toBe(false);
		});
	});

	describe('deleteSupplement', () => {
		test('deletes supplement without throwing', async () => {
			// setResult([]) — the in-transaction SELECT of backing food ids returns an
			// empty array, skipping the reap step; delete runs and the call returns.
			setResult([]);
			await deleteSupplement(TEST_USER.id, TEST_SUPPLEMENT.id);
		});
	});

	describe('logSupplement', () => {
		test('returns error when supplement has no ingredients (= not found)', async () => {
			setResult([]);
			const result = await logSupplement(TEST_USER.id, 'nonexistent-id', '2026-02-17');
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toBe('Supplement not found');
			}
		});

		test('returns error when db throws', async () => {
			setError(new Error('DB connection failed'));
			const result = await logSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, '2026-02-17');
			expect(result.success).toBe(false);
		});
	});

	describe('unlogSupplement', () => {
		test('does not throw', async () => {
			setResult(undefined);
			await unlogSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, '2026-02-17');
		});
	});

	describe('getLogsForDate', () => {
		test('returns empty array when no logs', async () => {
			setResult([]);
			const result = await getLogsForDate(TEST_USER.id, '2026-02-17');
			expect(result).toEqual([]);
		});
	});

	describe('getLogsForRange', () => {
		test('returns empty array when no logs in range', async () => {
			setResult([]);
			const result = await getLogsForRange(TEST_USER.id, '2026-01-01', '2026-01-31');
			expect(result).toEqual([]);
		});
	});

	describe('getSupplementChecklist', () => {
		test('returns due supplements with taken=false when not logged', async () => {
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

		test('handles every_other_day schedule (even diff = due)', async () => {
			const everyOtherDay = {
				...TEST_SUPPLEMENT,
				scheduleType: 'every_other_day' as const,
				scheduleStartDate: '2026-02-01'
			};
			setResult([everyOtherDay]);
			const result = await getSupplementChecklist(TEST_USER.id, '2026-02-17');
			expect(result.length).toBe(1);
		});

		test('handles every_other_day schedule (odd diff = not due)', async () => {
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
