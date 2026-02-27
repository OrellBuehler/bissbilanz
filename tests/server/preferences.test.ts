import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ApiError } from '../../src/lib/server/errors';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER } from '../helpers/fixtures';

const { db, setError, reset } = createMockDB();

const schema = await import('$lib/server/schema');

mock.module('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const { updatePreferences } = await import('$lib/server/preferences');

describe('preferences', () => {
	beforeEach(() => {
		reset();
	});

	test('rejects overlapping favorite meal timeframes before persistence', async () => {
		const result = await updatePreferences(TEST_USER.id, {
			favoriteMealTimeframes: [
				{ mealType: 'Breakfast', startTime: '08:00', endTime: '10:30' },
				{ mealType: 'Lunch', startTime: '10:00', endTime: '13:00' }
			]
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeInstanceOf(ApiError);
			const error = result.error as ApiError;
			expect(error.status).toBe(400);
			expect(error.message).toContain('overlap');
		}
	});

	test('maps database overlap constraint violations to conflict', async () => {
		setError(Object.assign(new Error('overlap'), { code: '23P01' }));

		const result = await updatePreferences(TEST_USER.id, {
			favoriteMealTimeframes: [{ mealType: 'Breakfast', startTime: '08:00', endTime: '10:00' }]
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeInstanceOf(ApiError);
			const error = result.error as ApiError;
			expect(error.status).toBe(409);
		}
	});

	test('rejects unknown custom meal type ids', async () => {
		const result = await updatePreferences(TEST_USER.id, {
			favoriteMealTimeframes: [
				{
					mealType: 'Pre-Workout',
					customMealTypeId: '10000000-0000-4000-8000-000000000099',
					startTime: '08:00',
					endTime: '09:00'
				}
			]
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeInstanceOf(ApiError);
			const error = result.error as ApiError;
			expect(error.status).toBe(400);
			expect(error.message).toContain('custom meal types');
		}
	});
});
