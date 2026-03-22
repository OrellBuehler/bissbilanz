import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

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
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns data for valid date range', async () => {
			mockWeightFoodResult = [{ date: '2026-01-01', calories: 2000, weightKg: 75.5 }];
			const event = createMockEvent({ user: TEST_USER, searchParams: VALID_DATE_PARAMS });
			const response = await weightFoodModule.GET(event);
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
			expect(response.status).toBe(400);
		});

		test('returns 400 when endDate missing', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-01-01' }
			});
			const response = await weightFoodModule.GET(event);
			expect(response.status).toBe(400);
		});

		test('returns 400 for invalid date format', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: 'Jan 1 2026', endDate: '2026-03-01' }
			});
			const response = await weightFoodModule.GET(event);
			expect(response.status).toBe(400);
		});

		test('returns 400 when startDate > endDate', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-03-01', endDate: '2026-01-01' }
			});
			const response = await weightFoodModule.GET(event);
			expect(response.status).toBe(400);
		});

		test('returns 400 for date range > 366 days', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2025-01-01', endDate: '2026-03-01' }
			});
			const response = await weightFoodModule.GET(event);
			expect(response.status).toBe(400);
		});

		test('accepts exactly 366 days range', async () => {
			mockWeightFoodResult = [];
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2025-01-01', endDate: '2026-01-02' }
			});
			const response = await weightFoodModule.GET(event);
			expect(response.status).toBe(200);
		});

		test('accepts same startDate and endDate', async () => {
			mockWeightFoodResult = [];
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-01-01', endDate: '2026-01-01' }
			});
			const response = await weightFoodModule.GET(event);
			expect(response.status).toBe(200);
		});
	});

	describe('GET /api/analytics/nutrients-daily', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, searchParams: VALID_DATE_PARAMS });
			const response = await nutrientsDailyModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns data for valid date range', async () => {
			mockNutrientsDailyResult = [{ date: '2026-01-01', nutrients: { protein: 120 } }];
			const event = createMockEvent({ user: TEST_USER, searchParams: VALID_DATE_PARAMS });
			const response = await nutrientsDailyModule.GET(event);
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
			expect(response.status).toBe(400);
		});

		test('returns 400 when startDate > endDate', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-03-01', endDate: '2026-01-01' }
			});
			const response = await nutrientsDailyModule.GET(event);
			expect(response.status).toBe(400);
		});

		test('returns 400 for date range > 366 days', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2024-01-01', endDate: '2026-01-01' }
			});
			const response = await nutrientsDailyModule.GET(event);
			expect(response.status).toBe(400);
		});
	});

	describe('GET /api/analytics/meal-timing', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, searchParams: VALID_DATE_PARAMS });
			const response = await mealTimingModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns data for valid date range', async () => {
			mockMealTimingResult = {
				dailyWindows: [],
				avgWindowMinutes: 0,
				lateNightFrequency: 0,
				hourlyDistribution: new Array(24).fill(0)
			};
			const event = createMockEvent({ user: TEST_USER, searchParams: VALID_DATE_PARAMS });
			const response = await mealTimingModule.GET(event);
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
			expect(response.status).toBe(400);
		});

		test('returns 400 when startDate > endDate', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-03-01', endDate: '2026-01-01' }
			});
			const response = await mealTimingModule.GET(event);
			expect(response.status).toBe(400);
		});

		test('returns 400 for date range > 366 days', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2024-01-01', endDate: '2026-01-01' }
			});
			const response = await mealTimingModule.GET(event);
			expect(response.status).toBe(400);
		});
	});

	describe('GET /api/analytics/sleep-food', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null, searchParams: VALID_DATE_PARAMS });
			const response = await sleepFoodModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns data for valid date range', async () => {
			mockSleepFoodResult = { foodImpacts: [], overallAvgQuality: 7 };
			const event = createMockEvent({ user: TEST_USER, searchParams: VALID_DATE_PARAMS });
			const response = await sleepFoodModule.GET(event);
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
			expect(response.status).toBe(400);
		});

		test('returns 400 when startDate > endDate', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-03-01', endDate: '2026-01-01' }
			});
			const response = await sleepFoodModule.GET(event);
			expect(response.status).toBe(400);
		});

		test('returns 400 for date range > 366 days', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2024-01-01', endDate: '2026-01-01' }
			});
			const response = await sleepFoodModule.GET(event);
			expect(response.status).toBe(400);
		});
	});
});
