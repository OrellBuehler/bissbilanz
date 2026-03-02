import { describe, expect, test } from 'vitest';
import { formatDailyStatus } from '../../src/lib/server/mcp/format';

describe('formatDailyStatus', () => {
	test('returns totals and goals', () => {
		const result = formatDailyStatus({
			entries: [],
			goals: { calorieGoal: 2000, proteinGoal: 150, carbGoal: 200, fatGoal: 65, fiberGoal: 30 }
		});
		expect(result.totals).toBeTruthy();
		expect(result.goals).toBeTruthy();
	});

	test('calculates totals from entries with servings', () => {
		const result = formatDailyStatus({
			entries: [
				{ calories: 500, protein: 30, carbs: 50, fat: 20, fiber: 5, servings: 1 },
				{ calories: 300, protein: 20, carbs: 30, fat: 10, fiber: 3, servings: 2 }
			],
			goals: null
		});
		// 500*1 + 300*2 = 1100
		expect(result.totals.calories).toBe(1100);
	});
});
