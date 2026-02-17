import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockDB } from '../helpers/mock-db';
import {
	TEST_USER,
	TEST_SUPPLEMENT,
	TEST_SUPPLEMENT_LOG,
	VALID_SUPPLEMENT_PAYLOAD
} from '../helpers/fixtures';

// Create mock DB
const { db, setResult, reset } = createMockDB();

// Mock modules
mock.module('$lib/server/db', () => ({
	getDB: () => db
}));

mock.module('$lib/utils/dates', () => ({
	today: () => '2026-02-17',
	shiftDate: (isoDate: string, days: number) => isoDate,
	yesterday: () => '2026-02-16'
}));

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
	getLogsForRange
} = await import('$lib/server/supplements');

describe('supplements-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('listSupplements', () => {
		test('returns active supplements for user', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await listSupplements(TEST_USER.id);
			expect(result).toEqual([TEST_SUPPLEMENT]);
		});

		test('returns all supplements when activeOnly is false', async () => {
			const inactive = { ...TEST_SUPPLEMENT, isActive: false };
			setResult([TEST_SUPPLEMENT, inactive]);
			const result = await listSupplements(TEST_USER.id, false);
			expect(result).toEqual([TEST_SUPPLEMENT, inactive]);
		});

		test('returns empty array when no supplements exist', async () => {
			setResult([]);
			const result = await listSupplements(TEST_USER.id);
			expect(result).toEqual([]);
		});
	});

	describe('getSupplementById', () => {
		test('returns supplement when found', async () => {
			setResult([TEST_SUPPLEMENT]);
			const result = await getSupplementById(TEST_USER.id, TEST_SUPPLEMENT.id);
			expect(result).toEqual(TEST_SUPPLEMENT);
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
			const weeklySupplement = { ...TEST_SUPPLEMENT, scheduleType: 'weekly', scheduleDays: [1, 3, 5] };
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
			// First call: getSupplementById, second call: insert returning
			setResult([TEST_SUPPLEMENT]);
			setResult([TEST_SUPPLEMENT_LOG]);
			const result = await logSupplement(TEST_USER.id, TEST_SUPPLEMENT.id, '2026-02-17');
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.supplementId).toBe(TEST_SUPPLEMENT.id);
				expect(result.data.date).toBe('2026-02-17');
			}
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
});
