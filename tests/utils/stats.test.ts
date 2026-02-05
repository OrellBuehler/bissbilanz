import { describe, expect, test } from 'bun:test';
import { averageTotals } from '../../src/lib/utils/stats';

describe('averageTotals', () => {
	test('averages totals across days', () => {
		const avg = averageTotals([
			{ calories: 2000, protein: 100, carbs: 250, fat: 60, fiber: 30 },
			{ calories: 1800, protein: 90, carbs: 220, fat: 50, fiber: 25 }
		]);
		expect(avg.calories).toBe(1900);
	});

	test('handles empty array', () => {
		const avg = averageTotals([]);
		expect(avg.calories).toBe(0);
	});
});
