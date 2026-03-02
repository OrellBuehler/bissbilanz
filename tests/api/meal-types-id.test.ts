import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '../../src/lib/server/errors';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_MEAL_TYPE, TEST_USER } from '../helpers/fixtures';

let deleteError: Error | null = null;

vi.mock('$lib/server/meal-types', () => ({
	listMealTypes: async () => [],
	createMealType: async () => ({ success: false, error: new Error('not implemented') }),
	updateMealType: async () => ({ success: true, data: TEST_MEAL_TYPE }),
	deleteMealType: async () => {
		if (deleteError) throw deleteError;
	},
	toMealTypeInsert: () => ({})
}));

const { DELETE } = await import('../../src/routes/api/meal-types/[id]/+server');

describe('api/meal-types/[id]', () => {
	beforeEach(() => {
		deleteError = null;
	});

	describe('DELETE /api/meal-types/[id]', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, params: { id: TEST_MEAL_TYPE.id } });
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns 204 on successful delete', async () => {
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_MEAL_TYPE.id } });
			const response = await DELETE(event);

			expect(response.status).toBe(204);
		});

		test('returns 409 when meal type is referenced by favorites timeframes', async () => {
			deleteError = new ApiError(
				409,
				'Meal type is used in favorites meal timeframes and cannot be deleted'
			);
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_MEAL_TYPE.id } });

			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(409);
			expect(data.error).toContain('favorites meal timeframes');
		});
	});
});
