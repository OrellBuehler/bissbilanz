import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_GOALS, VALID_GOALS_PAYLOAD } from '../helpers/fixtures';

// Mock the goals module
let mockGoalsResult: any = null;
let mockUpsertResult: any = null;

mock.module('$lib/server/goals', () => ({
	getGoals: async (userId: string) => mockGoalsResult,
	upsertGoals: async (userId: string, payload: unknown) => mockUpsertResult
}));

// Import route handlers after mocking
const { GET, POST } = await import('../../src/routes/api/goals/+server');

describe('api/goals', () => {
	beforeEach(() => {
		mockGoalsResult = null;
		mockUpsertResult = null;
	});

	describe('GET /api/goals', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });

			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns goals when authenticated', async () => {
			mockGoalsResult = TEST_GOALS;
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.goals.userId).toBe(TEST_GOALS.userId);
			expect(data.goals.calorieGoal).toBe(TEST_GOALS.calorieGoal);
			expect(data.goals.proteinGoal).toBe(TEST_GOALS.proteinGoal);
		});

		test('returns null goals when user has no goals', async () => {
			mockGoalsResult = null;
			const event = createMockEvent({ user: TEST_USER });

			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.goals).toBeNull();
		});
	});

	describe('POST /api/goals', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				body: VALID_GOALS_PAYLOAD
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('creates/updates goals with valid payload', async () => {
			mockUpsertResult = TEST_GOALS;
			const event = createMockEvent({
				user: TEST_USER,
				body: VALID_GOALS_PAYLOAD
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.goals.calorieGoal).toBe(TEST_GOALS.calorieGoal);
			expect(data.goals.proteinGoal).toBe(TEST_GOALS.proteinGoal);
		});

		test('accepts partial goals update', async () => {
			const partialGoals = {
				calorieGoal: 2500,
				proteinGoal: 180
			};
			mockUpsertResult = { ...TEST_GOALS, ...partialGoals };

			const event = createMockEvent({
				user: TEST_USER,
				body: partialGoals
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.goals).toBeTruthy();
		});

		test('accepts null values for optional nutrients', async () => {
			const goalsWithNulls = {
				calorieGoal: 2000,
				proteinGoal: 150,
				carbGoal: 200,
				fatGoal: 67,
				fiberGoal: null,
				sodiumGoal: null,
				sugarGoal: null
			};
			mockUpsertResult = { ...TEST_GOALS, ...goalsWithNulls };

			const event = createMockEvent({
				user: TEST_USER,
				body: goalsWithNulls
			});

			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.goals).toBeTruthy();
		});
	});
});
