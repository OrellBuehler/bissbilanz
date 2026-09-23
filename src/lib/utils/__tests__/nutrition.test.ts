import { describe, it, expect } from 'vitest';
import { remainingBudget } from '../nutrition';

describe('remainingBudget', () => {
	it('subtracts logged totals from the daily goals', () => {
		const goals = { calorieGoal: 2000, proteinGoal: 150, carbGoal: 200, fatGoal: 70 };
		const totals = { calories: 1200, protein: 80, carbs: 120, fat: 40, fiber: 10 };
		expect(remainingBudget(goals, totals)).toEqual({
			calories: 800,
			protein: 70,
			carbs: 80,
			fat: 30
		});
	});

	it('can go negative once the goal is exceeded', () => {
		const goals = { calorieGoal: 2000, proteinGoal: 150, carbGoal: 200, fatGoal: 70 };
		const totals = { calories: 2200, protein: 160, carbs: 210, fat: 80, fiber: 10 };
		expect(remainingBudget(goals, totals)).toEqual({
			calories: -200,
			protein: -10,
			carbs: -10,
			fat: -10
		});
	});
});
