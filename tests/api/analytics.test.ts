import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';
import { expectResponseContract } from '../helpers/contract';

let mockWeightFoodResult: any = [];
let mockNutrientsDailyResult: any = [];
let mockMealTimingResult: any = {};
let mockSleepFoodResult: any = [];

vi.mock('$lib/server/analytics', () => ({
	getWeightFoodSeries: async () => mockWeightFoodResult,
	getDailyNutrientTotals: async () => mockNutrientsDailyResult,
	getMealTimingData: async () => mockMealTimingResult,
	getSleepFoodCorrelationData: async () => mockSleepFoodResult
}));

const weightFoodModule = await import('../../src/routes/api/analytics/weight-food/+server');
const nutrientsDailyModule = await import('../../src/routes/api/analytics/nutrients-daily/+server');
const mealTimingModule = await import('../../src/routes/api/analytics/meal-timing/+server');
const sleepFoodModule = await import('../../src/routes/api/analytics/sleep-food/+server');

const VALID_DATE_PARAMS = { startDate: '2026-01-01', endDate: '2026-03-01' };

describe('api/analytics', () => {
	beforeEach(() => {
		mockWeightFoodResult = [];
		mockNutrientsDailyResult = [];
		mockMealTimingResult = {};
		mockSleepFoodResult = [];
	});

	describe('GET /api/analytics/weight-food', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, searchParams: VALID_DATE_PARAMS });
			const response = await weightFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/weight-food', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns data for valid date range', async () => {
			mockWeightFoodResult = [
				{ date: '2026-01-01', calories: 2000, weightKg: 75.5, movingAvg: 75.5 }
			];
			const event = createMockEvent({ user: TEST_USER, searchParams: VALID_DATE_PARAMS });
			const response = await weightFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/weight-food', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.data).toHaveLength(1);
		});

		test('returns 400 when startDate missing', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { endDate: '2026-03-01' }
			});
			const response = await weightFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/weight-food', response);
			expect(response.status).toBe(400);
		});

		test('returns 400 when endDate missing', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-01-01' }
			});
			const response = await weightFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/weight-food', response);
			expect(response.status).toBe(400);
		});

		test('returns 400 for invalid date format', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: 'Jan 1 2026', endDate: '2026-03-01' }
			});
			const response = await weightFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/weight-food', response);
			expect(response.status).toBe(400);
		});

		test('returns 400 when startDate > endDate', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-03-01', endDate: '2026-01-01' }
			});
			const response = await weightFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/weight-food', response);
			expect(response.status).toBe(400);
		});

		test('returns 400 for date range > 366 days', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2025-01-01', endDate: '2026-03-01' }
			});
			const response = await weightFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/weight-food', response);
			expect(response.status).toBe(400);
		});

		test('accepts exactly 366 days range', async () => {
			mockWeightFoodResult = [];
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2025-01-01', endDate: '2026-01-02' }
			});
			const response = await weightFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/weight-food', response);
			expect(response.status).toBe(200);
		});

		test('accepts same startDate and endDate', async () => {
			mockWeightFoodResult = [];
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-01-01', endDate: '2026-01-01' }
			});
			const response = await weightFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/weight-food', response);
			expect(response.status).toBe(200);
		});
	});

	describe('GET /api/analytics/nutrients-daily', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, searchParams: VALID_DATE_PARAMS });
			const response = await nutrientsDailyModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/nutrients-daily', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns data for valid date range', async () => {
			mockNutrientsDailyResult = [
				{ date: '2026-01-01', calories: 2000, protein: 120, carbs: 200, fat: 60, fiber: 25 }
			];
			const event = createMockEvent({ user: TEST_USER, searchParams: VALID_DATE_PARAMS });
			const response = await nutrientsDailyModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/nutrients-daily', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.data).toHaveLength(1);
		});

		test('returns 400 for invalid date format', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026/01/01', endDate: '2026-03-01' }
			});
			const response = await nutrientsDailyModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/nutrients-daily', response);
			expect(response.status).toBe(400);
		});

		test('returns 400 when startDate > endDate', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-03-01', endDate: '2026-01-01' }
			});
			const response = await nutrientsDailyModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/nutrients-daily', response);
			expect(response.status).toBe(400);
		});

		test('returns 400 for date range > 366 days', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2024-01-01', endDate: '2026-01-01' }
			});
			const response = await nutrientsDailyModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/nutrients-daily', response);
			expect(response.status).toBe(400);
		});
	});

	describe('GET /api/analytics/meal-timing', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, searchParams: VALID_DATE_PARAMS });
			const response = await mealTimingModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/meal-timing', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns data for valid date range', async () => {
			mockMealTimingResult = [
				{
					date: '2026-01-01',
					mealType: 'Breakfast',
					eatenAt: '2026-01-01T08:00:00.000Z',
					foodId: null,
					recipeId: null,
					calories: 300,
					foodName: 'Oats'
				}
			];
			const event = createMockEvent({ user: TEST_USER, searchParams: VALID_DATE_PARAMS });
			const response = await mealTimingModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/meal-timing', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.data).toBeDefined();
		});

		test('returns 400 for invalid date format', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: 'bad-date', endDate: '2026-03-01' }
			});
			const response = await mealTimingModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/meal-timing', response);
			expect(response.status).toBe(400);
		});

		test('returns 400 when startDate > endDate', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-03-01', endDate: '2026-01-01' }
			});
			const response = await mealTimingModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/meal-timing', response);
			expect(response.status).toBe(400);
		});

		test('returns 400 for date range > 366 days', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2024-01-01', endDate: '2026-01-01' }
			});
			const response = await mealTimingModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/meal-timing', response);
			expect(response.status).toBe(400);
		});
	});

	describe('GET /api/analytics/sleep-food', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, searchParams: VALID_DATE_PARAMS });
			const response = await sleepFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/sleep-food', response);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns data for valid date range', async () => {
			mockSleepFoodResult = [
				{ date: '2026-01-01', eveningCalories: 500, sleepDurationMinutes: 420, sleepQuality: 7 }
			];
			const event = createMockEvent({ user: TEST_USER, searchParams: VALID_DATE_PARAMS });
			const response = await sleepFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/sleep-food', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.data).toBeDefined();
		});

		test('returns 400 for invalid date format', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-01-01', endDate: 'march-2026' }
			});
			const response = await sleepFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/sleep-food', response);
			expect(response.status).toBe(400);
		});

		test('returns 400 when startDate > endDate', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-03-01', endDate: '2026-01-01' }
			});
			const response = await sleepFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/sleep-food', response);
			expect(response.status).toBe(400);
		});

		test('returns 400 for date range > 366 days', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2024-01-01', endDate: '2026-01-01' }
			});
			const response = await sleepFoodModule.GET(event);
			await expectResponseContract('GET', '/api/analytics/sleep-food', response);
			expect(response.status).toBe(400);
		});
	});
});
