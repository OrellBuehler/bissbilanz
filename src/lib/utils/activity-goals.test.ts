import { describe, it, expect } from 'vitest';
import { adjustGoalsForActivity } from './activity-goals';

const GOALS = {
	calorieGoal: 2000,
	proteinGoal: 150,
	carbGoal: 200,
	fatGoal: 65,
	fiberGoal: 30
};

describe('adjustGoalsForActivity', () => {
	it('returns null when goals is null', () => {
		expect(adjustGoalsForActivity(null, 400, { enabled: true, creditPercent: 100 })).toBeNull();
	});

	it('returns goals with zero bonus when disabled', () => {
		const result = adjustGoalsForActivity(GOALS, 400, { enabled: false, creditPercent: 100 });
		expect(result).toEqual({ ...GOALS, activityBonus: 0 });
	});

	it('returns goals with zero bonus when activityCalories is null', () => {
		const result = adjustGoalsForActivity(GOALS, null, { enabled: true, creditPercent: 100 });
		expect(result).toEqual({ ...GOALS, activityBonus: 0 });
	});

	it('returns goals with zero bonus when activityCalories is 0', () => {
		const result = adjustGoalsForActivity(GOALS, 0, { enabled: true, creditPercent: 100 });
		expect(result).toEqual({ ...GOALS, activityBonus: 0 });
	});

	it('returns goals with zero bonus when calorieGoal is 0', () => {
		const goals = { ...GOALS, calorieGoal: 0 };
		const result = adjustGoalsForActivity(goals, 400, { enabled: true, creditPercent: 100 });
		expect(result).toEqual({ ...goals, activityBonus: 0 });
	});

	it('raises calories and macros proportionally at 100% credit', () => {
		const result = adjustGoalsForActivity(GOALS, 400, { enabled: true, creditPercent: 100 });
		expect(result?.calorieGoal).toBe(2400);
		expect(result?.activityBonus).toBe(400);
		// factor = 2400 / 2000 = 1.2
		expect(result?.proteinGoal).toBe(180);
		expect(result?.carbGoal).toBe(240);
		expect(result?.fatGoal).toBe(78);
		expect(result?.fiberGoal).toBe(36);
	});

	it('applies a partial credit percent', () => {
		const result = adjustGoalsForActivity(GOALS, 400, { enabled: true, creditPercent: 50 });
		expect(result?.activityBonus).toBe(200);
		expect(result?.calorieGoal).toBe(2200);
		// factor = 2200 / 2000 = 1.1
		expect(result?.proteinGoal).toBe(165);
		expect(result?.carbGoal).toBe(220);
		expect(result?.fatGoal).toBe(72);
		expect(result?.fiberGoal).toBe(33);
	});

	it('rounds the bonus and the adjusted macro goals', () => {
		const result = adjustGoalsForActivity(GOALS, 333, { enabled: true, creditPercent: 70 });
		// 333 * 0.7 = 233.1 -> 233
		expect(result?.activityBonus).toBe(233);
		expect(result?.calorieGoal).toBe(2233);
	});

	it('leaves sodium, sugar, and target weight fields untouched', () => {
		const goals = { ...GOALS, sodiumGoal: 2300, sugarGoal: 50, targetWeightKg: 75 };
		const result = adjustGoalsForActivity(goals, 400, { enabled: true, creditPercent: 100 });
		expect(result?.sodiumGoal).toBe(2300);
		expect(result?.sugarGoal).toBe(50);
		expect(result?.targetWeightKg).toBe(75);
	});
});
