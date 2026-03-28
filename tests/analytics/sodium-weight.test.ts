import { describe, test, expect } from 'vitest';
import { computeSodiumWeightCorrelation } from '$lib/analytics/sodium-weight';

function makeConsecutiveDays(count: number, startDate: string): string[] {
	const dates: string[] = [];
	const base = new Date(startDate + 'T00:00:00Z');
	for (let i = 0; i < count; i++) {
		const d = new Date(base);
		d.setUTCDate(d.getUTCDate() + i);
		dates.push(d.toISOString().slice(0, 10));
	}
	return dates;
}

describe('computeSodiumWeightCorrelation', () => {
	test('detects positive correlation with high sodium followed by weight spike', () => {
		const dates = makeConsecutiveDays(15, '2026-03-01');

		// Alternate high/low sodium days
		const dailyNutrients = dates.map((date, i) => ({
			date,
			sodium: i % 2 === 0 ? 4000 : 1000
		}));

		// Weight increases after high sodium days (d+1 after even index)
		const weights = dates.map((date, i) => ({
			date,
			weightKg: 80 + (i % 2 === 1 ? 0.5 : 0)
		}));

		const result = computeSodiumWeightCorrelation(dailyNutrients, weights);

		expect(result.sampleSize).toBeGreaterThan(0);
		expect(result.correlation.r).toBeGreaterThan(0);
		expect(result.highSodiumDays).toBeGreaterThan(0);
		expect(result.avgWeightDeltaAfterHighSodium).not.toBeNull();
		expect(result.avgWeightDeltaAfterHighSodium!).toBeGreaterThan(0);
	});

	test('reports correct avgSodium', () => {
		const dates = makeConsecutiveDays(10, '2026-03-01');
		const dailyNutrients = dates.map((date) => ({ date, sodium: 2000 }));
		const weights = dates.map((date) => ({ date, weightKg: 75 }));

		const result = computeSodiumWeightCorrelation(dailyNutrients, weights);

		expect(result.avgSodium).toBeCloseTo(2000);
	});

	test('returns insufficient confidence with too little data', () => {
		const dates = makeConsecutiveDays(4, '2026-03-01');
		const dailyNutrients = dates.map((date) => ({ date, sodium: 2000 }));
		const weights = dates.map((date) => ({ date, weightKg: 75 }));

		const result = computeSodiumWeightCorrelation(dailyNutrients, weights);

		expect(result.confidence).toBe('insufficient');
		expect(result.correlation.pValue).toBeNull();
	});

	test('handles empty input gracefully', () => {
		const result = computeSodiumWeightCorrelation([], []);

		expect(result.sampleSize).toBe(0);
		expect(result.confidence).toBe('insufficient');
		expect(result.avgSodium).toBe(0);
		expect(result.avgWeightDeltaAfterHighSodium).toBeNull();
	});

	test('counts high sodium days correctly', () => {
		const dates = makeConsecutiveDays(10, '2026-03-01');
		const dailyNutrients = dates.map((date, i) => ({
			date,
			sodium: i < 4 ? 3000 : 1500
		}));
		const weights = dates.map((date) => ({ date, weightKg: 78 }));

		const result = computeSodiumWeightCorrelation(dailyNutrients, weights);

		expect(result.highSodiumDays).toBe(4);
	});
});
