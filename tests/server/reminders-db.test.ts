import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_REMINDER, VALID_REMINDER_PAYLOAD } from '../helpers/fixtures';

const { db, setResult, setError, reset } = createMockDB();
const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	withDbRetry: <T>(fn: () => Promise<T>) => fn(),
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const { listReminders, getReminderById, createReminder, updateReminder, deleteReminder } =
	await import('$lib/server/reminders');

describe('reminders-db', () => {
	beforeEach(() => {
		reset();
	});

	describe('listReminders', () => {
		test('returns reminders for the user', async () => {
			setResult([TEST_REMINDER]);
			const result = await listReminders(TEST_USER.id);
			expect(result.length).toBe(1);
			expect(result[0].id).toBe(TEST_REMINDER.id);
		});

		test('returns empty array when none exist', async () => {
			setResult([]);
			expect(await listReminders(TEST_USER.id)).toEqual([]);
		});
	});

	describe('getReminderById', () => {
		test('returns the reminder when found', async () => {
			setResult([TEST_REMINDER]);
			const result = await getReminderById(TEST_USER.id, TEST_REMINDER.id);
			expect(result?.id).toBe(TEST_REMINDER.id);
		});

		test('returns null when not found', async () => {
			setResult([]);
			expect(await getReminderById(TEST_USER.id, 'nonexistent-id')).toBeNull();
		});
	});

	describe('createReminder', () => {
		test('creates a weight reminder', async () => {
			setResult([TEST_REMINDER]);
			const result = await createReminder(TEST_USER.id, VALID_REMINDER_PAYLOAD);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.kind).toBe('weight');
			}
		});

		test('creates a meal reminder with a mealType', async () => {
			const mealReminder = { ...TEST_REMINDER, kind: 'meal' as const, mealType: 'Lunch' };
			setResult([mealReminder]);
			const result = await createReminder(TEST_USER.id, {
				kind: 'meal',
				mealType: 'Lunch',
				time: '12:00'
			});
			expect(result.success).toBe(true);
		});

		test('rejects a meal reminder without mealType', async () => {
			const result = await createReminder(TEST_USER.id, { kind: 'meal', time: '12:00' });
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.name).toBe('ZodError');
			}
		});

		test('rejects a malformed time', async () => {
			const result = await createReminder(TEST_USER.id, { kind: 'weight', time: '8:00' });
			expect(result.success).toBe(false);
		});

		test('rejects missing kind', async () => {
			const result = await createReminder(TEST_USER.id, { time: '08:00' });
			expect(result.success).toBe(false);
		});

		test('returns error when db throws', async () => {
			setError(new Error('DB connection failed'));
			const result = await createReminder(TEST_USER.id, VALID_REMINDER_PAYLOAD);
			expect(result.success).toBe(false);
		});
	});

	describe('updateReminder', () => {
		test('updates the time', async () => {
			const updated = { ...TEST_REMINDER, time: '09:00' };
			setResult([updated]);
			const result = await updateReminder(TEST_USER.id, TEST_REMINDER.id, { time: '09:00' });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.time).toBe('09:00');
			}
		});

		test('disables a reminder', async () => {
			const updated = { ...TEST_REMINDER, enabled: false };
			setResult([updated]);
			const result = await updateReminder(TEST_USER.id, TEST_REMINDER.id, { enabled: false });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data?.enabled).toBe(false);
			}
		});

		test('returns undefined when reminder not found', async () => {
			setResult([]);
			const result = await updateReminder(TEST_USER.id, 'nonexistent-id', { time: '09:00' });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeUndefined();
			}
		});

		test('rejects an empty weekdays array', async () => {
			const result = await updateReminder(TEST_USER.id, TEST_REMINDER.id, { weekdays: [] });
			expect(result.success).toBe(false);
		});

		test('returns error when db throws', async () => {
			setError(new Error('DB connection failed'));
			const result = await updateReminder(TEST_USER.id, TEST_REMINDER.id, { time: '09:00' });
			expect(result.success).toBe(false);
		});
	});

	describe('deleteReminder', () => {
		test('deletes without throwing', async () => {
			setResult(undefined);
			await deleteReminder(TEST_USER.id, TEST_REMINDER.id);
		});
	});
});
