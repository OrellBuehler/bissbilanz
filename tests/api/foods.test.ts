import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_FOOD, VALID_FOOD_PAYLOAD } from '../helpers/fixtures';

// Mock the foods module
let mockListResult: any = [];
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

vi.mock('$lib/server/foods', () => ({
	getFood: async () => null,
	listFoods: async (userId: string, options: any) => mockListResult,
	findFoodByBarcode: async (userId: string, barcode: string) => mockFindBarcodeResult,
	createFood: async (userId: string, payload: unknown) =>
		mockCreateResult
			? { success: true, data: mockCreateResult }
			: { success: false, error: mockValidationError },
	listRecentFoods: async (userId: string, limit?: number) => [],
	updateFood: async () => ({ success: true, data: undefined }),
	deleteFood: async () => ({ blocked: false }),
	toFoodInsert: () => ({}),
	toFoodUpdate: () => ({})
}));

// Mock validation — must include ALL exports to avoid polluting other test files
import { allValidationSchemas } from '../helpers/mock-validation';
vi.mock('$lib/server/validation', () => ({ ...allValidationSchemas }));

// Import route handlers after mocking
const { GET, POST } = await import('../../src/routes/api/foods/+server');

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
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns foods list', async () => {
			mockListResult = [TEST_FOOD];
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
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
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.food).toBeTruthy();
		});

		test('searches by query string when provided', async () => {
			mockListResult = [TEST_FOOD];
			const event = createMockEvent({
				user: TEST_USER,
				url: 'http://localhost/api/foods?q=Oats'
			});

			const response = await GET(event);
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
