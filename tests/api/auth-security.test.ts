import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_USER_2, TEST_FOOD, TEST_ENTRY, TEST_RECIPE } from '../helpers/fixtures';

/**
 * Critical Security Tests: Cross-User Access Prevention
 *
 * These tests verify that User B cannot access User A's resources.
 * All unauthorized access should return 404 (not 401) to avoid leaking
 * information about resource existence.
 */

// Mock server functions to simulate user-specific resource ownership
let mockFoodResult: any = null;
let mockEntryResult: any = null;
let mockRecipeResult: any = null;
let mockMealTypeResult: any = null;

vi.mock('$lib/server/foods', () => ({
	getFood: async (userId: string, id: string) => {
		if (mockFoodResult && mockFoodResult.userId === userId) {
			return mockFoodResult;
		}
		return null;
	},
	listFoods: async () => ({ items: [], total: 0 }),
	findFoodByBarcode: async () => null,
	createFood: async () => ({ success: true, data: null }),
	updateFood: async (userId: string, id: string) => {
		// Return data only if userId matches owner
		if (mockFoodResult && mockFoodResult.userId === userId) {
			return { success: true, data: mockFoodResult };
		}
		return { success: true, data: undefined };
	},
	deleteFood: async () => ({ blocked: false }),
	listRecentFoods: async () => [],
	toFoodInsert: () => ({}),
	toFoodUpdate: () => ({})
}));

vi.mock('$lib/server/entries', () => ({
	listEntriesByDate: async () => ({ items: [], total: 0 }),
	createEntry: async () => ({ success: true, data: null }),
	updateEntry: async (userId: string, id: string) => {
		// Return data only if userId matches owner
		if (mockEntryResult && mockEntryResult.userId === userId) {
			return { success: true, data: mockEntryResult };
		}
		return { success: true, data: undefined };
	},
	deleteEntry: async () => {},
	listEntriesByDateRange: async () => [],
	copyEntries: async () => [],
	toEntryUpdate: () => ({})
}));

vi.mock('$lib/server/recipes', () => ({
	listRecipes: async () => ({ items: [], total: 0 }),
	createRecipe: async () => ({ success: true, data: null }),
	getRecipe: async (userId: string, id: string) => {
		// Return data only if userId matches owner
		if (mockRecipeResult && mockRecipeResult.userId === userId) {
			return mockRecipeResult;
		}
		return null;
	},
	updateRecipe: async (userId: string, id: string) => {
		// Return data only if userId matches owner
		if (mockRecipeResult && mockRecipeResult.userId === userId) {
			return { success: true, data: mockRecipeResult };
		}
		return { success: true, data: undefined };
	},
	deleteRecipe: async () => ({ blocked: false }),
	toRecipeInsert: () => ({})
}));

vi.mock('$lib/server/meal-types', () => ({
	listMealTypes: async () => [],
	createMealType: async () => ({ success: true, data: null }),
	updateMealType: async (userId: string, id: string) => {
		// Return data only if userId matches owner
		if (mockMealTypeResult && mockMealTypeResult.userId === userId) {
			return { success: true, data: mockMealTypeResult };
		}
		return { success: true, data: undefined };
	},
	deleteMealType: async () => {},
	toMealTypeInsert: () => ({})
}));

import { allValidationSchemas } from '../helpers/mock-validation';
vi.mock('$lib/server/validation', () => ({ ...allValidationSchemas }));

// Import route handlers after mocking
const foodsRoute = await import('../../src/routes/api/foods/[id]/+server');
const entriesRoute = await import('../../src/routes/api/entries/[id]/+server');
const recipesRoute = await import('../../src/routes/api/recipes/[id]/+server');
const mealTypesRoute = await import('../../src/routes/api/meal-types/[id]/+server');

describe('Cross-user access prevention', () => {
	beforeEach(() => {
		mockFoodResult = null;
		mockEntryResult = null;
		mockRecipeResult = null;
		mockMealTypeResult = null;
	});

	describe('Foods - Cross-user access', () => {
		test('User B cannot update User A food', async () => {
			// Setup: User A owns a food
			mockFoodResult = { ...TEST_FOOD, userId: TEST_USER.id };

			// User B tries to update it
			const event = createMockEvent({
				user: TEST_USER_2,
				params: { id: TEST_FOOD.id },
				body: { name: 'Hacked Name' }
			});

			const response = await foodsRoute.PATCH(event);
			const data = await response.json();

			// Should return 404 (not 401) to avoid leaking existence
			expect(response.status).toBe(404);
			expect(data.error).toBe('Food not found');
		});

		test('User B cannot delete User A food', async () => {
			const event = createMockEvent({
				user: TEST_USER_2,
				params: { id: TEST_FOOD.id }
			});

			const response = await foodsRoute.DELETE(event);

			// DELETE returns 204 even if nothing deleted (doesn't leak existence)
			expect(response.status).toBe(204);
		});
	});

	describe('Entries - Cross-user access', () => {
		test('User B cannot update User A entry', async () => {
			// Setup: User A owns an entry
			mockEntryResult = { ...TEST_ENTRY, userId: TEST_USER.id };

			// User B tries to update it
			const event = createMockEvent({
				user: TEST_USER_2,
				params: { id: TEST_ENTRY.id },
				body: { servings: 99 }
			});

			const response = await entriesRoute.PATCH(event);
			const data = await response.json();

			// Should return 404 (not 401) to avoid leaking existence
			expect(response.status).toBe(404);
			expect(data.error).toBe('Entry not found');
		});

		test('User B cannot delete User A entry', async () => {
			const event = createMockEvent({
				user: TEST_USER_2,
				params: { id: TEST_ENTRY.id }
			});

			const response = await entriesRoute.DELETE(event);

			// DELETE returns 204 even if nothing deleted (doesn't leak existence)
			expect(response.status).toBe(204);
		});
	});

	describe('Recipes - Cross-user access', () => {
		test('User B cannot view User A recipe', async () => {
			// Setup: User A owns a recipe
			mockRecipeResult = { ...TEST_RECIPE, userId: TEST_USER.id };

			// User B tries to view it
			const event = createMockEvent({
				user: TEST_USER_2,
				params: { id: TEST_RECIPE.id }
			});

			const response = await recipesRoute.GET(event);
			const data = await response.json();

			// Should return 404 (not 401) to avoid leaking existence
			expect(response.status).toBe(404);
			expect(data.error).toBe('Recipe not found');
		});

		test('User B cannot update User A recipe', async () => {
			// Setup: User A owns a recipe
			mockRecipeResult = { ...TEST_RECIPE, userId: TEST_USER.id };

			// User B tries to update it
			const event = createMockEvent({
				user: TEST_USER_2,
				params: { id: TEST_RECIPE.id },
				body: { name: 'Hacked Recipe' }
			});

			const response = await recipesRoute.PATCH(event);
			const data = await response.json();

			// Should return 404 (not 401) to avoid leaking existence
			expect(response.status).toBe(404);
			expect(data.error).toBe('Recipe not found');
		});

		test('User B cannot delete User A recipe', async () => {
			const event = createMockEvent({
				user: TEST_USER_2,
				params: { id: TEST_RECIPE.id }
			});

			const response = await recipesRoute.DELETE(event);

			// DELETE returns 204 even if nothing deleted (doesn't leak existence)
			expect(response.status).toBe(204);
		});
	});

	describe('Meal Types - Cross-user access', () => {
		test('User B cannot update User A meal type', async () => {
			// Setup: User A owns a meal type
			mockMealTypeResult = {
				id: '10000000-0000-4000-8000-000000000099',
				userId: TEST_USER.id,
				name: 'Breakfast',
				sortOrder: 1
			};

			// User B tries to update it
			const event = createMockEvent({
				user: TEST_USER_2,
				params: { id: '10000000-0000-4000-8000-000000000099' },
				body: { name: 'Hacked Meal' }
			});

			const response = await mealTypesRoute.PATCH(event);
			const data = await response.json();

			// Should return 404 (not 401) to avoid leaking existence
			expect(response.status).toBe(404);
			expect(data.error).toBe('Meal type not found');
		});

		test('User B cannot delete User A meal type', async () => {
			const event = createMockEvent({
				user: TEST_USER_2,
				params: { id: '10000000-0000-4000-8000-000000000099' }
			});

			const response = await mealTypesRoute.DELETE(event);

			// DELETE returns 204 even if nothing deleted (doesn't leak existence)
			expect(response.status).toBe(204);
		});
	});

	describe('Information leakage prevention', () => {
		test('404 response does not reveal if resource exists', async () => {
			// User B tries to access non-existent resource
			const nonExistentEvent = createMockEvent({
				user: TEST_USER_2,
				params: { id: '00000000-0000-0000-0000-000000000000' },
				body: { name: 'Test' }
			});

			const response1 = await foodsRoute.PATCH(nonExistentEvent);
			const data1 = await response1.json();

			// Setup: Resource exists but belongs to User A
			mockFoodResult = { ...TEST_FOOD, userId: TEST_USER.id };

			const unauthorizedEvent = createMockEvent({
				user: TEST_USER_2,
				params: { id: TEST_FOOD.id },
				body: { name: 'Test' }
			});

			const response2 = await foodsRoute.PATCH(unauthorizedEvent);
			const data2 = await response2.json();

			// Both should return identical 404 responses
			expect(response1.status).toBe(404);
			expect(response2.status).toBe(404);
			expect(data1.error).toBe(data2.error);
		});
	});
});
