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

	test('leaves goals untouched when activity goal adjustment is disabled', () => {
		const result = formatDailyStatus({
			entries: [],
			goals: { calorieGoal: 2000, proteinGoal: 150, carbGoal: 200, fatGoal: 65, fiberGoal: 30 },
			dayProperties: { activityCalories: 400 },
			preferences: { activityGoalAdjustment: false, activityCreditPercent: 100 }
		});
		expect(result.goals?.calorieGoal).toBe(2000);
		expect('activityBonus' in result).toBe(false);
		expect('baseGoals' in result).toBe(false);
	});

	test('raises goals and progress when activity goal adjustment is enabled', () => {
		const result = formatDailyStatus({
			entries: [{ calories: 1200, protein: 90, carbs: 120, fat: 39, fiber: 18, servings: 1 }],
			goals: { calorieGoal: 2000, proteinGoal: 150, carbGoal: 200, fatGoal: 65, fiberGoal: 30 },
			dayProperties: { activityCalories: 400 },
			preferences: { activityGoalAdjustment: true, activityCreditPercent: 100 }
		});
		expect(result.goals?.calorieGoal).toBe(2400);
		expect(result.activityBonus).toBe(400);
		expect(result.baseGoals?.calorieGoal).toBe(2000);
		// progress computed against the adjusted goal: 1200 / 2400 = 50%
		expect(result.progress?.calories).toBe(50);
	});

	test('does not adjust goals when the day has no activity calories', () => {
		const result = formatDailyStatus({
			entries: [],
			goals: { calorieGoal: 2000, proteinGoal: 150, carbGoal: 200, fatGoal: 65, fiberGoal: 30 },
			preferences: { activityGoalAdjustment: true, activityCreditPercent: 100 }
		});
		expect(result.goals?.calorieGoal).toBe(2000);
		expect('activityBonus' in result).toBe(false);
	});
});
