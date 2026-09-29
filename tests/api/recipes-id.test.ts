import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER, TEST_RECIPE, TEST_RECIPE_INGREDIENT } from '../helpers/fixtures';

const TEST_RECIPE_DETAIL = {
	...TEST_RECIPE,
	calories: 320,
	protein: 12,
	carbs: 45,
	fat: 8,
	fiber: 6,
	ingredients: [TEST_RECIPE_INGREDIENT],
	steps: [
		{
			id: '10000000-0000-4000-8000-000000000022',
			sortOrder: 0,
			text: 'Stir the oats into hot milk',
			imageUrl: null
		}
	]
};

let mockGetResult: any = null;
let mockUpdateResult: any = null;
let mockDeleteResult: any = { blocked: false };

vi.mock('$lib/server/recipes', () => ({
	getRecipe: async () => mockGetResult,
	updateRecipe: async () => mockUpdateResult,
	deleteRecipe: async (_userId: string, _id: string, force: boolean) => {
		if (!force && mockDeleteResult.blocked) {
			return { blocked: true, entryCount: mockDeleteResult.entryCount };
		}
		return { blocked: false };
	},
	listRecipes: async () => ({ items: [], total: 0 }),
	createRecipe: async () => ({ success: true, data: TEST_RECIPE }),
	toRecipeInsert: () => ({})
}));

const { GET, PATCH, DELETE } = await import('../../src/routes/api/recipes/[id]/+server');

describe('api/recipes/[id]', () => {
	beforeEach(() => {
		mockGetResult = null;
		mockUpdateResult = null;
		mockDeleteResult = { blocked: false };
	});

	describe('GET /api/recipes/[id]', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, params: { id: TEST_RECIPE.id } });
			const response = await GET(event);
			await expectResponseContract('GET', '/api/recipes/{id}', response);
			expect(response.status).toBe(401);
		});

		test('returns 404 for an unknown recipe', async () => {
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_RECIPE.id } });
			const response = await GET(event);
			await expectResponseContract('GET', '/api/recipes/{id}', response);
			expect(response.status).toBe(404);
		});

		test('returns the recipe with its ordered steps', async () => {
			mockGetResult = TEST_RECIPE_DETAIL;
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_RECIPE.id } });
			const response = await GET(event);
			await expectResponseContract('GET', '/api/recipes/{id}', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.recipe.steps).toEqual([
				{
					id: '10000000-0000-4000-8000-000000000022',
					sortOrder: 0,
					text: 'Stir the oats into hot milk',
					imageUrl: null
				}
			]);
		});
	});

	describe('PATCH /api/recipes/[id]', () => {
		test('replaces steps and returns the full recipe', async () => {
			mockUpdateResult = { success: true, data: TEST_RECIPE };
			mockGetResult = TEST_RECIPE_DETAIL;
			const event = createMockEvent({
				user: TEST_USER,
				method: 'PATCH',
				params: { id: TEST_RECIPE.id },
				body: { steps: [{ text: 'Stir the oats into hot milk' }] }
			});
			const response = await PATCH(event);
			await expectResponseContract('PATCH', '/api/recipes/{id}', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.recipe.steps).toHaveLength(1);
		});

		test('returns 404 when the update did not apply', async () => {
			mockUpdateResult = { success: true, data: null };
			const event = createMockEvent({
				user: TEST_USER,
				method: 'PATCH',
				params: { id: TEST_RECIPE.id },
				body: { steps: [] }
			});
			const response = await PATCH(event);
			await expectResponseContract('PATCH', '/api/recipes/{id}', response);
			expect(response.status).toBe(404);
		});
	});

	describe('DELETE /api/recipes/[id]', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, params: { id: TEST_RECIPE.id } });
			const response = await DELETE(event);
			await expectResponseContract('DELETE', '/api/recipes/{id}', response);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns 204 on successful delete without entries', async () => {
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_RECIPE.id } });
			const response = await DELETE(event);
			await expectResponseContract('DELETE', '/api/recipes/{id}', response);

			expect(response.status).toBe(204);
		});

		test('returns 409 when recipe has entries and force is not set', async () => {
			mockDeleteResult = { blocked: true, entryCount: 3 };
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_RECIPE.id } });
			const response = await DELETE(event);
			await expectResponseContract('DELETE', '/api/recipes/{id}', response);
			const data = await response.json();

			expect(response.status).toBe(409);
			expect(data.error).toBe('has_entries');
			expect(data.entryCount).toBe(3);
		});

		test('returns 204 when force=true even with entries', async () => {
			mockDeleteResult = { blocked: true, entryCount: 3 };
			const event = createMockEvent({
				user: TEST_USER,
				params: { id: TEST_RECIPE.id },
				url: `http://localhost/api/recipes/${TEST_RECIPE.id}?force=true`
			});
			const response = await DELETE(event);
			await expectResponseContract('DELETE', '/api/recipes/{id}', response);

			expect(response.status).toBe(204);
		});
	});
});
