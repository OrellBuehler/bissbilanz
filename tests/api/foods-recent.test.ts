import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_FOOD, TEST_FOOD_2 } from '../helpers/fixtures';

// Mock the foods module
let mockRecentResult: any = [];

vi.mock('$lib/server/foods', () => ({
	getFood: async () => null,
	listRecentFoods: async (userId: string) => mockRecentResult,
	listFoods: async () => ({ items: [], total: 0 }),
	findFoodByBarcode: async () => null,
	createFood: async () => null,
	updateFood: async () => {},
	deleteFood: async () => {},
	toFoodInsert: () => ({}),
	toFoodUpdate: () => ({})
}));

// Import route handler after mocking
const { GET } = await import('../../src/routes/api/foods/recent/+server');

describe('api/foods/recent', () => {
	beforeEach(() => {
		mockRecentResult = [];
	});

	describe('GET /api/foods/recent', () => {
		test('returns recent foods list', async () => {
			mockRecentResult = [TEST_FOOD, TEST_FOOD_2];
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toHaveLength(2);
		});

		test('returns empty array when no recent foods', async () => {
			mockRecentResult = [];
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toEqual([]);
		});

		test('returns all foods from listRecentFoods', async () => {
			mockRecentResult = [TEST_FOOD, TEST_FOOD_2];
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toHaveLength(2);
		});
	});
});
