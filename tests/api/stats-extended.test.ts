import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER, TEST_GOALS } from '../helpers/fixtures';

let mockCalendarResult: any = null;
let mockDailyBreakdownResult: any = null;
let mockMealBreakdownResult: any = null;
let mockTopFoodsResult: any = null;
let mockStreaksResult: any = null;
let mockGoalsResult: any = null;

mock.module('$lib/server/stats', () => ({
	getCalendarStats: async () => mockCalendarResult,
	getDailyBreakdown: async () => mockDailyBreakdownResult,
	getMealBreakdown: async () => mockMealBreakdownResult,
	getTopFoods: async () => mockTopFoodsResult,
	getStreaks: async () => mockStreaksResult
}));

mock.module('$lib/server/goals', () => ({
	getGoals: async () => mockGoalsResult
}));

const calendarModule = await import('../../src/routes/api/stats/calendar/+server');
const dailyModule = await import('../../src/routes/api/stats/daily/+server');
const mealBreakdownModule = await import('../../src/routes/api/stats/meal-breakdown/+server');
const topFoodsModule = await import('../../src/routes/api/stats/top-foods/+server');
const streaksModule = await import('../../src/routes/api/stats/streaks/+server');

describe('api/stats - extended endpoints', () => {
	beforeEach(() => {
		mockCalendarResult = null;
		mockDailyBreakdownResult = null;
		mockMealBreakdownResult = null;
		mockTopFoodsResult = null;
		mockStreaksResult = null;
		mockGoalsResult = null;
	});

	describe('GET /api/stats/calendar', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				searchParams: { month: '2026-02' }
			});
			const response = await calendarModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns calendar stats for valid month', async () => {
			mockCalendarResult = { days: [{ date: '2026-02-01', calories: 2000 }] };
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { month: '2026-02' }
			});
			const response = await calendarModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
		});

		test('returns 400 when month parameter missing', async () => {
			const event = createMockEvent({ user: TEST_USER });
			const response = await calendarModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toContain('month');
		});

		test('returns 400 for invalid month format', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { month: '2026-2' }
			});
			const response = await calendarModule.GET(event);
			expect(response.status).toBe(400);
		});

		test('returns 400 for invalid month value', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { month: '2026-13' }
			});
			const response = await calendarModule.GET(event);
			expect(response.status).toBe(400);
		});

		test('returns 400 for month 00', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { month: '2026-00' }
			});
			const response = await calendarModule.GET(event);
			expect(response.status).toBe(400);
		});
	});

	describe('GET /api/stats/daily', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				searchParams: { startDate: '2026-02-01', endDate: '2026-02-07' }
			});
			const response = await dailyModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns daily breakdown with goals', async () => {
			mockDailyBreakdownResult = [{ date: '2026-02-01', calories: 2000 }];
			mockGoalsResult = TEST_GOALS;
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-02-01', endDate: '2026-02-07' }
			});
			const response = await dailyModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.data).toBeDefined();
			expect(data.goals).toBeDefined();
			expect(data.goals.calorieGoal).toBe(2000);
		});

		test('returns null goals when user has none', async () => {
			mockDailyBreakdownResult = [];
			mockGoalsResult = null;
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-02-01', endDate: '2026-02-07' }
			});
			const response = await dailyModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.goals).toBeNull();
		});

		test('returns 400 when startDate missing', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { endDate: '2026-02-07' }
			});
			const response = await dailyModule.GET(event);
			expect(response.status).toBe(400);
		});

		test('returns 400 when endDate missing', async () => {
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-02-01' }
			});
			const response = await dailyModule.GET(event);
			expect(response.status).toBe(400);
		});

		test('returns 400 when both dates missing', async () => {
			const event = createMockEvent({ user: TEST_USER });
			const response = await dailyModule.GET(event);
			expect(response.status).toBe(400);
		});
	});

	describe('GET /api/stats/meal-breakdown', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({
				user: null,
				searchParams: { date: '2026-02-10' }
			});
			const response = await mealBreakdownModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns meal breakdown for single date', async () => {
			mockMealBreakdownResult = [{ mealType: 'breakfast', calories: 500 }];
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { date: '2026-02-10' }
			});
			const response = await mealBreakdownModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.data).toBeDefined();
		});

		test('returns meal breakdown for date range', async () => {
			mockMealBreakdownResult = [];
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { startDate: '2026-02-01', endDate: '2026-02-10' }
			});
			const response = await mealBreakdownModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
		});

		test('returns 400 when no date parameters', async () => {
			const event = createMockEvent({ user: TEST_USER });
			const response = await mealBreakdownModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toContain('date');
		});
	});

	describe('GET /api/stats/top-foods', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			const response = await topFoodsModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns top foods with default params', async () => {
			mockTopFoodsResult = [{ name: 'Oats', count: 15 }];
			const event = createMockEvent({ user: TEST_USER });
			const response = await topFoodsModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.data).toBeDefined();
		});

		test('accepts custom days and limit params', async () => {
			mockTopFoodsResult = [];
			const event = createMockEvent({
				user: TEST_USER,
				searchParams: { days: '30', limit: '5' }
			});
			const response = await topFoodsModule.GET(event);
			expect(response.status).toBe(200);
		});
	});

	describe('GET /api/stats/streaks', () => {
		test('returns 401 when not authenticated', async () => {
			const event = createMockEvent({ user: null });
			const response = await streaksModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		test('returns streak data', async () => {
			mockStreaksResult = { currentStreak: 5, longestStreak: 14 };
			const event = createMockEvent({ user: TEST_USER });
			const response = await streaksModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.currentStreak).toBe(5);
			expect(data.longestStreak).toBe(14);
		});
	});
});
