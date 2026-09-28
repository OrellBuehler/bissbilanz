import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER, TEST_FOOD, TEST_FOOD_2 } from '../helpers/fixtures';

// listRecentFoods always joins in lastServings/lastUsedAt/logCount alongside
// the food columns (see src/lib/server/foods.ts) — the shared TEST_FOOD
// fixtures don't carry those, so build realistic "recent food" rows locally.
const RECENT_TEST_FOOD = {
	...TEST_FOOD,
	lastServings: 1,
	lastUsedAt: '2026-01-05T08:00:00Z',
	logCount: 3
};
const RECENT_TEST_FOOD_2 = {
	...TEST_FOOD_2,
	lastServings: 2,
	lastUsedAt: '2026-01-06T12:00:00Z',
	logCount: 1
};

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
			mockRecentResult = [RECENT_TEST_FOOD, RECENT_TEST_FOOD_2];
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			await expectResponseContract('GET', '/api/foods/recent', response);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toHaveLength(2);
		});

		test('returns empty array when no recent foods', async () => {
			mockRecentResult = [];
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			await expectResponseContract('GET', '/api/foods/recent', response);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toEqual([]);
		});

		test('returns all foods from listRecentFoods', async () => {
			mockRecentResult = [RECENT_TEST_FOOD, RECENT_TEST_FOOD_2];
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			await expectResponseContract('GET', '/api/foods/recent', response);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toHaveLength(2);
		});
	});
});
