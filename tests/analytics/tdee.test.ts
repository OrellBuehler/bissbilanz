import { describe, test, expect } from 'vitest';
import { computeAdaptiveTDEE, detectPlateau, projectWeight } from '$lib/analytics/tdee';

function makeWeightSeries(days: number, startKg: number, dailyChange: number) {
	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);
	return Array.from({ length: days }, (_, i) => {
		const d = new Date(today);
		d.setUTCDate(d.getUTCDate() - (days - 1 - i));
		return {
			date: d.toISOString().slice(0, 10),
			weightKg: startKg + i * dailyChange
		};
	});
}

function makeCalorieSeries(days: number, kcal: number) {
	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);
	return Array.from({ length: days }, (_, i) => {
		const d = new Date(today);
		d.setUTCDate(d.getUTCDate() - (days - 1 - i));
		return {
			date: d.toISOString().slice(0, 10),
			calories: kcal
		};
	});
}

describe('computeAdaptiveTDEE', () => {
	test('estimates TDEE for a weight loss scenario', () => {
		// 0.5 kg/week loss = ~71g/day, 7700 kcal/kg → deficit ~550 kcal/day
		// intake 2000 → TDEE ≈ 2550
		const weeklyLossKg = 0.5;
		const dailyChange = -weeklyLossKg / 7;
		const weights = makeWeightSeries(14, 80, dailyChange);
		const calories = makeCalorieSeries(14, 2000);

		const result = computeAdaptiveTDEE(weights, calories, 14);

		expect(result.estimatedTDEE).not.toBeNull();
		expect(result.estimatedTDEE!).toBeGreaterThan(2400);
		expect(result.estimatedTDEE!).toBeLessThan(2700);
		expect(result.trend).toBe('loss');
		expect(result.avgIntake).toBeCloseTo(2000);
		expect(result.weeklyRate).toBeCloseTo(-0.5, 1);
	});

	test('returns null TDEE with insufficient weight data', () => {
		const weights = makeWeightSeries(3, 80, -0.07);
		const calories = makeCalorieSeries(14, 2000);

		const result = computeAdaptiveTDEE(weights, calories, 14);

		expect(result.estimatedTDEE).toBeNull();
		expect(result.confidence).toBe('insufficient');
	});

	test('returns null TDEE with insufficient calorie data', () => {
		const weights = makeWeightSeries(14, 80, -0.07);
		const calories = makeCalorieSeries(5, 2000);

		const result = computeAdaptiveTDEE(weights, calories, 14);

		expect(result.estimatedTDEE).toBeNull();
		expect(result.confidence).toBe('insufficient');
	});

	test('clamps TDEE below 1200 and sets confidence to low', () => {
		// Extreme gain scenario that would push TDEE very low
		// huge gain + low intake forces clamping
		const weights = makeWeightSeries(14, 60, 1.0); // +7kg/week
		const calories = makeCalorieSeries(14, 1500);

		const result = computeAdaptiveTDEE(weights, calories, 14);

		expect(result.estimatedTDEE).toBe(1200);
		expect(result.confidence).toBe('low');
	});

	test('clamps TDEE above 5000 and sets confidence to low', () => {
		// extreme loss + high intake forces TDEE above 5000
		const weights = makeWeightSeries(14, 100, -1.0); // -7kg/week
		const calories = makeCalorieSeries(14, 4000);

		const result = computeAdaptiveTDEE(weights, calories, 14);

		expect(result.estimatedTDEE).toBe(5000);
		expect(result.confidence).toBe('low');
	});

	test('trend is maintenance when weekly rate is near zero', () => {
		const weights = makeWeightSeries(14, 80, 0);
		const calories = makeCalorieSeries(14, 2200);

		const result = computeAdaptiveTDEE(weights, calories, 14);

		expect(result.trend).toBe('maintenance');
	});

	test('trend is gain when weight is increasing', () => {
		const weights = makeWeightSeries(14, 75, 0.1);
		const calories = makeCalorieSeries(14, 2800);

		const result = computeAdaptiveTDEE(weights, calories, 14);

		expect(result.trend).toBe('gain');
	});
});

describe('detectPlateau', () => {
	test('detects plateau with flat weight', () => {
		const weights = makeWeightSeries(14, 80, 0);
		const calories = makeCalorieSeries(14, 1800);

		const result = detectPlateau(weights, calories, 2200);

		expect(result.isPlateaued).toBe(true);
		expect(result.plateauDays).toBe(14);
		expect(result.estimatedDeficit).toBeCloseTo(400);
		// A deficit with a flat scale is not evidence of adaptation; no cause is asserted.
		expect(result.cause).toBe('none');
	});

	test('does not call a short window a plateau', () => {
		const weights = makeWeightSeries(6, 80, 0);
		const calories = makeCalorieSeries(14, 1800);

		const result = detectPlateau(weights, calories, 2200);

		expect(result.isPlateaued).toBe(false);
	});

	test('sparse weigh-ins are regressed on the date, not the row index', () => {
		// Four points over 13 days losing 0.05 kg/day: a row-index fit would see
		// the same drop compressed into three steps and report ~4x the rate.
		const dense = makeWeightSeries(14, 80, -0.05);
		const sparse = [dense[0], dense[1], dense[2], dense[13]];
		const calories = makeCalorieSeries(14, 2000);

		const tdee = computeAdaptiveTDEE([...sparse, dense[5]], calories, 14);
		expect(tdee.weeklyRate).toBeCloseTo(-0.35, 5);
	});

	test('does not flag plateau during normal weight loss', () => {
		const weights = makeWeightSeries(14, 80, -0.05); // ~0.35kg/week
		const calories = makeCalorieSeries(14, 1800);

		const result = detectPlateau(weights, calories, 2200);

		expect(result.isPlateaued).toBe(false);
	});

	test('returns insufficient confidence with too little data', () => {
		const weights = makeWeightSeries(2, 80, 0);
		const calories = makeCalorieSeries(2, 1800);

		const result = detectPlateau(weights, calories, 2200);

		expect(result.isPlateaued).toBe(false);
		expect(result.confidence).toBe('insufficient');
	});

	test('classifies cause as intake_variance when calorie stddev is high', () => {
		const weights = makeWeightSeries(14, 80, 0);
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);
		const calories = Array.from({ length: 14 }, (_, i) => {
			const d = new Date(today);
			d.setUTCDate(d.getUTCDate() - (13 - i));
			return { date: d.toISOString().slice(0, 10), calories: i % 2 === 0 ? 1200 : 2800 };
		});

		const result = detectPlateau(weights, calories, 2200);

		expect(result.isPlateaued).toBe(true);
		expect(result.cause).toBe('intake_variance');
	});
});

describe('projectWeight', () => {
	test('projects from the smoothed anchor along a decelerating curve', () => {
		const weights = makeWeightSeries(22, 80, -0.07);
		const weeklyRate = -0.5;

		const result = projectWeight(weights, weeklyRate);

		// Anchor is the trailing 7-day mean, not the last (noisy) raw point.
		const lastSeven = weights.slice(-7).map((w) => w.weightKg);
		expect(result.currentWeight).toBeCloseTo(lastSeven.reduce((s, v) => s + v, 0) / 7, 9);

		// Linear extrapolation is the upper bound on the change; the curve bends
		// as expenditure falls with mass (τ = 7700 / 22 = 350 days).
		const tau = 7700 / 22;
		const expected = (days: number) =>
			result.currentWeight! + (weeklyRate / 7) * tau * (1 - Math.exp(-days / tau));
		expect(result.day30).toBeCloseTo(expected(30), 9);
		expect(result.day60).toBeCloseTo(expected(60), 9);
		expect(result.day90).toBeCloseTo(expected(90), 9);
		const linear90 = result.currentWeight! + (weeklyRate * 90) / 7;
		expect(result.day90!).toBeGreaterThan(linear90);
		expect(result.day90!).toBeLessThan(result.currentWeight!);
		expect(result.confidence).toBe('high');
	});

	test("carries the rate estimate's confidence when given", () => {
		const weights = makeWeightSeries(22, 80, -0.07);
		const result = projectWeight(weights, -0.5, 'low');
		expect(result.confidence).toBe('low');
	});

	test('returns null projections when no weight data', () => {
		const result = projectWeight([], -0.5);

		expect(result.currentWeight).toBeNull();
		expect(result.day30).toBeNull();
		expect(result.day60).toBeNull();
		expect(result.day90).toBeNull();
		expect(result.confidence).toBe('insufficient');
	});

	test('returns low confidence with sparse weight data', () => {
		const weights = makeWeightSeries(10, 80, -0.07);

		const result = projectWeight(weights, -0.5);

		expect(result.confidence).toBe('low');
	});
});
