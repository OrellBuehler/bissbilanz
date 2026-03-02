import { describe, expect, test } from 'vitest';
import { calculateRecipeTotals } from '../../src/lib/utils/recipes';

describe('calculateRecipeTotals', () => {
	test('computes per-serving totals from ingredients', () => {
		const totals = calculateRecipeTotals(
			[
				{ calories: 100, protein: 10, carbs: 5, fat: 1, fiber: 2, quantity: 2 },
				{ calories: 50, protein: 5, carbs: 10, fat: 0, fiber: 1, quantity: 1 }
			],
			3
		);
		expect(totals.calories).toBeCloseTo(83.33, 1);
	});

	test('handles single ingredient', () => {
		const totals = calculateRecipeTotals(
			[{ calories: 200, protein: 20, carbs: 30, fat: 5, fiber: 4, quantity: 1 }],
			2
		);
		expect(totals.calories).toBe(100);
		expect(totals.protein).toBe(10);
	});
});
