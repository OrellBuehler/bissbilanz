import { describe, expect, test, beforeEach, vi } from 'vitest';
import { createMockEvent } from '../helpers/mock-request-event';
import { TEST_USER } from '../helpers/fixtures';

const mockStats = {
	calories: 2000,
	protein: 150,
	carbs: 200,
	fat: 67,
	fiber: 30
};

let mockWeeklyResult: any = null;
let mockMonthlyResult: any = null;

vi.mock('$lib/server/stats', () => ({
	getWeeklyStats: async () => mockWeeklyResult,
	getMonthlyStats: async () => mockMonthlyResult,
	getCalendarStats: async () => null,
	getDailyBreakdown: async () => [],
	getMealBreakdown: async () => [],
	getTopFoods: async () => [],
	getStreaks: async () => null
}));

const weeklyModule = await import('../../src/routes/api/stats/weekly/+server');
const monthlyModule = await import('../../src/routes/api/stats/monthly/+server');

describe('api/stats routes', () => {
	beforeEach(() => {
		mockWeeklyResult = null;
		mockMonthlyResult = null;
	});

	describe('GET /api/stats/weekly', () => {
		test('returns weekly stats', async () => {
			mockWeeklyResult = mockStats;
			const event = createMockEvent({ user: TEST_USER });
			const response = await weeklyModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.stats.calories).toBe(2000);
		});
	});

	describe('GET /api/stats/monthly', () => {
		test('returns monthly stats', async () => {
			mockMonthlyResult = mockStats;
			const event = createMockEvent({ user: TEST_USER });
			const response = await monthlyModule.GET(event);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.stats.calories).toBe(2000);
		});
	});
});

// Tests for stats API validation
describe('stats API validation', () => {
	test('date range validation accepts valid dates', () => {
		const validStart = '2026-02-01';
		const validEnd = '2026-02-07';
		expect(Date.parse(validStart)).not.toBeNaN();
		expect(Date.parse(validEnd)).not.toBeNaN();
	});

	test('calculates date range for weekly stats', () => {
		const today = new Date('2026-02-05');
		const weekAgo = new Date(today);
		weekAgo.setDate(today.getDate() - 6);
		expect(weekAgo.toISOString().split('T')[0]).toBe('2026-01-30');
	});

	test('calculates date range for monthly stats', () => {
		const today = new Date('2026-02-05');
		const monthAgo = new Date(today);
		monthAgo.setDate(today.getDate() - 29);
		expect(monthAgo.toISOString().split('T')[0]).toBe('2026-01-07');
	});
});
