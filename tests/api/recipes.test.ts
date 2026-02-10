import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_RECIPE, VALID_RECIPE_PAYLOAD } from '../helpers/fixtures';

let mockListResult: any = [];
let mockCreateResult: any = null;

mock.module('$lib/server/recipes', () => ({
	listRecipes: async () => mockListResult,
	createRecipe: async () => mockCreateResult,
	getRecipe: async () => null,
	updateRecipe: async () => null,
	deleteRecipe: async () => {}
}));

const { GET, POST } = await import('../../src/routes/api/recipes/+server');

describe('api/recipes', () => {
	beforeEach(() => {
		mockListResult = [];
		mockCreateResult = null;
	});

	describe('GET /api/recipes', () => {
		test('returns recipes list', async () => {
			mockListResult = [TEST_RECIPE];
			const event = createMockEvent({ user: TEST_USER });
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.recipes).toHaveLength(1);
		});
	});

	describe('POST /api/recipes', () => {
		test('creates recipe with valid payload', async () => {
			mockCreateResult = TEST_RECIPE;
			const event = createMockEvent({
				user: TEST_USER,
				body: VALID_RECIPE_PAYLOAD
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(201);
			expect(data.recipe).toBeTruthy();
		});
	});
});
