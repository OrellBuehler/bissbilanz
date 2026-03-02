import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_MEAL_TYPE, VALID_MEAL_TYPE_PAYLOAD } from '../helpers/fixtures';

// Mock the meal-types module
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

vi.mock('$lib/server/meal-types', () => ({
	listMealTypes: async (userId: string) => mockListResult,
	createMealType: async (userId: string, payload: unknown) =>
		mockCreateResult
			? { success: true, data: mockCreateResult }
			: { success: false, error: mockValidationError },
	updateMealType: async () => ({ success: true, data: undefined }),
	deleteMealType: async () => {},
	toMealTypeInsert: () => ({})
}));

// Import route handlers after mocking
const { GET, POST } = await import('../../src/routes/api/meal-types/+server');

describe('api/meal-types', () => {
	beforeEach(() => {
		mockListResult = [];
		mockCreateResult = null;
	});

	describe('GET /api/meal-types', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			const response = await GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns meal types list', async () => {
			mockListResult = [TEST_MEAL_TYPE];
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.mealTypes).toHaveLength(1);
			expect(data.mealTypes[0].name).toBe(TEST_MEAL_TYPE.name);
		});

		test('returns empty array when no meal types', async () => {
			mockListResult = [];
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.mealTypes).toEqual([]);
		});
	});

	describe('POST /api/meal-types', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				body: VALID_MEAL_TYPE_PAYLOAD
			});
			const response = await POST(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('creates meal type with valid payload', async () => {
			mockCreateResult = TEST_MEAL_TYPE;
			const event = createMockEvent({
				user: TEST_USER,
				body: VALID_MEAL_TYPE_PAYLOAD
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.mealType.name).toBe(TEST_MEAL_TYPE.name);
		});

		describe('Validation errors', () => {
			test('returns 400 when name is missing', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						sortOrder: 1
					}
				});

				mockCreateResult = null;
				const response = await POST(event);

				expect(response.status).toBe(400);
			});

			test('returns 400 when name is empty', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						name: '',
						sortOrder: 1
					}
				});

				mockCreateResult = null;
				const response = await POST(event);

				expect(response.status).toBe(400);
			});

			test('returns 400 when sortOrder is missing', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						name: 'Breakfast'
					}
				});

				mockCreateResult = null;
				const response = await POST(event);

				expect(response.status).toBe(400);
			});

			test('returns 400 when sortOrder is negative', async () => {
				const event = createMockEvent({
					user: TEST_USER,
					body: {
						name: 'Breakfast',
						sortOrder: -1
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
