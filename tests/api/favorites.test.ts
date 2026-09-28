import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_FOOD, TEST_RECIPE } from '../helpers/fixtures';
import { expectResponseContract } from '../helpers/contract';

// The real listFavoriteFoods/listFavoriteRecipes flatten in `type` and
// `logCount` (and, for recipes, macro totals) that the raw fixtures don't
// carry — build realistic favorite rows locally instead of editing the
// shared fixtures.
const FAVORITE_FOOD = { ...TEST_FOOD, type: 'food' as const, logCount: 5 };
const FAVORITE_RECIPE = {
	...TEST_RECIPE,
	type: 'recipe' as const,
	logCount: 3,
	calories: 320,
	protein: 12,
	carbs: 45,
	fat: 8,
	fiber: 6
};

let mockFavoriteFoodsResult: any[] = [];
let mockFavoriteRecipesResult: any[] = [];

vi.mock('$lib/server/favorites', () => ({
	listFavoriteFoods: async (_userId: string, _limit?: number) => mockFavoriteFoodsResult,
	listFavoriteRecipes: async (_userId: string, _limit?: number) => mockFavoriteRecipesResult
}));

import { allValidationSchemas } from '../helpers/mock-validation';
vi.mock('$lib/server/validation', () => ({ ...allValidationSchemas }));

const { GET } = await import('../../src/routes/api/favorites/+server');

describe('api/favorites', () => {
	beforeEach(() => {
		mockFavoriteFoodsResult = [];
		mockFavoriteRecipesResult = [];
	});

	describe('GET /api/favorites', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });

			const response = await GET(event);
			await expectResponseContract('GET', '/api/favorites', response);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns both foods and recipes by default', async () => {
			mockFavoriteFoodsResult = [FAVORITE_FOOD];
			mockFavoriteRecipesResult = [FAVORITE_RECIPE];
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			await expectResponseContract('GET', '/api/favorites', response);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toHaveLength(1);
			expect(data.recipes).toHaveLength(1);
		});

		test('returns only foods when type=foods', async () => {
			mockFavoriteFoodsResult = [FAVORITE_FOOD];
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/favorites?type=foods'
			});

			const response = await GET(event);
			await expectResponseContract('GET', '/api/favorites', response);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toHaveLength(1);
			expect(data.recipes).toBeUndefined();
		});

		test('returns only recipes when type=recipes', async () => {
			mockFavoriteRecipesResult = [FAVORITE_RECIPE];
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/favorites?type=recipes'
			});

			const response = await GET(event);
			await expectResponseContract('GET', '/api/favorites', response);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.recipes).toHaveLength(1);
			expect(data.foods).toBeUndefined();
		});

		test('returns empty arrays when no favorites exist', async () => {
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			await expectResponseContract('GET', '/api/favorites', response);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toHaveLength(0);
			expect(data.recipes).toHaveLength(0);
		});

		test('respects limit param', async () => {
			mockFavoriteFoodsResult = [FAVORITE_FOOD];
			mockFavoriteRecipesResult = [FAVORITE_RECIPE];
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/favorites?limit=10'
			});

			const response = await GET(event);
			await expectResponseContract('GET', '/api/favorites', response);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toBeTruthy();
			expect(data.recipes).toBeTruthy();
		});
	});
});
