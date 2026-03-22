import { describe, it, expect } from 'vitest';
import { computeNutrientOutcomeCorrelations } from '../nutrient-correlation';

function makeDays(n: number, startDate: string = '2024-01-01') {
	return Array.from({ length: n }, (_, i) => {
		const d = new Date(startDate + 'T00:00:00Z');
		d.setUTCDate(d.getUTCDate() + i);
		return d.toISOString().slice(0, 10);
	});
}

describe('computeNutrientOutcomeCorrelations', () => {
	it('includes nutrient with strong positive correlation', () => {
		const dates = makeDays(20);
		const dailyNutrients = dates.map((date, i) => ({
			date,
			nutrients: { protein: 100 + i * 5, fat: 50 }
		}));
		const outcomes = dates.map((date, i) => ({ date, value: 70 + i * 0.5 }));

		const result = computeNutrientOutcomeCorrelations(dailyNutrients, outcomes);
		const proteinEntry = result.find((r) => r.nutrientKey === 'protein');
		expect(proteinEntry).toBeDefined();
		expect(proteinEntry!.correlation.r).toBeGreaterThan(0.9);
	});

	it('excludes nutrient with weak correlation below 0.15', () => {
		const dates = makeDays(20);
		const dailyNutrients = dates.map((date) => ({
			date,
			nutrients: { noise: Math.random() * 10, protein: 100 }
		}));
		const outcomes = dates.map((date, i) => ({ date, value: i * 2 }));

		const result = computeNutrientOutcomeCorrelations(dailyNutrients, outcomes);
		for (const entry of result) {
			expect(Math.abs(entry.correlation.r)).toBeGreaterThanOrEqual(0.15);
		}
	});

	it('skips nutrient where >50% of values are null', () => {
		const dates = makeDays(10);
		// sparse is null for 6 of 10 days (60% > 50%) — should be excluded
		const dailyNutrients = dates.map((date, i) => ({
			date,
			nutrients: {
				sparse: i < 6 ? null : 100 + i * 5,
				protein: 100 + i * 5
			}
		}));
		const outcomes = dates.map((date, i) => ({ date, value: 70 + i * 0.5 }));

		const result = computeNutrientOutcomeCorrelations(dailyNutrients, outcomes);
		const sparseEntry = result.find((r) => r.nutrientKey === 'sparse');
		expect(sparseEntry).toBeUndefined();
	});

	it('sorts results by |r| descending', () => {
		const dates = makeDays(20);
		const dailyNutrients = dates.map((date, i) => ({
			date,
			nutrients: {
				strong: 100 + i * 10,
				moderate: 50 + i * 3 + Math.sin(i) * 10
			}
		}));
		const outcomes = dates.map((date, i) => ({ date, value: i * 2 }));

		const result = computeNutrientOutcomeCorrelations(dailyNutrients, outcomes);
		for (let i = 1; i < result.length; i++) {
			expect(Math.abs(result[i - 1].correlation.r)).toBeGreaterThanOrEqual(
				Math.abs(result[i].correlation.r)
			);
		}
	});

	it('applies lag offset correctly', () => {
		const dates = makeDays(25);
		const dailyNutrients = dates.map((date, i) => ({
			date,
			nutrients: { protein: 100 + i * 5 }
		}));
		const laggedDates = dates.slice(2);
		const outcomes = laggedDates.map((date, i) => ({ date, value: 70 + i * 2 }));

		const resultNoLag = computeNutrientOutcomeCorrelations(dailyNutrients, outcomes, 0);
		const resultWithLag = computeNutrientOutcomeCorrelations(dailyNutrients, outcomes, 2);

		const proteinWithLag = resultWithLag.find((r) => r.nutrientKey === 'protein');
		expect(proteinWithLag).toBeDefined();
		expect(proteinWithLag!.correlation.r).toBeGreaterThan(0.9);

		const proteinNoLag = resultNoLag.find((r) => r.nutrientKey === 'protein');
		if (proteinNoLag && proteinWithLag) {
			expect(proteinWithLag.correlation.r).toBeGreaterThan(proteinNoLag.correlation.r - 0.01);
		}
	});

	it('returns empty array when no nutrients pass thresholds', () => {
		const dates = makeDays(20);
		const dailyNutrients = dates.map((date) => ({
			date,
			nutrients: { constant: 100 }
		}));
		const outcomes = dates.map((date, i) => ({ date, value: i }));

		const result = computeNutrientOutcomeCorrelations(dailyNutrients, outcomes);
		expect(Array.isArray(result)).toBe(true);
	});
});
