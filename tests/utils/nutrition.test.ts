import { describe, expect, test } from 'bun:test';
import {
	calculateDailyTotals,
	calculateEntryMacros,
	calculateEntryTotals,
	sumEntries
} from '../../src/lib/utils/nutrition';

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

	test('calculateEntryMacros multiplies by servings', () => {
		const result = calculateEntryMacros({
			calories: 205,
			protein: 12,
			carbs: 30,
			fat: 5,
			fiber: 2,
			servings: 2
		});
		expect(result).toEqual({ calories: 410, protein: 24, carbs: 60, fat: 10, fiber: 4 });
	});

	test('calculateEntryMacros handles null macros', () => {
		const result = calculateEntryMacros({
			calories: 100,
			protein: null,
			carbs: null,
			fat: 5,
			fiber: null,
			servings: 3
		});
		expect(result).toEqual({ calories: 300, protein: 0, carbs: 0, fat: 15, fiber: 0 });
	});

	test('sumEntries accounts for servings', () => {
		const result = sumEntries([
			{ calories: 205, protein: 12, carbs: 30, fat: 5, fiber: 2, servings: 2 },
			{ calories: 100, protein: 8, carbs: 15, fat: 3, fiber: 1, servings: 1.5 }
		]);
		expect(result).toEqual({
			calories: 410 + 150,
			protein: 24 + 12,
			carbs: 60 + 22.5,
			fat: 10 + 4.5,
			fiber: 4 + 1.5
		});
	});

	test('sumEntries with empty array returns zero totals', () => {
		const result = sumEntries([]);
		expect(result).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
	});
});
