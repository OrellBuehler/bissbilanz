import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_FOOD, VALID_FOOD_PAYLOAD } from '../helpers/fixtures';

// Mock the foods module
let mockListResult: any = [];
let mockFindBarcodeResult: any = null;
let mockCreateResult: any = null;

mock.module('$lib/server/foods', () => ({
	listFoods: async (userId: string, options: any) => mockListResult,
	findFoodByBarcode: async (userId: string, barcode: string) => mockFindBarcodeResult,
	createFood: async (userId: string, payload: unknown) => mockCreateResult,
	listRecentFoods: async (userId: string, limit?: number) => [],
	updateFood: async () => {},
	deleteFood: async () => {},
	toFoodInsert: () => ({}),
	toFoodUpdate: () => ({})
}));

// Mock validation schema
mock.module('$lib/server/validation', () => ({
	paginationSchema: {
		parse: (data: any) => ({
			limit: Number(data.limit) || 50,
			offset: Number(data.offset) || 0
		})
	}
}));

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
	});
});
