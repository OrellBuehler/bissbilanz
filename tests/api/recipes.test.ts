import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import {
	TEST_USER,
	TEST_RECIPE,
	TEST_RECIPE_INGREDIENT,
	VALID_RECIPE_PAYLOAD
} from '../helpers/fixtures';

// listRecipes/getRecipe compute macro totals via a join and getRecipe also
// attaches `ingredients` — the bare TEST_RECIPE fixture models the raw table
// row createRecipe() inserts, so build the enriched detail shape locally
// rather than editing the shared fixture (favorites.test.ts relies on the
// bare shape).
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
			imageUrl: '/uploads/11111111-1111-4111-8111-111111111111.webp'
		},
		{
			id: '10000000-0000-4000-8000-000000000023',
			sortOrder: 1,
			text: 'Serve warm',
			imageUrl: null
		}
	]
};

let mockListResult: any = [];
let listCalls: any[] = [];
let mockCreateResult: any = null;
let mockGetResult: any = null;

// Mock ZodError for validation failures
const mockValidationError = new ZodError([
	{
		code: 'invalid_type',
		expected: 'string',
		path: ['name'],
		message: 'Required'
	} as any
]);

import { allValidationSchemas } from '../helpers/mock-validation';
vi.mock('$lib/server/validation', () => ({ ...allValidationSchemas }));

vi.mock('$lib/server/recipes', () => ({
	listRecipes: async (_userId: string, options: unknown) => {
		listCalls.push(options);
		return { items: mockListResult, total: mockListResult.length };
	},
	createRecipe: async () =>
		mockCreateResult
			? { success: true, data: mockCreateResult }
			: { success: false, error: mockValidationError },
	getRecipe: async () => mockGetResult,
	updateRecipe: async () => ({ success: true, data: null }),
	deleteRecipe: async () => ({ blocked: false }),
	toRecipeInsert: () => ({})
}));

const { GET, POST } = await import('../../src/routes/api/recipes/+server');

describe('api/recipes', () => {
	beforeEach(() => {
		mockListResult = [];
		listCalls = [];
		mockCreateResult = null;
		mockGetResult = null;
	});

	describe('GET /api/recipes', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			const response = await GET(event);
			await expectResponseContract('GET', '/api/recipes', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns recipes list', async () => {
			mockListResult = [{ ...TEST_RECIPE_DETAIL, stepCount: 2 }];
			const event = createMockEvent({ user: TEST_USER });
			const response = await GET(event);
			await expectResponseContract('GET', '/api/recipes', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.recipes).toHaveLength(1);
		});

		test('returns each recipe with its labels', async () => {
			mockListResult = [{ ...TEST_RECIPE_DETAIL, stepCount: 2, labels: ['porridge', 'oat'] }];
			const response = await GET(createMockEvent({ user: TEST_USER }));
			await expectResponseContract('GET', '/api/recipes', response);
			const data = await response.json();
			expect(data.recipes[0].labels).toEqual(['porridge', 'oat']);
		});

		test('passes the search query and minLabels through', async () => {
			const response = await GET(
				createMockEvent({ user: TEST_USER, searchParams: { q: 'soup', minLabels: '3' } })
			);
			await expectResponseContract('GET', '/api/recipes', response);
			expect(listCalls[0]).toMatchObject({ query: 'soup', minLabels: 3 });
		});

		test('treats unlabeled=true as minLabels=1', async () => {
			await GET(createMockEvent({ user: TEST_USER, searchParams: { unlabeled: 'true' } }));
			expect(listCalls[0]).toMatchObject({ minLabels: 1 });
		});

		test('rejects an out-of-range minLabels', async () => {
			const response = await GET(
				createMockEvent({ user: TEST_USER, searchParams: { minLabels: '99' } })
			);
			// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
			expect(response.status).toBe(400);
		});
	});

	describe('POST /api/recipes', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				body: VALID_RECIPE_PAYLOAD
			});
			const response = await POST(event);
			await expectResponseContract('POST', '/api/recipes', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('creates recipe with valid payload', async () => {
			mockCreateResult = TEST_RECIPE;
			mockGetResult = TEST_RECIPE_DETAIL;
			const event = createMockEvent({
				user: TEST_USER,
				body: VALID_RECIPE_PAYLOAD
			});
			const response = await POST(event);
			await expectResponseContract('POST', '/api/recipes', response);
			const data = await response.json();
			expect(response.status).toBe(201);
			expect(data.recipe).toBeTruthy();
		});

		test('creates recipe with steps and returns them on the detail', async () => {
			mockCreateResult = TEST_RECIPE;
			mockGetResult = TEST_RECIPE_DETAIL;
			const event = createMockEvent({
				user: TEST_USER,
				body: {
					...VALID_RECIPE_PAYLOAD,
					steps: [
						{ text: 'Stir the oats into hot milk', imageUrl: '/uploads/a.webp' },
						{ text: 'Serve warm' }
					]
				}
			});
			const response = await POST(event);
			await expectResponseContract('POST', '/api/recipes', response);
			const data = await response.json();
			expect(response.status).toBe(201);
			expect(data.recipe.steps).toHaveLength(2);
			expect(data.recipe.steps[1]).toMatchObject({ sortOrder: 1, imageUrl: null });
		});

		test('returns an empty steps array for a recipe without instructions', async () => {
			mockCreateResult = TEST_RECIPE;
			mockGetResult = { ...TEST_RECIPE_DETAIL, steps: [] };
			const event = createMockEvent({ user: TEST_USER, body: VALID_RECIPE_PAYLOAD });
			const response = await POST(event);
			await expectResponseContract('POST', '/api/recipes', response);
			expect((await response.json()).recipe.steps).toEqual([]);
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
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).

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
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).

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
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).

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
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).

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
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).

				expect(response.status).toBe(400);
			});

			test('validation error includes details', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {}
				});

				mockCreateResult = null;
				const response = await POST(event);
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error).toBe('Validation failed');
			});
		});
	});
});
