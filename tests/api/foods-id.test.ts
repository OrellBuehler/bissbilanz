import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_FOOD } from '../helpers/fixtures';

let mockGetResult: any = null;
let mockUpdateResult: any = null;
let mockDeleteResult: any = { blocked: false };

mock.module('$lib/server/foods', () => ({
	getFood: async () => mockGetResult,
	updateFood: async () => mockUpdateResult,
	deleteFood: async (_userId: string, _id: string, force: boolean) => {
		if (!force && mockDeleteResult.blocked) {
			return { blocked: true, entryCount: mockDeleteResult.entryCount };
		}
		return { blocked: false };
	},
	listFoods: async () => [],
	findFoodByBarcode: async () => null,
	createFood: async () => ({ success: true, data: TEST_FOOD }),
	listRecentFoods: async () => [],
	toFoodInsert: () => ({}),
	toFoodUpdate: () => ({})
}));

const { DELETE } = await import('../../src/routes/api/foods/[id]/+server');

describe('api/foods/[id]', () => {
	beforeEach(() => {
		mockGetResult = null;
		mockUpdateResult = null;
		mockDeleteResult = { blocked: false };
	});

	describe('DELETE /api/foods/[id]', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, params: { id: TEST_FOOD.id } });
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns 204 on successful delete without entries', async () => {
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_FOOD.id } });
			const response = await DELETE(event);

			expect(response.status).toBe(204);
		});

		test('returns 409 when food has entries and force is not set', async () => {
			mockDeleteResult = { blocked: true, entryCount: 5 };
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_FOOD.id } });
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(409);
			expect(data.error).toBe('has_entries');
			expect(data.entryCount).toBe(5);
		});

		test('returns 204 when force=true even with entries', async () => {
			mockDeleteResult = { blocked: true, entryCount: 3 };
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_FOOD.id },
				url: `http://localhost/api/foods/${TEST_FOOD.id}?force=true`
			});
			const response = await DELETE(event);

			expect(response.status).toBe(204);
		});
	});
});
