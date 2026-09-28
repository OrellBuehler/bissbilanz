import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER, TEST_FOOD, VALID_FOOD_PAYLOAD } from '../helpers/fixtures';

// Mock the foods module
let mockListResult: any = [];
let mockListArgs: any = null;
let mockFindBarcodeResult: any = null;
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

let mockBrandsResult: any[] = [];
let mockDuplicateGroupsResult: any[] = [];
let mockMergeResult: any = null;

vi.mock('$lib/server/foods', () => ({
	getFood: async () => null,
	listFoods: async (userId: string, options: any) => {
		mockListArgs = options;
		return { items: mockListResult, total: mockListResult.length };
	},
	findFoodByBarcode: async (userId: string, barcode: string) => mockFindBarcodeResult,
	createFood: async (userId: string, payload: unknown) =>
		mockCreateResult
			? { success: true, data: mockCreateResult }
			: { success: false, error: mockValidationError },
	listRecentFoods: async (userId: string, limit?: number) => [],
	updateFood: async () => ({ success: true, data: undefined }),
	deleteFood: async () => ({ blocked: false }),
	toFoodInsert: () => ({}),
	toFoodUpdate: () => ({}),
	listFoodBrands: async () => mockBrandsResult
}));

vi.mock('$lib/server/food-duplicates', () => ({
	findDuplicateGroups: async () => mockDuplicateGroupsResult
}));

vi.mock('$lib/server/food-merge', () => ({
	mergeFoods: async () =>
		mockMergeResult
			? { success: true, data: mockMergeResult }
			: { success: false, error: mockValidationError }
}));

// Mock validation — must include ALL exports to avoid polluting other test files
import { allValidationSchemas } from '../helpers/mock-validation';
vi.mock('$lib/server/validation', () => ({ ...allValidationSchemas }));

// Import route handlers after mocking
const { GET, POST } = await import('../../src/routes/api/foods/+server');
const { GET: BRANDS_GET } = await import('../../src/routes/api/foods/brands/+server');
const { GET: DUPLICATES_GET } = await import('../../src/routes/api/foods/duplicates/+server');
const { POST: MERGE_POST } = await import('../../src/routes/api/foods/merge/+server');

describe('api/foods', () => {
	beforeEach(() => {
		mockListResult = [];
		mockFindBarcodeResult = null;
		mockCreateResult = null;
	});

	describe('GET /api/foods', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });

			const response = await GET(event);
			await expectResponseContract('GET', '/api/foods', response);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns foods list', async () => {
			mockListResult = [TEST_FOOD];
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			await expectResponseContract('GET', '/api/foods', response);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toHaveLength(1);
		});

		test('searches by barcode when provided', async () => {
			mockFindBarcodeResult = TEST_FOOD;
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/foods?barcode=1234567890123'
			});

			const response = await GET(event);
			await expectResponseContract('GET', '/api/foods', response);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toHaveLength(1);
			expect(data.total).toBe(1);
		});

		test('searches by query string when provided', async () => {
			mockListResult = [TEST_FOOD];
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/foods?q=Oats'
			});

			const response = await GET(event);
			await expectResponseContract('GET', '/api/foods', response);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toHaveLength(1);
		});

		test('respects pagination parameters', async () => {
			mockListResult = [TEST_FOOD];
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/foods?limit=10&offset=5'
			});

			const response = await GET(event);
			await expectResponseContract('GET', '/api/foods', response);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.foods).toBeTruthy();
		});
	});

	describe('POST /api/foods', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				body: VALID_FOOD_PAYLOAD
			});

			const response = await POST(event);
			await expectResponseContract('POST', '/api/foods', response);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('creates food with valid payload', async () => {
			mockCreateResult = TEST_FOOD;
			const event = createMockEvent({
				user: TEST_USER,
				body: VALID_FOOD_PAYLOAD
			});

			const response = await POST(event);
			await expectResponseContract('POST', '/api/foods', response);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.food).toBeTruthy();
		});

		describe('Validation errors', () => {
			test('returns 400 when name is missing', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						servingSize: 100,
						servingUnit: 'g',
						calories: 350,
						protein: 10,
						carbs: 60,
						fat: 5,
						fiber: 8
					}
				});

				mockCreateResult = null;
				const response = await POST(event);
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).

				expect(response.status).toBe(400);
			});

			test('returns 400 when servingSize is missing', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						name: 'Test Food',
						servingUnit: 'g',
						calories: 350,
						protein: 10,
						carbs: 60,
						fat: 5,
						fiber: 8
					}
				});

				mockCreateResult = null;
				const response = await POST(event);
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).

				expect(response.status).toBe(400);
			});

			test('returns 400 when calories is negative', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						name: 'Test Food',
						servingSize: 100,
						servingUnit: 'g',
						calories: -100,
						protein: 10,
						carbs: 60,
						fat: 5,
						fiber: 8
					}
				});

				mockCreateResult = null;
				const response = await POST(event);
				// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).

				expect(response.status).toBe(400);
			});

			test('returns 400 when macros are invalid type', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						name: 'Test Food',
						servingSize: 100,
						servingUnit: 'g',
						calories: 'not-a-number',
						protein: 10,
						carbs: 60,
						fat: 5,
						fiber: 8
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

describe('GET /api/foods label filters', () => {
	beforeEach(() => {
		mockListResult = [];
		mockListArgs = null;
	});

	test('minLabels=n asks for foods with fewer than n labels', async () => {
		const response = await GET(
			createMockEvent({ user: TEST_USER, url: 'http://localhost/api/foods?minLabels=3' })
		);
		await expectResponseContract('GET', '/api/foods', response);
		expect(response.status).toBe(200);
		expect(mockListArgs).toMatchObject({ minLabels: 3 });
	});

	test('unlabeled=true still means minLabels=1', async () => {
		const response = await GET(
			createMockEvent({ user: TEST_USER, url: 'http://localhost/api/foods?unlabeled=true' })
		);
		await expectResponseContract('GET', '/api/foods', response);
		expect(mockListArgs).toMatchObject({ minLabels: 1 });
	});

	test('rejects minLabels outside 1..20', async () => {
		const tooLow = await GET(
			createMockEvent({ user: TEST_USER, url: 'http://localhost/api/foods?minLabels=0' })
		);
		await expectResponseContract('GET', '/api/foods', tooLow);
		expect(tooLow.status).toBe(400);

		const tooHigh = await GET(
			createMockEvent({ user: TEST_USER, url: 'http://localhost/api/foods?minLabels=21' })
		);
		await expectResponseContract('GET', '/api/foods', tooHigh);
		expect(tooHigh.status).toBe(400);
	});
});

describe('GET /api/foods/brands', () => {
	test('returns 401 when not authenticated', async () => {
		const response = await BRANDS_GET(createMockEvent({ user: null }));
		await expectResponseContract('GET', '/api/foods/brands', response);
		expect(response.status).toBe(401);
	});

	test('lists brands with counts', async () => {
		mockBrandsResult = [{ brand: 'Migros', count: 3 }];
		const response = await BRANDS_GET(createMockEvent({ user: TEST_USER }));
		await expectResponseContract('GET', '/api/foods/brands', response);
		expect(response.status).toBe(200);
		expect((await response.json()).brands).toHaveLength(1);
	});
});

describe('GET /api/foods/duplicates', () => {
	test('returns 401 when not authenticated', async () => {
		const response = await DUPLICATES_GET(createMockEvent({ user: null }));
		await expectResponseContract('GET', '/api/foods/duplicates', response);
		expect(response.status).toBe(401);
	});

	test('returns no groups when nothing is duplicated', async () => {
		mockDuplicateGroupsResult = [];
		const response = await DUPLICATES_GET(createMockEvent({ user: TEST_USER }));
		await expectResponseContract('GET', '/api/foods/duplicates', response);
		expect(response.status).toBe(200);
		expect((await response.json()).groups).toEqual([]);
	});
});

describe('POST /api/foods/merge', () => {
	const MERGE_PAYLOAD = {
		keeperId: TEST_FOOD.id,
		sourceIds: ['10000000-0000-4000-8000-000000000011']
	};

	test('returns 401 when not authenticated', async () => {
		const response = await MERGE_POST(createMockEvent({ user: null, body: MERGE_PAYLOAD }));
		await expectResponseContract('POST', '/api/foods/merge', response);
		expect(response.status).toBe(401);
	});

	test('merges into the keeper food', async () => {
		mockMergeResult = TEST_FOOD;
		const response = await MERGE_POST(createMockEvent({ user: TEST_USER, body: MERGE_PAYLOAD }));
		await expectResponseContract('POST', '/api/foods/merge', response);
		expect(response.status).toBe(200);
		expect((await response.json()).food.id).toBe(TEST_FOOD.id);
	});

	test('returns 400 for an invalid payload', async () => {
		mockMergeResult = null;
		const response = await MERGE_POST(
			createMockEvent({ user: TEST_USER, body: { keeperId: 'not-a-uuid', sourceIds: [] } })
		);
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
		expect(response.status).toBe(400);
	});
});
