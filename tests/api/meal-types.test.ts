import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_MEAL_TYPE, VALID_MEAL_TYPE_PAYLOAD } from '../helpers/fixtures';

// Mock the meal-types module
let mockListResult: any = [];
let mockCreateResult: any = null;

mock.module('$lib/server/meal-types', () => ({
	listMealTypes: async (userId: string) => mockListResult,
	createMealType: async (userId: string, payload: unknown) => mockCreateResult
}));

// Import route handlers after mocking
const { GET, POST } = await import('../../src/routes/api/meal-types/+server');

describe('api/meal-types', () => {
	beforeEach(() => {
		mockListResult = [];
		mockCreateResult = null;
	});

	describe('GET /api/meal-types', () => {
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
	});
});
