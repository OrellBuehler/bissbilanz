import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_FOOD, TEST_FOOD_2 } from '../helpers/fixtures';

// Mock the foods module
let mockRecentResult: any = [];

mock.module('$lib/server/foods', () => ({
	listRecentFoods: async (userId: string) => mockRecentResult,
	listFoods: async () => [],
	findFoodByBarcode: async () => null,
	createFood: async () => null,
	updateFood: async () => {},
	deleteFood: async () => {},
	toFoodInsert: () => ({}),
	toFoodUpdate: () => ({})
}));

// Mock utils
mock.module('$lib/utils/recents', () => ({
	uniqueById: (items: any[]) => {
		const seen = new Set();
		return items.filter((item) => {
			if (seen.has(item.id)) return false;
			seen.add(item.id);
			return true;
		});
	}
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

		test('deduplicates foods by ID', async () => {
			mockRecentResult = [TEST_FOOD, TEST_FOOD, TEST_FOOD_2];
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toHaveLength(2);
		});
	});
});
