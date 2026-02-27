import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_RECIPE, VALID_RECIPE_PAYLOAD } from '../helpers/fixtures';

let mockListResult: any = [];
let mockCreateResult: any = null;

// Mock ZodError for validation failures
const mockValidationError = new ZodError([
	{
		code: 'invalid_type',
		expected: 'string',
		path: ['name'],
		message: 'Required'
	} as any
]);

mock.module('$lib/server/recipes', () => ({
	listRecipes: async () => mockListResult,
	createRecipe: async () =>
		mockCreateResult
			? { success: true, data: mockCreateResult }
			: { success: false, error: mockValidationError },
	getRecipe: async () => null,
	updateRecipe: async () => ({ success: true, data: null }),
	deleteRecipe: async () => ({ blocked: false })
}));

const { GET, POST } = await import('../../src/routes/api/recipes/+server');

describe('api/recipes', () => {
	beforeEach(() => {
		mockListResult = [];
		mockCreateResult = null;
	});

	describe('GET /api/recipes', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

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
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				body: VALID_RECIPE_PAYLOAD
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

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

		describe('Validation errors', () => {
			test('returns 400 when name is missing', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						totalServings: 2,
						ingredients: [
							{ foodId: '10000000-0000-4000-8000-000000000010', quantity: 50, servingUnit: 'g' }
						]
					}
				});

				mockCreateResult = null;
				const response = await POST(event);

				expect(response.status).toBe(400);
			});

			test('returns 400 when ingredients array is empty', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						name: 'Test Recipe',
						totalServings: 2,
						ingredients: []
					}
				});

				mockCreateResult = null;
				const response = await POST(event);

				expect(response.status).toBe(400);
			});

			test('returns 400 when ingredients is missing', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						name: 'Test Recipe',
						totalServings: 2
					}
				});

				mockCreateResult = null;
				const response = await POST(event);

				expect(response.status).toBe(400);
			});

			test('returns 400 when totalServings is negative', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						name: 'Test Recipe',
						totalServings: -1,
						ingredients: [
							{ foodId: '10000000-0000-4000-8000-000000000010', quantity: 50, servingUnit: 'g' }
						]
					}
				});

				mockCreateResult = null;
				const response = await POST(event);

				expect(response.status).toBe(400);
			});

			test('returns 400 when ingredient is missing required fields', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						name: 'Test Recipe',
						totalServings: 2,
						ingredients: [
							{ foodId: '10000000-0000-4000-8000-000000000010' } // Missing quantity and servingUnit
						]
					}
				});

				mockCreateResult = null;
				const response = await POST(event);

				expect(response.status).toBe(400);
			});

			test('validation error includes details', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {}
				});

				mockCreateResult = null;
				const response = await POST(event);
				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error).toBe('Validation failed');
			});
		});
	});
});
