import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER, TEST_FOOD, TEST_RECIPE } from '../helpers/fixtures';

let mockRecipeUsage: any = null;
let mockFoodUsage: any = null;
let lastCall: { userId: string; id: string } | null = null;

vi.mock('$lib/server/usage', () => ({
	getRecipeUsage: async (userId: string, id: string) => {
		lastCall = { userId, id };
		return mockRecipeUsage;
	},
	getFoodUsage: async (userId: string, id: string) => {
		lastCall = { userId, id };
		return mockFoodUsage;
	}
}));

const { GET: GET_RECIPE_USAGE } = await import('../../src/routes/api/recipes/[id]/usage/+server');
const { GET: GET_FOOD_USAGE } = await import('../../src/routes/api/foods/[id]/usage/+server');

const entry = {
	id: '10000000-0000-4000-8000-000000000030',
	date: '2026-05-03',
	mealType: 'Dinner',
	servings: 2,
	eatenAt: '2026-05-03T18:30:00.000Z'
};

describe('api/recipes/[id]/usage', () => {
	beforeEach(() => {
		mockRecipeUsage = null;
		lastCall = null;
	});

	test('returns 401 when not authenticated', async () => {
		const event = createMockEvent({ user: null, params: { id: TEST_RECIPE.id } });
		const response = await GET_RECIPE_USAGE(event);
		await expectResponseContract('GET', '/api/recipes/{id}/usage', response);

		expect(response.status).toBe(401);
		expect((await response.json()).error).toBe('Unauthorized');
	});

	test('returns 404 when the recipe is not found for the user', async () => {
		const event = createMockEvent({ user: TEST_USER, params: { id: TEST_RECIPE.id } });
		const response = await GET_RECIPE_USAGE(event);
		await expectResponseContract('GET', '/api/recipes/{id}/usage', response);

		expect(response.status).toBe(404);
		expect((await response.json()).error).toBe('Recipe not found');
		expect(lastCall).toEqual({ userId: TEST_USER.id, id: TEST_RECIPE.id });
	});

	test('returns the entries and total', async () => {
		mockRecipeUsage = { entries: [entry], totalEntries: 250 };
		const event = createMockEvent({ user: TEST_USER, params: { id: TEST_RECIPE.id } });
		const response = await GET_RECIPE_USAGE(event);
		await expectResponseContract('GET', '/api/recipes/{id}/usage', response);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ entries: [entry], totalEntries: 250 });
	});
});

describe('api/foods/[id]/usage', () => {
	beforeEach(() => {
		mockFoodUsage = null;
		lastCall = null;
	});

	test('returns 401 when not authenticated', async () => {
		const event = createMockEvent({ user: null, params: { id: TEST_FOOD.id } });
		const response = await GET_FOOD_USAGE(event);
		await expectResponseContract('GET', '/api/foods/{id}/usage', response);

		expect(response.status).toBe(401);
	});

	test('returns 404 when the food is not found for the user', async () => {
		const event = createMockEvent({ user: TEST_USER, params: { id: TEST_FOOD.id } });
		const response = await GET_FOOD_USAGE(event);
		await expectResponseContract('GET', '/api/foods/{id}/usage', response);

		expect(response.status).toBe(404);
		expect((await response.json()).error).toBe('Food not found');
	});

	test('returns entries, recipes and supplements', async () => {
		mockFoodUsage = {
			entries: [entry],
			totalEntries: 1,
			recipes: [{ id: TEST_RECIPE.id, name: 'Porridge', isLastIngredient: true }],
			supplements: [{ id: '10000000-0000-4000-8000-000000000040', name: 'Electrolytes' }]
		};
		const event = createMockEvent({ user: TEST_USER, params: { id: TEST_FOOD.id } });
		const response = await GET_FOOD_USAGE(event);
		await expectResponseContract('GET', '/api/foods/{id}/usage', response);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(mockFoodUsage);
	});
});
