import { describe, expect, test } from 'bun:test';
import { calculateDailyTotals, calculateEntryTotals } from '../../src/lib/utils/nutrition';

describe('nutrition utilities', () => {
	test('calculateEntryTotals scales macros by servings', () => {
		const totals = calculateEntryTotals(
			{ calories: 100, protein: 10, carbs: 20, fat: 5, fiber: 3 },
			2
		);
		expect(totals).toEqual({ calories: 200, protein: 20, carbs: 40, fat: 10, fiber: 6 });
	});

	test('calculateDailyTotals sums entry totals', () => {
		const totals = calculateDailyTotals([
			{ calories: 100, protein: 10, carbs: 20, fat: 5, fiber: 3 },
			{ calories: 200, protein: 5, carbs: 10, fat: 2, fiber: 1 }
		]);
		expect(totals).toEqual({ calories: 300, protein: 15, carbs: 30, fat: 7, fiber: 4 });
	});
});
