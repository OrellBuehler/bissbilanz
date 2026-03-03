import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_RECIPE } from '../helpers/fixtures';

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
	listRecipes: async () => [],
	createRecipe: async () => ({ success: true, data: TEST_RECIPE }),
	toRecipeInsert: () => ({})
}));

const { DELETE } = await import('../../src/routes/api/recipes/[id]/+server');

describe('api/recipes/[id]', () => {
	beforeEach(() => {
		mockGetResult = null;
		mockUpdateResult = null;
		mockDeleteResult = { blocked: false };
	});

	describe('DELETE /api/recipes/[id]', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, params: { id: TEST_RECIPE.id } });
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns 204 on successful delete without entries', async () => {
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_RECIPE.id } });
			const response = await DELETE(event);

			expect(response.status).toBe(204);
		});

		test('returns 409 when recipe has entries and force is not set', async () => {
			mockDeleteResult = { blocked: true, entryCount: 3 };
			const event = createMockEvent({ user: TEST_USER, params: { id: TEST_RECIPE.id } });
			const response = await DELETE(event);
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

			expect(response.status).toBe(204);
		});
	});
});
