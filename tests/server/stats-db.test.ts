import { describe, test, expect, beforeEach, vi } from 'vitest';
import { TEST_USER } from '../helpers/fixtures';

// Mock listEntriesByDateRange to return test data
let mockEntriesResult: Array<{
	date: string;
	servings: number;
	calories: number | null;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
	fiber: number | null;
}> = [];

const setMockEntries = (
	entries: Array<{
		date: string;
		servings: number;
		calories: number | null;
		protein: number | null;
		carbs: number | null;
		fat: number | null;
		fiber: number | null;
	}>
) => {
	mockEntriesResult = entries;
};

const resetMockEntries = () => {
	mockEntriesResult = [];
};

// Mock the entries module
vi.mock('$lib/server/entries', () => ({
	listEntriesByDateRange: async (userId: string, startDate: string, endDate: string) => {
		return mockEntriesResult;
	},
	listEntriesByDate: async () => ({ items: [], total: 0 }),
	createEntry: async () => ({ success: false, error: new Error('not implemented') }),
	updateEntry: async () => ({ success: false, error: new Error('not implemented') }),
	deleteEntry: async () => {},
	copyEntries: async () => [],
	toEntryUpdate: () => ({})
}));

// Mock day-properties module (no fasting days by default)
let mockFastingDays = new Set<string>();
const setMockFastingDays = (days: string[]) => {
	mockFastingDays = new Set(days);
};
const resetMockFastingDays = () => {
	mockFastingDays = new Set();
};
vi.mock('$lib/server/day-properties', () => ({
	getFastingDays: async () => mockFastingDays,
	getFastingDaysForDates: async () => mockFastingDays,
	getDayProperties: async () => null,
	getDayPropertiesRange: async () => [],
	setDayProperties: async () => null,
	deleteDayProperties: async () => false
}));

// Import after mocking
const { getWeeklyStats, getMonthlyStats } = await import('$lib/server/stats');

describe('stats-db', () => {
	beforeEach(() => {
		resetMockEntries();
		resetMockFastingDays();
	});

	describe('getWeeklyStats', () => {
		test('returns average of last 7 days', async () => {
			// Mock 7 days of entries (2 entries per day, same values for consistency)
			setMockEntries([
				// Day 1
				{
					date: '2026-02-04',
					servings: 1,
					calories: 500,
					protein: 25,
					carbs: 50,
					fat: 20,
					fiber: 10
				},
				{
					date: '2026-02-04',
					servings: 1,
					calories: 300,
					protein: 15,
					carbs: 30,
					fat: 10,
					fiber: 5
				},
				// Day 2
				{
					date: '2026-02-05',
					servings: 1,
					calories: 500,
					protein: 25,
					carbs: 50,
					fat: 20,
					fiber: 10
				},
				{
					date: '2026-02-05',
					servings: 1,
					calories: 300,
					protein: 15,
					carbs: 30,
					fat: 10,
					fiber: 5
				},
				// Day 3
				{
					date: '2026-02-06',
					servings: 1,
					calories: 500,
					protein: 25,
					carbs: 50,
					fat: 20,
					fiber: 10
				},
				{
					date: '2026-02-06',
					servings: 1,
					calories: 300,
					protein: 15,
					carbs: 30,
					fat: 10,
					fiber: 5
				},
				// Day 4
				{
					date: '2026-02-07',
					servings: 1,
					calories: 500,
					protein: 25,
					carbs: 50,
					fat: 20,
					fiber: 10
				},
				{
					date: '2026-02-07',
					servings: 1,
					calories: 300,
					protein: 15,
					carbs: 30,
					fat: 10,
					fiber: 5
				},
				// Day 5
				{
					date: '2026-02-08',
					servings: 1,
					calories: 500,
					protein: 25,
					carbs: 50,
					fat: 20,
					fiber: 10
				},
				{
					date: '2026-02-08',
					servings: 1,
					calories: 300,
					protein: 15,
					carbs: 30,
					fat: 10,
					fiber: 5
				},
				// Day 6
				{
					date: '2026-02-09',
					servings: 1,
					calories: 500,
					protein: 25,
					carbs: 50,
					fat: 20,
					fiber: 10
				},
				{
					date: '2026-02-09',
					servings: 1,
					calories: 300,
					protein: 15,
					carbs: 30,
					fat: 10,
					fiber: 5
				},
				// Day 7
				{
					date: '2026-02-10',
					servings: 1,
					calories: 500,
					protein: 25,
					carbs: 50,
					fat: 20,
					fiber: 10
				},
				{
					date: '2026-02-10',
					servings: 1,
					calories: 300,
					protein: 15,
					carbs: 30,
					fat: 10,
					fiber: 5
				}
			]);

			const result = await getWeeklyStats(TEST_USER.id);

			// Each day has exactly 800 calories, 40g protein, 80g carbs, 30g fat, 15g fiber
			// Average across 7 days should be the same
			expect(result.calories).toBe(800);
			expect(result.protein).toBe(40);
			expect(result.carbs).toBe(80);
			expect(result.fat).toBe(30);
			expect(result.fiber).toBe(15);
		});

		test('handles empty entries', async () => {
			setMockEntries([]);

			const result = await getWeeklyStats(TEST_USER.id);

			// Should return zeros when no entries
			expect(result.calories).toBe(0);
			expect(result.protein).toBe(0);
			expect(result.carbs).toBe(0);
			expect(result.fat).toBe(0);
			expect(result.fiber).toBe(0);
		});

		test('handles entries with null values', async () => {
			setMockEntries([
				{
					date: '2026-02-10',
					servings: 1,
					calories: null,
					protein: null,
					carbs: null,
					fat: null,
					fiber: null
				}
			]);

			const result = await getWeeklyStats(TEST_USER.id);

			// Should handle null values gracefully
			expect(result.calories).toBe(0);
			expect(result.protein).toBe(0);
			expect(result.carbs).toBe(0);
			expect(result.fat).toBe(0);
			expect(result.fiber).toBe(0);
		});

		test('handles partial week data', async () => {
			// Only 2 days of data
			setMockEntries([
				{
					date: '2026-02-09',
					servings: 1,
					calories: 500,
					protein: 25,
					carbs: 50,
					fat: 20,
					fiber: 10
				},
				{
					date: '2026-02-10',
					servings: 1,
					calories: 600,
					protein: 30,
					carbs: 60,
					fat: 25,
					fiber: 12
				}
			]);

			const result = await getWeeklyStats(TEST_USER.id);

			// Should average only the 2 days provided
			expect(result.calories).toBe(550);
			expect(result.protein).toBe(27.5);
			expect(result.carbs).toBe(55);
			expect(result.fat).toBe(22.5);
			expect(result.fiber).toBe(11);
		});

		test('correctly groups multiple entries per day', async () => {
			// Single day with 3 entries
			setMockEntries([
				{
					date: '2026-02-10',
					servings: 1,
					calories: 300,
					protein: 15,
					carbs: 30,
					fat: 10,
					fiber: 5
				},
				{
					date: '2026-02-10',
					servings: 1,
					calories: 400,
					protein: 20,
					carbs: 40,
					fat: 15,
					fiber: 8
				},
				{
					date: '2026-02-10',
					servings: 1,
					calories: 300,
					protein: 15,
					carbs: 30,
					fat: 10,
					fiber: 5
				}
			]);

			const result = await getWeeklyStats(TEST_USER.id);

			// Should sum all 3 entries for the day (total: 1000 calories, 50g protein, etc.)
			expect(result.calories).toBe(1000);
			expect(result.protein).toBe(50);
			expect(result.carbs).toBe(100);
			expect(result.fat).toBe(35);
			expect(result.fiber).toBe(18);
		});

		test('fasting day lowers average by adding a 0-calorie day', async () => {
			// 1 day with 800 calories + 1 fasting day with 0
			setMockEntries([
				{
					date: '2026-03-15',
					servings: 1,
					calories: 800,
					protein: 40,
					carbs: 80,
					fat: 30,
					fiber: 15
				}
			]);
			// Fasting day within the weekly range with no entries
			setMockFastingDays(['2026-03-14']);

			const result = await getWeeklyStats(TEST_USER.id);

			// Average of 800 and 0 = 400
			expect(result.calories).toBe(400);
			expect(result.protein).toBe(20);
			expect(result.carbs).toBe(40);
			expect(result.fat).toBe(15);
			expect(result.fiber).toBe(7.5);
		});
	});

	describe('getMonthlyStats', () => {
		test('returns average of last 30 days', async () => {
			// Mock 30 days of entries (1 entry per day for simplicity)
			const entries = [];
			for (let i = 0; i < 30; i++) {
				const date = new Date('2026-02-10');
				date.setDate(date.getDate() - i);
				const dateStr = date.toISOString().split('T')[0];
				entries.push({
					date: dateStr,
					servings: 1,
					calories: 500 + i * 10, // Varying calories
					protein: 25 + i,
					carbs: 50 + i * 2,
					fat: 20 + i * 0.5,
					fiber: 10 + i * 0.3
				});
			}
			setMockEntries(entries);

			const result = await getMonthlyStats(TEST_USER.id);

			// Should return average across all 30 days
			expect(result.calories).toBeGreaterThan(500);
			expect(result.protein).toBeGreaterThan(25);
			expect(result.carbs).toBeGreaterThan(50);
			expect(result.fat).toBeGreaterThan(20);
			expect(result.fiber).toBeGreaterThan(10);
		});

		test('handles empty entries', async () => {
			setMockEntries([]);

			const result = await getMonthlyStats(TEST_USER.id);

			// Should return zeros when no entries
			expect(result.calories).toBe(0);
			expect(result.protein).toBe(0);
			expect(result.carbs).toBe(0);
			expect(result.fat).toBe(0);
			expect(result.fiber).toBe(0);
		});

		test('handles entries with null values', async () => {
			setMockEntries([
				{
					date: '2026-02-10',
					servings: 1,
					calories: null,
					protein: null,
					carbs: null,
					fat: null,
					fiber: null
				}
			]);

			const result = await getMonthlyStats(TEST_USER.id);

			// Should handle null values gracefully
			expect(result.calories).toBe(0);
			expect(result.protein).toBe(0);
			expect(result.carbs).toBe(0);
			expect(result.fat).toBe(0);
			expect(result.fiber).toBe(0);
		});

		test('handles partial month data', async () => {
			// Only 5 days of data
			setMockEntries([
				{
					date: '2026-02-06',
					servings: 1,
					calories: 500,
					protein: 25,
					carbs: 50,
					fat: 20,
					fiber: 10
				},
				{
					date: '2026-02-07',
					servings: 1,
					calories: 600,
					protein: 30,
					carbs: 60,
					fat: 25,
					fiber: 12
				},
				{
					date: '2026-02-08',
					servings: 1,
					calories: 550,
					protein: 27,
					carbs: 55,
					fat: 22,
					fiber: 11
				},
				{
					date: '2026-02-09',
					servings: 1,
					calories: 650,
					protein: 32,
					carbs: 65,
					fat: 27,
					fiber: 13
				},
				{
					date: '2026-02-10',
					servings: 1,
					calories: 700,
					protein: 35,
					carbs: 70,
					fat: 30,
					fiber: 15
				}
			]);

			const result = await getMonthlyStats(TEST_USER.id);

			// Should average only the 5 days provided
			expect(result.calories).toBe(600);
			expect(result.protein).toBe(29.8);
			expect(result.carbs).toBe(60);
			expect(result.fat).toBe(24.8);
			expect(result.fiber).toBe(12.2);
		});

		test('correctly groups multiple entries per day', async () => {
			// 3 days with varying number of entries
			setMockEntries([
				// Day 1: 2 entries
				{
					date: '2026-02-08',
					servings: 1,
					calories: 300,
					protein: 15,
					carbs: 30,
					fat: 10,
					fiber: 5
				},
				{
					date: '2026-02-08',
					servings: 1,
					calories: 400,
					protein: 20,
					carbs: 40,
					fat: 15,
					fiber: 8
				},
				// Day 2: 1 entry
				{
					date: '2026-02-09',
					servings: 1,
					calories: 500,
					protein: 25,
					carbs: 50,
					fat: 20,
					fiber: 10
				},
				// Day 3: 3 entries
				{
					date: '2026-02-10',
					servings: 1,
					calories: 200,
					protein: 10,
					carbs: 20,
					fat: 8,
					fiber: 4
				},
				{
					date: '2026-02-10',
					servings: 1,
					calories: 300,
					protein: 15,
					carbs: 30,
					fat: 12,
					fiber: 6
				},
				{
					date: '2026-02-10',
					servings: 1,
					calories: 400,
					protein: 20,
					carbs: 40,
					fat: 15,
					fiber: 8
				}
			]);

			const result = await getMonthlyStats(TEST_USER.id);

			// Day 1: 700 cal, Day 2: 500 cal, Day 3: 900 cal
			// Average: (700 + 500 + 900) / 3 = 700
			expect(result.calories).toBe(700);
			expect(result.protein).toBe(35);
			expect(result.carbs).toBe(70);
			expect(result.fat).toBe(26.666666666666668);
			expect(result.fiber).toBe(13.666666666666666);
		});
	});
});
