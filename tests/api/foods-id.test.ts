import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_FOOD, VALID_FOOD_PAYLOAD } from '../helpers/fixtures';

let mockGetResult: any = null;
let mockUpdateResult: any = null;
let mockDeleteResult: any = { blocked: false };

vi.mock('$lib/server/foods', () => ({
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

const mockValidationError = new ZodError([
	{
		code: 'invalid_type',
		expected: 'number',
		path: ['calories'],
		message: 'Expected number, received string'
	} as any
]);

const { GET, PATCH, DELETE } = await import('../../src/routes/api/foods/[id]/+server');

describe('api/foods/[id]', () => {
	beforeEach(() => {
		mockGetResult = null;
		mockUpdateResult = null;
		mockDeleteResult = { blocked: false };
	});

	describe('GET /api/foods/[id]', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, params: { id: TEST_FOOD.id } });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns 200 with food data', async () => {
			mockGetResult = TEST_FOOD;
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_FOOD.id } });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.food).toBeDefined();
			expect(data.food.id).toBe(TEST_FOOD.id);
			expect(data.food.name).toBe(TEST_FOOD.name);
			expect(data.food.calories).toBe(TEST_FOOD.calories);
			expect(data.food.protein).toBe(TEST_FOOD.protein);
			expect(data.food.carbs).toBe(TEST_FOOD.carbs);
			expect(data.food.fat).toBe(TEST_FOOD.fat);
		});

		test('returns 404 for nonexistent food', async () => {
			mockGetResult = null;
			const event = createMockEvent({ user: TEST_USER, params: { id: 'nonexistent-id' } });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toBe('Food not found');
		});
	});

	describe('PATCH /api/foods/[id]', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				params: { id: TEST_FOOD.id },
				body: { name: 'Updated Oats' }
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns 200 with updated food on valid partial update', async () => {
			const updatedFood = { ...TEST_FOOD, name: 'Updated Oats', calories: 400 };
			mockUpdateResult = { success: true, data: updatedFood };
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_FOOD.id },
				body: { name: 'Updated Oats', calories: 400 }
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.food).toBeDefined();
			expect(data.food.name).toBe('Updated Oats');
			expect(data.food.calories).toBe(400);
		});

		test('returns 400 on validation error', async () => {
			mockUpdateResult = { success: false, error: mockValidationError };
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_FOOD.id },
				body: { calories: 'not-a-number' }
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Validation failed');
			expect(data.details).toBeDefined();
		});

		test('returns 404 for nonexistent food', async () => {
			mockUpdateResult = { success: true, data: undefined };
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: 'nonexistent-id' },
				body: { name: 'Updated' }
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toBe('Food not found');
		});
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
