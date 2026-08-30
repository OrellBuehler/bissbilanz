/**
 * Generates the frozen golden-vector fixtures from the TypeScript analytics.
 * Run with: `bun run analytics-parity/generate.ts`
 *
 * The fixtures lock the shared Kotlin analytics to the TS analytics — see
 * analytics-parity/README.md. Keep this file dependency-free (pure imports of
 * the analytics modules) so it runs without the SvelteKit runtime.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pearsonCorrelation } from '../src/lib/analytics/correlation';
import { movingAverage, weightMovingAverage } from '../src/lib/analytics/moving-average';
import { computeAdaptiveTDEE, detectPlateau, projectWeight } from '../src/lib/analytics/tdee';
import {
	aggregateDailyNutrientTotals,
	type AggEntry,
	type AggFood,
	type AggRecipe
} from '../src/lib/analytics/aggregation';
import {
	calculateMaintenance,
	smoothedWeightChange,
	type MaintenanceInput
} from '../src/lib/utils/maintenance';
import {
	normalCdf,
	welchTTest,
	benjaminiHochberg,
	fisherCI95,
	studentTwoSidedP
} from '../src/lib/analytics/stats';
import {
	circularMeanMinutes,
	circularStdMinutes,
	eatingDayOf
} from '../src/lib/analytics/local-time';
import { computeTEF, computeDIIScore } from '../src/lib/analytics/food-quality';
import { extractMealTimingPatterns } from '../src/lib/analytics/meal-timing';
import { computeCalorieFrontLoading } from '../src/lib/analytics/calorie-patterns';
import { computeCaffeineSleepCutoff } from '../src/lib/analytics/caffeine-sleep';
import { computeMealRegularity } from '../src/lib/analytics/meal-regularity';
import { computeNOVAScore, computeOmegaRatio } from '../src/lib/analytics/food-quality';
import { computeFoodDiversity } from '../src/lib/analytics/food-diversity';
import { computeCalorieCycling } from '../src/lib/analytics/calorie-patterns';
import { computeCaloricLag } from '../src/lib/analytics/caloric-lag';
import { computeProteinDistribution } from '../src/lib/analytics/protein-distribution';
import { computeSodiumWeightCorrelation } from '../src/lib/analytics/sodium-weight';
import { computeWeekdayWeekendSplit } from '../src/lib/analytics/weekday-weekend';
import { computeNutrientOutcomeCorrelations } from '../src/lib/analytics/nutrient-correlation';
import { detectFoodSleepPatterns } from '../src/lib/analytics/food-sleep';
import { getConfidenceLevel } from '../src/lib/analytics/correlation';
import { localMinutesOfDay } from '../src/lib/analytics/local-time';
import { nullDiv, nullSum } from '../src/lib/analytics/aggregation';

type Case = { fn: string; name: string; input: Record<string, unknown>; expected: unknown };

const cases: Case[] = [];
const add = (fn: string, name: string, input: Record<string, unknown>, expected: unknown) =>
	cases.push({ fn, name, input, expected });

// --- helpers to build deterministic series (no Date.now / randomness) -------
function weightSeries(days: number, startKg: number, dailyChangeKg: number) {
	return Array.from({ length: days }, (_, i) => ({
		date: isoDay(i),
		weightKg: round(startKg + dailyChangeKg * i, 4)
	}));
}
function calorieSeries(days: number, kcal: (i: number) => number) {
	return Array.from({ length: days }, (_, i) => ({ date: isoDay(i), calories: kcal(i) }));
}
function isoDay(i: number): string {
	// Fixed anchor; pure string math via UTC epoch days.
	const d = new Date(Date.UTC(2025, 0, 1) + i * 86400000);
	return d.toISOString().slice(0, 10);
}
function round(v: number, dp: number): number {
	const f = 10 ** dp;
	return Math.round(v * f) / f;
}

// --- pearsonCorrelation -----------------------------------------------------
{
	const x1 = [1, 2, 3, 4, 5, 6, 7, 8];
	const y1 = [2, 4, 6, 8, 10, 12, 14, 16];
	add('pearsonCorrelation', 'perfect_positive', { x: x1, y: y1 }, pearsonCorrelation(x1, y1));

	const x2 = [1, 2, 3, 4, 5, 6, 7, 8];
	const y2 = [16, 14, 12, 10, 8, 6, 4, 2];
	add('pearsonCorrelation', 'perfect_negative', { x: x2, y: y2 }, pearsonCorrelation(x2, y2));

	const x3 = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5];
	const y3 = [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68];
	add('pearsonCorrelation', 'anscombe_like_n11', { x: x3, y: y3 }, pearsonCorrelation(x3, y3));

	const x4 = [3, 3, 3, 3, 3, 3, 3];
	const y4 = [1, 2, 3, 4, 5, 6, 7];
	add('pearsonCorrelation', 'constant_input', { x: x4, y: y4 }, pearsonCorrelation(x4, y4));

	const x5 = [1, 2];
	const y5 = [5, 9];
	add('pearsonCorrelation', 'n_le_2', { x: x5, y: y5 }, pearsonCorrelation(x5, y5));
}

// --- movingAverage ----------------------------------------------------------
{
	const s1 = [70, 70.2, 69.8, 70.1, 69.9, 70.0, 69.7, 69.5, 69.6, 69.4];
	add('movingAverage', 'window7_dense', { series: s1, windowSize: 7 }, movingAverage(s1, 7));

	const s2 = [1, null, 3, null, 5, 6, null, 8, 9, 10];
	add('movingAverage', 'window3_with_nulls', { series: s2, windowSize: 3 }, movingAverage(s2, 3));
}

// --- weightMovingAverage ------------------------------------------------------
{
	// Dense daily series: every window is fully populated after day 7.
	const dense = Array.from({ length: 10 }, (_, i) => ({
		date: isoDay(i),
		weightKg: round(80 - 0.1 * i, 4)
	}));
	add(
		'weightMovingAverage',
		'dense_daily_7d',
		{ entries: dense, windowDays: 7 },
		weightMovingAverage(dense, 7)
	);
	add(
		'weightMovingAverage',
		'dense_daily_3d',
		{ entries: dense, windowDays: 3 },
		weightMovingAverage(dense, 3)
	);

	// Calendar gaps: the 14-day hole between Feb 6 and Feb 20 exceeds the
	// window, so the average resets instead of smearing across the gap the way
	// a row-based window would.
	const gapped = [
		{ date: '2025-02-01', weightKg: 82.4 },
		{ date: '2025-02-03', weightKg: 82.1 },
		{ date: '2025-02-06', weightKg: 81.9 },
		{ date: '2025-02-20', weightKg: 81.2 },
		{ date: '2025-02-22', weightKg: 81.0 }
	];
	add(
		'weightMovingAverage',
		'calendar_gap_reset',
		{ entries: gapped, windowDays: 7 },
		weightMovingAverage(gapped, 7)
	);

	// Same-date collapse: latest loggedAt wins; a missing loggedAt loses to a
	// present one; out-of-order input; an unparseable date is skipped.
	const dupes = [
		{ date: '2025-03-02', weightKg: 79.8, loggedAt: '2025-03-02T07:10:00Z' },
		{ date: '2025-03-01', weightKg: 80.6, loggedAt: '2025-03-01T21:40:00Z' },
		{ date: '2025-03-01', weightKg: 80.2, loggedAt: '2025-03-01T06:30:00Z' },
		{ date: '2025-03-02', weightKg: 79.4, loggedAt: null },
		{ date: 'not-a-date', weightKg: 99.9 }
	];
	add(
		'weightMovingAverage',
		'same_date_collapse',
		{ entries: dupes, windowDays: 7 },
		weightMovingAverage(dupes, 7)
	);
}

// --- computeAdaptiveTDEE ----------------------------------------------------
{
	const w = weightSeries(21, 82, -0.05); // ~0.35 kg/week loss
	const c = calorieSeries(21, () => 2100);
	add(
		'computeAdaptiveTDEE',
		'loss_21d',
		{ weightSeries: w, calorieSeries: c, windowDays: 14 },
		computeAdaptiveTDEE(w, c, 14)
	);

	const w2 = weightSeries(4, 80, -0.1); // too few weight points
	const c2 = calorieSeries(4, () => 2000);
	add(
		'computeAdaptiveTDEE',
		'insufficient',
		{ weightSeries: w2, calorieSeries: c2, windowDays: 14 },
		computeAdaptiveTDEE(w2, c2, 14)
	);

	const w3 = weightSeries(18, 75, 0.04); // gain
	const c3 = calorieSeries(18, (i) => 2600 + (i % 3) * 120);
	add(
		'computeAdaptiveTDEE',
		'gain_variable_intake',
		{ weightSeries: w3, calorieSeries: c3, windowDays: 14 },
		computeAdaptiveTDEE(w3, c3, 14)
	);
}

// --- detectPlateau ----------------------------------------------------------
{
	const w = weightSeries(14, 78, 0.0); // flat → plateau
	const c = calorieSeries(14, () => 2200);
	const tdee = computeAdaptiveTDEE(w, c, 14).estimatedTDEE;
	add(
		'detectPlateau',
		'plateau_flat',
		{ weightSeries: w, calorieSeries: c, estimatedTDEE: tdee },
		detectPlateau(w, c, tdee)
	);

	const w2 = weightSeries(14, 78, 0.0);
	const c2 = calorieSeries(14, (i) => (i % 2 === 0 ? 1500 : 2900)); // high variance
	add(
		'detectPlateau',
		'plateau_intake_variance',
		{ weightSeries: w2, calorieSeries: c2, estimatedTDEE: 2300 },
		detectPlateau(w2, c2, 2300)
	);

	const w3 = weightSeries(14, 78, -0.06); // clearly losing → not plateau
	const c3 = calorieSeries(14, () => 2000);
	add(
		'detectPlateau',
		'not_plateau',
		{ weightSeries: w3, calorieSeries: c3, estimatedTDEE: 2400 },
		detectPlateau(w3, c3, 2400)
	);

	// Flat but too short a span to call: six weigh-ins over six days.
	const w4 = weightSeries(6, 78, 0.0);
	const c4 = calorieSeries(6, () => 2200);
	add(
		'detectPlateau',
		'too_short_to_call',
		{ weightSeries: w4, calorieSeries: c4, estimatedTDEE: 2300 },
		detectPlateau(w4, c4, 2300)
	);

	// Sparse weigh-ins regressed on the date: 0.05 kg/day over 13 days stays 0.35 kg/week.
	const sparseDense = weightSeries(14, 80, -0.05);
	const w5 = [sparseDense[0], sparseDense[1], sparseDense[2], sparseDense[5], sparseDense[13]];
	const c5 = calorieSeries(14, () => 2000);
	add(
		'computeAdaptiveTDEE',
		'sparse_weighins_on_date_axis',
		{ weightSeries: w5, calorieSeries: c5, windowDays: 14 },
		computeAdaptiveTDEE(w5, c5, 14)
	);
}

// --- projectWeight ----------------------------------------------------------
{
	const w = weightSeries(20, 90, -0.07);
	add(
		'projectWeight',
		'loss_-0.49wk',
		{ weightSeries: w, weeklyRate: -0.49 },
		projectWeight(w, -0.49)
	);

	const w2 = weightSeries(5, 70, 0.0);
	add(
		'projectWeight',
		'flat_low_sample',
		{ weightSeries: w2, weeklyRate: 0.0 },
		projectWeight(w2, 0)
	);

	// The rate's own confidence overrides the weight-count badge.
	add(
		'projectWeight',
		'rate_confidence_carried',
		{ weightSeries: w, weeklyRate: -0.49, rateConfidence: 'low' },
		projectWeight(w, -0.49, 'low')
	);
}

// --- calculateMaintenance ---------------------------------------------------
{
	const maintenanceCases: { name: string; input: MaintenanceInput }[] = [
		{
			name: 'loss_default_ratio',
			input: { weightChangeKg: -1.2, avgDailyCalories: 2100, days: 28 }
		},
		{
			name: 'gain_custom_ratio',
			input: { weightChangeKg: 0.8, avgDailyCalories: 2850, days: 21, muscleRatio: 0.5 }
		},
		{
			name: 'no_change',
			input: { weightChangeKg: 0, avgDailyCalories: 2000, days: 14, muscleRatio: 0.3 }
		},
		{
			name: 'half_round_up',
			input: { weightChangeKg: -0.355, avgDailyCalories: 2000.5, days: 7, muscleRatio: 0.3 }
		},
		{
			name: 'invalid_days',
			input: { weightChangeKg: -1, avgDailyCalories: 2000, days: 0, muscleRatio: 0.3 }
		}
	];
	for (const { name, input } of maintenanceCases) {
		add(
			'calculateMaintenance',
			name,
			input as unknown as Record<string, unknown>,
			calculateMaintenance(input)
		);
	}
}

// --- smoothedWeightChange ---------------------------------------------------
{
	const dated = [
		{ entryDate: '2026-02-01', weightKg: 80.6 },
		{ entryDate: '2026-02-02', weightKg: 79.8 },
		{ entryDate: '2026-02-03', weightKg: 80.2 },
		{ entryDate: '2026-02-26', weightKg: 79.4 },
		{ entryDate: '2026-02-27', weightKg: 78.6 },
		{ entryDate: '2026-02-28', weightKg: 79.0 }
	];
	add(
		'smoothedWeightChange',
		'seven_day_anchors',
		{ weights: dated, days: 27 },
		smoothedWeightChange(dated, 27)
	);

	// All weights inside one anchor window: anchors overlap, raw endpoints are used.
	const clustered = [
		{ entryDate: '2026-03-01', weightKg: 80.0 },
		{ entryDate: '2026-03-02', weightKg: 79.5 },
		{ entryDate: '2026-03-04', weightKg: 79.8 }
	];
	add(
		'smoothedWeightChange',
		'overlapping_anchors_fall_back',
		{ weights: clustered, days: 3 },
		smoothedWeightChange(clustered, 3)
	);

	const undated = [{ weightKg: 82.0 }, { weightKg: 81.1 }];
	add(
		'smoothedWeightChange',
		'undated_raw_endpoints',
		{ weights: undated, days: 14 },
		smoothedWeightChange(undated, 14)
	);
}

// --- aggregateDailyNutrientTotals -------------------------------------------
{
	// Foods exercise: a plain food, a food with extended nutrients, an
	// ingredient-only food, and a zero-serving-size food (NULLIF divide-by-zero).
	const foods: AggFood[] = [
		{ id: 'f_oats', servingSize: 40, calories: 150, protein: 5, carbs: 27, fat: 3, fiber: 4 },
		{
			id: 'f_salmon',
			servingSize: 100,
			calories: 208,
			protein: 20,
			carbs: 0,
			fat: 13,
			fiber: 0,
			novaGroup: 1,
			omega3: 2.3,
			sodium: 59,
			vitaminD: 11
		},
		{ id: 'f_rice', servingSize: 50, calories: 180, protein: 3.3, carbs: 39, fat: 0.4, fiber: 0.6 },
		{ id: 'f_zero', servingSize: 0, calories: 999, protein: 9, carbs: 9, fat: 9, fiber: 9 }
	];
	const recipes: AggRecipe[] = [
		{
			id: 'r_bowl',
			totalServings: 2,
			ingredients: [
				{ foodId: 'f_salmon', quantity: 150 },
				{ foodId: 'f_rice', quantity: 120 },
				{ foodId: 'f_zero', quantity: 30 } // contributes nothing (servingSize 0)
			]
		},
		{ id: 'r_degenerate', totalServings: 0, ingredients: [{ foodId: 'f_oats', quantity: 80 }] }
	];
	const entries: AggEntry[] = [
		// Day 1: a food entry, a recipe entry (1.5 servings), a quick-add entry.
		{ date: '2025-03-01', mealType: 'breakfast', servings: 2, foodId: 'f_oats' },
		{ date: '2025-03-01', mealType: 'lunch', servings: 1.5, recipeId: 'r_bowl' },
		{
			date: '2025-03-01',
			mealType: 'snack',
			servings: 1,
			quickName: 'Protein bar',
			quickCalories: 200,
			quickProtein: 20,
			quickCarbs: 22,
			quickFat: 7,
			quickFiber: 3
		},
		// Day 2: the degenerate recipe (totalServings 0 -> all macros null -> 0) and a salmon food.
		{ date: '2025-03-02', mealType: 'dinner', servings: 1, recipeId: 'r_degenerate' },
		{ date: '2025-03-02', mealType: 'dinner', servings: 2, foodId: 'f_salmon' }
	];
	add(
		'aggregateDailyNutrientTotals',
		'mixed_food_recipe_quick',
		{ entries, foods, recipes } as unknown as Record<string, unknown>,
		aggregateDailyNutrientTotals(entries, foods, recipes)
	);
}

// --- computeTEF -------------------------------------------------------------
{
	// Varying daily calories so average-of-ratios != ratio-of-averages (the bug
	// that diverged Kotlin from TS). Includes a zero-calorie day (0% contribution).
	const tefDays = [
		{ protein: 120, carbs: 250, fat: 70, calories: 2100 },
		{ protein: 90, carbs: 180, fat: 55, calories: 1600 },
		{ protein: 160, carbs: 300, fat: 95, calories: 2850 },
		{ protein: 100, carbs: 0, fat: 40, calories: 0 },
		{ protein: 110, carbs: 220, fat: 60, calories: 2300, alcohol: 30 }
	];
	add('computeTEF', 'varying_calories', { dailyNutrients: tefDays }, computeTEF(tefDays));
	add('computeTEF', 'empty', { dailyNutrients: [] }, computeTEF([]));
}

// --- computeDIIScore ------------------------------------------------------------
{
	// Locks the generated DII coefficient/mean/SD tables behaviorally. Exercises
	// the coverage cutoff (vitaminD present on 3/10 days → excluded), the
	// zero-valid semantics (alcohol/transFat zeros count; vitaminE zeros are
	// filtered → 0.4 coverage → excluded) and the |impact| contributor ordering.
	const days = Array.from({ length: 10 }, (_, i) => ({
		fiber: 14 + (i % 4) * 3,
		omega3: 0.6 + (i % 3) * 0.4,
		saturatedFat: 22 + (i % 5) * 4,
		vitaminC: i < 6 ? 60 + i * 10 : undefined,
		vitaminD: i < 3 ? 4.5 : undefined,
		vitaminE: i < 4 ? 8.7 : 0,
		alcohol: i >= 8 ? 15 : 0,
		transFat: 0,
		caffeine: i % 2 === 0 ? 180 + i * 15 : undefined
	}));
	add('computeDIIScore', 'varied_coverage', { dailyNutrients: days }, computeDIIScore(days));

	// Per-day coverage gates a nutrient's mean: the low-coverage fibre days are
	// dropped, and a 5000 g outlier saturates at |coefficient| instead of
	// dominating the score.
	const covered = Array.from({ length: 8 }, (_, i) => ({
		fiber: i === 7 ? 5000 : i < 4 ? 30 : 8,
		saturatedFat: 20 + i,
		coverage: { fiber: i < 4 || i === 7 ? 1 : 0.4, saturatedFat: 0.9 }
	}));
	add(
		'computeDIIScore',
		'coverage_gated_and_bounded',
		{ dailyNutrients: covered },
		computeDIIScore(covered)
	);

	add('computeDIIScore', 'empty', { dailyNutrients: [] }, computeDIIScore([]));
}

// --- extractMealTimingPatterns ------------------------------------------------
{
	// Europe/Zurich spans the 2025-03-30 spring-forward (CET +01:00 → CEST +02:00
	// at 01:00 UTC), so the same UTC clock time maps to different local hours
	// across the set. Includes a late-night meal (local hour ≥ 21), an
	// offset-bearing timestamp, a null eatenAt and an unparseable timestamp
	// (both skipped on both platforms).
	const entries = [
		{ date: '2025-03-29', eatenAt: '2025-03-29T07:30:00Z', calories: 450 }, // 08:30 CET
		{ date: '2025-03-29', eatenAt: '2025-03-29T11:45:00Z', calories: 700 }, // 12:45 CET
		{ date: '2025-03-29', eatenAt: '2025-03-29T20:15:00Z', calories: 300 }, // 21:15 CET → late night
		{ date: '2025-03-29', eatenAt: null, calories: 120 },
		{ date: '2025-03-30', eatenAt: '2025-03-30T00:30:00Z', calories: 90 }, // 01:30 CET (pre-transition)
		{ date: '2025-03-30', eatenAt: '2025-03-30T06:30:00Z', calories: 520 }, // 08:30 CEST
		{ date: '2025-03-30', eatenAt: '2025-03-30T19:45:00Z', calories: 610 }, // 21:45 CEST → late night
		{ date: '2025-03-31', eatenAt: '2025-03-31T07:58:59+02:00', calories: 480 }, // offset-bearing, 07:58 CEST
		{ date: '2025-03-31', eatenAt: '2025-03-31T18:20:00Z', calories: 650 }, // 20:20 CEST
		{ date: '2025-03-31', eatenAt: 'not-a-timestamp', calories: 999 }
	];
	add(
		'extractMealTimingPatterns',
		'zurich_dst_multi_day',
		{ entries, timeZone: 'Europe/Zurich' },
		extractMealTimingPatterns(entries, 'Europe/Zurich')
	);

	add(
		'extractMealTimingPatterns',
		'empty',
		{ entries: [], timeZone: 'UTC' },
		extractMealTimingPatterns([], 'UTC')
	);

	// A 00:30 snack belongs to the evening before (eating day starts 04:00), and
	// the average clock times are circular.
	const midnight = [
		{ date: '2025-05-01', eatenAt: '2025-05-01T06:00:00Z', calories: 400 }, // 08:00 CEST
		{ date: '2025-05-01', eatenAt: '2025-05-01T18:00:00Z', calories: 700 }, // 20:00
		{ date: '2025-05-02', eatenAt: '2025-05-01T22:30:00Z', calories: 150 }, // 00:30 next calendar day
		{ date: '2025-05-02', eatenAt: '2025-05-02T06:00:00Z', calories: 400 }, // 08:00
		{ date: '2025-05-02', eatenAt: '2025-05-02T17:00:00Z', calories: 700 } // 19:00
	];
	add(
		'extractMealTimingPatterns',
		'post_midnight_snack',
		{ entries: midnight, timeZone: 'Europe/Zurich' },
		extractMealTimingPatterns(midnight, 'Europe/Zurich')
	);
}

// --- computeCalorieFrontLoading -----------------------------------------------
{
	// Local-hour boundary at the default cutoff 14: in CET (+01:00), 12:59Z is
	// 13:59 local (morning) while 13:00Z is 14:00 local (not morning).
	const entries = [
		{ date: '2025-01-10', eatenAt: '2025-01-10T06:30:00Z', calories: 600 }, // 07:30 local
		{ date: '2025-01-10', eatenAt: '2025-01-10T12:59:00Z', calories: 400 }, // 13:59 local → morning
		{ date: '2025-01-10', eatenAt: '2025-01-10T13:00:00Z', calories: 500 }, // 14:00 local → afternoon
		{ date: '2025-01-11', eatenAt: '2025-01-11T17:00:00Z', calories: 900 }, // 18:00 local
		{ date: '2025-01-11', eatenAt: '2025-01-11T20:30:00Z', calories: 700 }, // 21:30 local
		{ date: '2025-01-12', eatenAt: '2025-01-12T07:15:00Z', calories: 0 }, // zero-total day
		{ date: '2025-01-13', eatenAt: null, calories: 800 } // skipped → day never counted
	];
	add(
		'computeCalorieFrontLoading',
		'zurich_default_cutoff',
		{ entries, timeZone: 'Europe/Zurich' },
		computeCalorieFrontLoading(entries, 'Europe/Zurich')
	);

	// Negative-UTC-offset zone with an explicit cutoff: 15:30Z is 10:30 local
	// in America/New_York (EST −05:00).
	const nyEntries = [
		{ date: '2025-02-01', eatenAt: '2025-02-01T15:30:00Z', calories: 550 }, // 10:30 local → morning
		{ date: '2025-02-01', eatenAt: '2025-02-01T17:00:00Z', calories: 650 }, // 12:00 local → afternoon
		{ date: '2025-02-02', eatenAt: '2025-02-02T13:45:00Z', calories: 300 }, // 08:45 local
		{ date: '2025-02-02', eatenAt: '2025-02-02T23:10:00Z', calories: 450 } // 18:10 local
	];
	const postMidnight = [
		{ date: '2025-03-10', eatenAt: '2025-03-10T00:00:00Z', calories: 500 }, // 01:00 CET → previous eating day
		{ date: '2025-03-10', eatenAt: '2025-03-10T08:00:00Z', calories: 500 }, // 09:00
		{ date: '2025-03-10', eatenAt: '2025-03-10T18:00:00Z', calories: 500 } // 19:00
	];
	add(
		'computeCalorieFrontLoading',
		'post_midnight_not_morning',
		{ entries: postMidnight, timeZone: 'Europe/Zurich' },
		computeCalorieFrontLoading(postMidnight, 'Europe/Zurich')
	);

	add(
		'computeCalorieFrontLoading',
		'new_york_cutoff12',
		{ entries: nyEntries, timeZone: 'America/New_York', cutoffHour: 12 },
		computeCalorieFrontLoading(nyEntries, 'America/New_York', 12)
	);
}

// --- computeCaffeineSleepCutoff -------------------------------------------------
{
	// Early-caffeine days (last dose ≤ 13:xx local) precede good sleep, late days
	// (≥ 16:xx local) precede poor sleep → a cutoff is detected. Crosses a month
	// boundary (2025-03-31 → 2025-04-01 sleep) to exercise next-date math.
	// Zurich local hour = UTC+1 (CET) for the March dates before the 30th.
	const caffeineEntries = [
		{ date: '2025-03-03', eatenAt: '2025-03-03T06:30:00Z', caffeine: 80 }, // 07:30 → last hour 10 below
		{ date: '2025-03-03', eatenAt: '2025-03-03T09:15:00Z', caffeine: 95 }, // 10:15 local
		{ date: '2025-03-04', eatenAt: '2025-03-04T10:40:00Z', caffeine: 80 }, // 11:40 local
		{ date: '2025-03-05', eatenAt: '2025-03-05T11:20:00Z', caffeine: 120 }, // 12:20 local
		{ date: '2025-03-06', eatenAt: '2025-03-06T12:05:00Z', caffeine: 60 }, // 13:05 local
		{ date: '2025-03-14', eatenAt: '2025-03-14T08:10:00Z', caffeine: 70 }, // 09:10 local
		{ date: '2025-03-15', eatenAt: '2025-03-15T09:50:00Z', caffeine: 70 }, // 10:50 local
		{ date: '2025-03-07', eatenAt: '2025-03-07T15:30:00Z', caffeine: 90 }, // 16:30 local
		{ date: '2025-03-08', eatenAt: '2025-03-08T16:45:00Z', caffeine: 85 }, // 17:45 local
		{ date: '2025-03-09', eatenAt: '2025-03-09T17:10:00Z', caffeine: 100 }, // 18:10 local
		{ date: '2025-03-16', eatenAt: '2025-03-16T16:20:00Z', caffeine: 100 }, // 17:20 local
		{ date: '2025-03-17', eatenAt: '2025-03-17T18:05:00Z', caffeine: 100 }, // 19:05 local
		{ date: '2025-03-31', eatenAt: '2025-03-31T17:20:00Z', caffeine: 75 }, // 19:20 CEST, sleep next month
		{ date: '2025-03-10', eatenAt: '2025-03-10T08:00:00Z', caffeine: 0 }, // zero caffeine → skipped
		{ date: '2025-03-11', eatenAt: null, caffeine: 200 }, // no timestamp → skipped
		{ date: '2025-03-12', eatenAt: '2025-03-12T07:00:00Z', caffeine: 90 } // no next-day sleep → ignored
	];
	const sleepData = [
		{ date: '2025-03-04', sleepQuality: 8.5, sleepDurationMinutes: 470 },
		{ date: '2025-03-05', sleepQuality: 8.0, sleepDurationMinutes: 455 },
		{ date: '2025-03-06', sleepQuality: 8.2, sleepDurationMinutes: 480 },
		{ date: '2025-03-07', sleepQuality: 7.9, sleepDurationMinutes: 445 },
		{ date: '2025-03-15', sleepQuality: 8.4, sleepDurationMinutes: 465 },
		{ date: '2025-03-16', sleepQuality: 7.7, sleepDurationMinutes: 450 },
		{ date: '2025-03-08', sleepQuality: 6.1, sleepDurationMinutes: 380 },
		{ date: '2025-03-09', sleepQuality: 5.8, sleepDurationMinutes: 365 },
		{ date: '2025-03-10', sleepQuality: 6.4, sleepDurationMinutes: 395 },
		{ date: '2025-03-17', sleepQuality: 5.9, sleepDurationMinutes: 370 },
		{ date: '2025-03-18', sleepQuality: 6.2, sleepDurationMinutes: 385 },
		{ date: '2025-04-01', sleepQuality: 5.5, sleepDurationMinutes: 350 },
		{ date: '2025-03-13', sleepQuality: null, sleepDurationMinutes: 400 } // incomplete → skipped
	];
	add(
		'computeCaffeineSleepCutoff',
		'cutoff_detected',
		{ caffeineEntries, sleepData, timeZone: 'Europe/Zurich' },
		computeCaffeineSleepCutoff(caffeineEntries, sleepData, 'Europe/Zurich')
	);

	const sparse = [{ date: '2025-05-01', eatenAt: '2025-05-01T07:00:00Z', caffeine: 90 }];
	const sparseSleep = [{ date: '2025-05-02', sleepQuality: 7.0, sleepDurationMinutes: 430 }];
	add(
		'computeCaffeineSleepCutoff',
		'insufficient_no_cutoff',
		{ caffeineEntries: sparse, sleepData: sparseSleep, timeZone: 'Europe/Zurich' },
		computeCaffeineSleepCutoff(sparse, sparseSleep, 'Europe/Zurich')
	);
}

// --- computeMealRegularity ------------------------------------------------------
{
	// breakfast is tight (stddev < 30 → high), lunch drifts (30–60 → medium),
	// dinner swings (> 60 → low). Two breakfast entries share 2025-04-02 — the
	// earlier one wins. One null-eatenAt entry is skipped.
	const entries = [
		{ date: '2025-04-01', mealType: 'Breakfast', eatenAt: '2025-04-01T05:30:00Z' }, // 07:30 CEST
		{ date: '2025-04-02', mealType: 'Breakfast', eatenAt: '2025-04-02T05:50:00Z' }, // 07:50
		{ date: '2025-04-02', mealType: 'Breakfast', eatenAt: '2025-04-02T06:40:00Z' }, // later dup, ignored
		{ date: '2025-04-03', mealType: 'Breakfast', eatenAt: '2025-04-03T05:40:00Z' }, // 07:40
		{ date: '2025-04-01', mealType: 'Lunch', eatenAt: '2025-04-01T10:00:00Z' }, // 12:00
		{ date: '2025-04-02', mealType: 'Lunch', eatenAt: '2025-04-02T11:10:00Z' }, // 13:10
		{ date: '2025-04-03', mealType: 'Lunch', eatenAt: '2025-04-03T10:35:00Z' }, // 12:35
		{ date: '2025-04-01', mealType: 'Dinner', eatenAt: '2025-04-01T16:30:00Z' }, // 18:30
		{ date: '2025-04-02', mealType: 'Dinner', eatenAt: '2025-04-02T19:45:00Z' }, // 21:45
		{ date: '2025-04-03', mealType: 'Dinner', eatenAt: '2025-04-03T17:00:00Z' }, // 19:00
		{ date: '2025-04-04', mealType: 'Snacks', eatenAt: null } // skipped
	];
	add(
		'computeMealRegularity',
		'three_meal_spread',
		{ entries, timeZone: 'Europe/Zurich' },
		computeMealRegularity(entries, 'Europe/Zurich')
	);

	add(
		'computeMealRegularity',
		'empty',
		{ entries: [], timeZone: 'UTC' },
		computeMealRegularity([], 'UTC')
	);
}

// --- computeNOVAScore -----------------------------------------------------------
{
	// Mixed coverage: two untagged entries drag coveragePct down without changing
	// the group split, which is computed over tagged calories only.
	const mixed = [
		{ calories: 400, novaGroup: 1 },
		{ calories: 250, novaGroup: 1 },
		{ calories: 300, novaGroup: 3 },
		{ calories: 600, novaGroup: 4 },
		{ calories: 150, novaGroup: 4 },
		{ calories: 200, novaGroup: 2 },
		{ calories: 350, novaGroup: null },
		{ calories: 120, novaGroup: null }
	];
	add(
		'computeNOVAScore',
		'mixed_groups_partial_coverage',
		{ entries: mixed },
		computeNOVAScore(mixed)
	);

	// Coverage under 30% must downgrade a usable sample to 'low' — but never
	// promote one that was insufficient to begin with (the two-entry case below).
	const thin = Array.from({ length: 10 }, (_, i) =>
		i === 0 ? { calories: 100, novaGroup: 4 } : { calories: 200, novaGroup: null }
	);
	add('computeNOVAScore', 'low_coverage_downgrades', { entries: thin }, computeNOVAScore(thin));

	const twoEntries = [
		{ calories: 100, novaGroup: 4 },
		{ calories: 900, novaGroup: null }
	];
	add(
		'computeNOVAScore',
		'insufficient_not_promoted',
		{ entries: twoEntries },
		computeNOVAScore(twoEntries)
	);

	add('computeNOVAScore', 'empty', { entries: [] }, computeNOVAScore([]));
}

// --- computeOmegaRatio ----------------------------------------------------------
{
	// Days missing either omega are dropped before averaging.
	const days = [
		{ date: '2025-02-01', omega3: 1.5, omega6: 9.0 },
		{ date: '2025-02-02', omega3: 2.0, omega6: 14.0 },
		{ date: '2025-02-03', omega3: 1.0, omega6: 6.0 },
		{ date: '2025-02-04', omega3: 0, omega6: 8.0 },
		{ date: '2025-02-05', omega3: 1.2, omega6: 0 },
		{ date: '2025-02-06', omega3: 0.2, omega6: 20.0, coverage: 0.3 } // under the coverage floor
	];
	add(
		'computeOmegaRatio',
		'optimal_with_dropped_days',
		{ dailyNutrients: days },
		computeOmegaRatio(days)
	);

	const high = Array.from({ length: 8 }, (_, i) => ({
		date: isoDay(i),
		omega3: 0.5,
		omega6: 15.0,
		coverage: 1
	}));
	add('computeOmegaRatio', 'high', { dailyNutrients: high }, computeOmegaRatio(high));

	const elevated = Array.from({ length: 8 }, (_, i) => ({
		date: isoDay(i),
		omega3: 1.0,
		omega6: 15.0
	}));
	add('computeOmegaRatio', 'elevated', { dailyNutrients: elevated }, computeOmegaRatio(elevated));

	// No usable day at all: there is no ratio to report and the status says so.
	add('computeOmegaRatio', 'empty', { dailyNutrients: [] }, computeOmegaRatio([]));
}

// --- computeFoodDiversity -------------------------------------------------------
{
	// Six Mondays-to-Sundays; the last two weeks are more varied than the two
	// before them, so the trend reads increasing.
	const diversityEntries: {
		date: string;
		foodId: string | null;
		recipeId: string | null;
		foodName: string;
	}[] = [];
	const perWeek = [3, 3, 4, 4, 7, 8];
	perWeek.forEach((count, week) => {
		for (let i = 0; i < count; i++) {
			diversityEntries.push({
				date: isoDay(week * 7 + (i % 7)),
				foodId: `food-${week}-${i}`,
				recipeId: null,
				foodName: `Food ${week}-${i}`
			});
		}
	});
	add(
		'computeFoodDiversity',
		'six_weeks_increasing',
		{ entries: diversityEntries },
		computeFoodDiversity(diversityEntries)
	);

	// Identity falls back recipeId then foodName, so the same food logged twice
	// counts once. Week boundaries must not move with the server's timezone.
	const dedup = [
		{ date: '2025-01-01', foodId: null, recipeId: 'r1', foodName: 'Stew' },
		{ date: '2025-01-02', foodId: null, recipeId: 'r1', foodName: 'Stew' },
		{ date: '2025-01-03', foodId: null, recipeId: null, foodName: 'Toast' },
		{ date: '2025-01-06', foodId: 'f1', recipeId: null, foodName: 'Apple' }
	];
	add(
		'computeFoodDiversity',
		'identity_fallback_and_weeks',
		{ entries: dedup },
		computeFoodDiversity(dedup)
	);

	add('computeFoodDiversity', 'empty', { entries: [] }, computeFoodDiversity([]));
}

// --- computeCalorieCycling ------------------------------------------------------
{
	const steady = Array.from({ length: 14 }, (_, i) => ({
		date: isoDay(i),
		calories: 2000 + (i % 2) * 20
	}));
	add(
		'computeCalorieCycling',
		'consistent',
		{ dailyNutrients: steady },
		computeCalorieCycling(steady)
	);

	const swinging = Array.from({ length: 14 }, (_, i) => ({
		date: isoDay(i),
		calories: i % 2 === 0 ? 1400 : 3000
	}));
	add(
		'computeCalorieCycling',
		'high_variance',
		{ dailyNutrients: swinging },
		computeCalorieCycling(swinging)
	);

	add('computeCalorieCycling', 'empty', { dailyNutrients: [] }, computeCalorieCycling([]));
}

// --- computeCaloricLag ----------------------------------------------------------
{
	// Weight responds to intake three days later, so lag 3 should correlate best.
	// Note computeCaloricLag takes {date, value} rather than the {date, calories} /
	// {date, weightKg} shapes the TDEE analytics use.
	// Weight *changes* follow intake three days earlier; intake is a fixed
	// pseudo-random sequence so neighbouring lags are not autocorrelated.
	const lagDays = 30;
	const noise = [
		0.31, -0.42, 0.07, 0.48, -0.19, -0.36, 0.22, 0.44, -0.05, -0.47, 0.13, 0.38, -0.29, 0.02, 0.46,
		-0.11, -0.4, 0.27, 0.35, -0.24, 0.09, -0.45, 0.41, -0.16, 0.18, -0.33, 0.49, -0.08, 0.25, -0.38,
		0.15, 0.04, -0.21
	];
	const kcal = Array.from({ length: lagDays + 3 }, (_, i) => ({
		date: isoDay(i),
		value: 2000 + Math.round(800 * noise[i])
	}));
	let wtAcc = 80;
	const wt = Array.from({ length: lagDays }, (_, i) => {
		wtAcc += (kcal[i].value - 2000) / 20000;
		return { date: isoDay(i + 3), value: round(wtAcc, 5) };
	});
	add(
		'computeCaloricLag',
		'three_day_lag',
		{ dailyCalories: kcal, dailyWeight: wt, maxLag: 7 },
		computeCaloricLag(kcal, wt, 7)
	);

	// Fewer than seven paired points per lag leaves every correlation null.
	const shortKcal = kcal.slice(0, 6);
	const shortWt = wt.slice(0, 6);
	add(
		'computeCaloricLag',
		'too_short_for_any_lag',
		{ dailyCalories: shortKcal, dailyWeight: shortWt, maxLag: 7 },
		computeCaloricLag(shortKcal, shortWt, 7)
	);
}

// --- computeProteinDistribution -------------------------------------------------
{
	// Three days, three meals each; the 12 g and 8 g meals fall below the 20 g bar.
	const meals = [
		{ date: '2025-03-01', mealType: 'Breakfast', protein: 30 },
		{ date: '2025-03-01', mealType: 'Lunch', protein: 40 },
		{ date: '2025-03-01', mealType: 'Dinner', protein: 12 },
		{ date: '2025-03-02', mealType: 'Breakfast', protein: 25 },
		{ date: '2025-03-02', mealType: 'Lunch', protein: 35 },
		{ date: '2025-03-02', mealType: 'Dinner', protein: 45 },
		{ date: '2025-03-03', mealType: 'Breakfast', protein: 8 },
		{ date: '2025-03-03', mealType: 'Lunch', protein: 30 },
		{ date: '2025-03-03', mealType: 'Dinner', protein: 28 }
	];
	add(
		'computeProteinDistribution',
		'three_days',
		{ entries: meals, threshold: 20 },
		computeProteinDistribution(meals, 20)
	);

	add(
		'computeProteinDistribution',
		'empty',
		{ entries: [], threshold: 20 },
		computeProteinDistribution([], 20)
	);
}

// --- computeSodiumWeightCorrelation ---------------------------------------------
{
	// Weight rises the day after each sodium spike.
	const sodiumDays = Array.from({ length: 16 }, (_, i) => ({
		date: isoDay(i),
		sodium: i % 4 === 0 ? 4200 : 1800
	}));
	const sodiumWeights = Array.from({ length: 16 }, (_, i) => ({
		date: isoDay(i),
		weightKg: round(80 + (i % 4 === 1 ? 0.6 : 0) + i * 0.01, 4)
	}));
	add(
		'computeSodiumWeightCorrelation',
		'spikes_precede_gain',
		{ dailyNutrients: sodiumDays, weightSeries: sodiumWeights },
		computeSodiumWeightCorrelation(sodiumDays, sodiumWeights)
	);

	const fewPairs = sodiumDays.slice(0, 5);
	const fewWeights = sodiumWeights.slice(0, 5);
	add(
		'computeSodiumWeightCorrelation',
		'insufficient_pairs',
		{ dailyNutrients: fewPairs, weightSeries: fewWeights },
		computeSodiumWeightCorrelation(fewPairs, fewWeights)
	);
}

// --- computeWeekdayWeekendSplit -------------------------------------------------
{
	// 2025-01-01 is a Wednesday, so the run covers both kinds of day.
	const isWeekend = (i: number) => {
		const dow = new Date(Date.UTC(2025, 0, 1) + i * 86400000).getUTCDay(); // Sun = 0
		return dow === 0 || dow === 6;
	};
	const split = Array.from({ length: 21 }, (_, i) => {
		const weekend = isWeekend(i);
		return {
			date: isoDay(i),
			calories: weekend ? 2600 : 2000,
			protein: weekend ? 110 : 130,
			carbs: weekend ? 300 : 220,
			fat: weekend ? 95 : 70,
			fiber: weekend ? 20 : 28
		};
	});
	add(
		'computeWeekdayWeekendSplit',
		'three_weeks',
		{ dailyNutrients: split },
		computeWeekdayWeekendSplit(split)
	);

	add(
		'computeWeekdayWeekendSplit',
		'empty',
		{ dailyNutrients: [] },
		computeWeekdayWeekendSplit([])
	);
}

// --- computeNutrientOutcomeCorrelations -----------------------------------------
{
	// protein tracks the outcome, fat runs against it, carbs is mostly null and
	// must be dropped for coverage, fiber is flat so its |r| falls under the bar.
	const nutrientDays = Array.from({ length: 20 }, (_, i) => ({
		date: isoDay(i),
		nutrients: {
			protein: 100 + i * 2,
			fat: 100 - i * 2,
			carbs: i % 3 === 0 ? 200 : null,
			fiber: 25
		} as Record<string, number | null>
	}));
	const outcomes = Array.from({ length: 20 }, (_, i) => ({ date: isoDay(i), value: 70 + i * 0.5 }));
	add(
		'computeNutrientOutcomeCorrelations',
		'mixed_signals',
		{ dailyNutrients: nutrientDays, outcomes, lagDays: 0 },
		computeNutrientOutcomeCorrelations(nutrientDays, outcomes, 0)
	);

	add(
		'computeNutrientOutcomeCorrelations',
		'lagged_by_one_day',
		{ dailyNutrients: nutrientDays, outcomes, lagDays: 1 },
		computeNutrientOutcomeCorrelations(nutrientDays, outcomes, 1)
	);

	add(
		'computeNutrientOutcomeCorrelations',
		'empty',
		{ dailyNutrients: [], outcomes: [], lagDays: 0 },
		computeNutrientOutcomeCorrelations([], [], 0)
	);
}

// --- detectFoodSleepPatterns ----------------------------------------------------
{
	// "Pizza" appears on four nights and drags quality down; "Salad" lifts it.
	// "Tea" appears twice and falls under the three-night minimum.
	const nights = 40;
	const sleepPoints = Array.from({ length: nights }, (_, i) => ({
		date: isoDay(i),
		quality: (i % 3 === 0 ? 4.5 : 8.0) + (i % 2 === 0 ? 0.2 : -0.2)
	}));
	const eveningFoods: {
		date: string;
		foodId: string;
		foodName: string;
		nutrients: Record<string, number>;
	}[] = [];
	for (let i = 0; i < nights; i++) {
		if (i % 3 === 0) {
			eveningFoods.push({
				date: isoDay(i),
				foodId: 'pizza',
				foodName: 'Pizza',
				nutrients: { calories: 900 }
			});
		} else {
			eveningFoods.push({
				date: isoDay(i),
				foodId: 'salad',
				foodName: 'Salad',
				nutrients: { calories: 200 }
			});
		}
	}
	eveningFoods.push({
		date: isoDay(1),
		foodId: 'tea',
		foodName: 'Tea',
		nutrients: { calories: 5 }
	});
	eveningFoods.push({
		date: isoDay(2),
		foodId: 'tea',
		foodName: 'Tea',
		nutrients: { calories: 5 }
	});
	add(
		'detectFoodSleepPatterns',
		'pizza_hurts_salad_helps',
		{ eveningFoods, sleepData: sleepPoints, minOccurrences: 5 },
		detectFoodSleepPatterns(eveningFoods, sleepPoints, 5)
	);

	// "Toast" tracks the base rate and must not surface; "Tea" is under the minimum.
	const withNoise = [
		...eveningFoods,
		...Array.from({ length: nights }, (_, i) => i)
			.filter((i) => i % 5 === 1)
			.map((i) => ({ date: isoDay(i), foodId: 'toast', foodName: 'Toast', nutrients: {} }))
	];
	add(
		'detectFoodSleepPatterns',
		'no_effect_food_filtered',
		{ eveningFoods: withNoise, sleepData: sleepPoints, minOccurrences: 5 },
		detectFoodSleepPatterns(withNoise, sleepPoints, 5)
	);

	add(
		'detectFoodSleepPatterns',
		'empty',
		{ eveningFoods: [], sleepData: [], minOccurrences: 5 },
		detectFoodSleepPatterns([], [], 5)
	);
}

// --- getConfidenceLevel ---------------------------------------------------------
{
	// The 7/14/30 boundaries every other analytic inherits.
	for (const n of [0, 6, 7, 13, 14, 29, 30, 100]) {
		add('getConfidenceLevel', `n_${n}`, { sampleSize: n }, getConfidenceLevel(n));
	}
}

// --- localMinutesOfDay ----------------------------------------------------------
{
	// The bucketing every time-of-day analytic depends on, including a DST
	// boundary (Europe/Zurich went to CEST on 2025-03-30) and a UTC-day flip.
	const samples: [string, string][] = [
		['2025-03-29T23:30:00Z', 'Europe/Zurich'],
		['2025-03-30T23:30:00Z', 'Europe/Zurich'],
		['2025-01-15T07:15:00Z', 'UTC'],
		['2025-01-15T23:45:00Z', 'America/New_York'],
		['2025-06-15T12:00:00Z', 'Asia/Tokyo'],
		['not-a-timestamp', 'UTC']
	];
	samples.forEach(([iso, tz], i) =>
		add(
			'localMinutesOfDay',
			`sample_${i}`,
			{ isoString: iso, timeZone: tz },
			localMinutesOfDay(iso, tz)
		)
	);
}

// --- stats helpers --------------------------------------------------------------
{
	for (const z of [-3, -1.96, -0.5, 0, 0.3, 1, 2.5]) {
		add('normalCdf', `z_${z}`, { z }, normalCdf(z));
	}
	add('studentTwoSidedP', 't2.228_df10', { t: 2.228, df: 10 }, studentTwoSidedP(2.228, 10));
	add('studentTwoSidedP', 't0_df5', { t: 0, df: 5 }, studentTwoSidedP(0, 5));
	add('studentTwoSidedP', 'df0', { t: 1, df: 0 }, studentTwoSidedP(1, 0));

	const wa = [8, 8.2, 7.9, 8.1, 8.3, 7.8];
	const wb = [5, 5.2, 4.9, 5.1, 5.3, 4.8];
	add('welchTTest', 'separated', { a: wa, b: wb }, welchTTest(wa, wb));
	add('welchTTest', 'identical', { a: wa, b: wa }, welchTTest(wa, wa));
	add('welchTTest', 'too_small', { a: [1], b: [2, 3] }, welchTTest([1], [2, 3]));
	add(
		'welchTTest',
		'unequal_sizes',
		{ a: [6, 7, 6.5, 7.2, 6.8, 7.1, 6.9, 7.3], b: [5.5, 6.1, 5.8] },
		welchTTest([6, 7, 6.5, 7.2, 6.8, 7.1, 6.9, 7.3], [5.5, 6.1, 5.8])
	);

	const ps = [0.01, 0.04, 0.03, 0.5, 0.2, 0.001];
	add('benjaminiHochberg', 'six', { pValues: ps }, benjaminiHochberg(ps));
	add('benjaminiHochberg', 'empty', { pValues: [] }, benjaminiHochberg([]));

	add('fisherCI95', 'r0.5_n30', { r: 0.5, n: 30 }, fisherCI95(0.5, 30));
	add('fisherCI95', 'r-0.8_n8', { r: -0.8, n: 8 }, fisherCI95(-0.8, 8));
	add('fisherCI95', 'n3', { r: 0.5, n: 3 }, fisherCI95(0.5, 3));
	add('fisherCI95', 'r1', { r: 1, n: 20 }, fisherCI95(1, 20));
}

// --- circular time ------------------------------------------------------------
{
	const straddle = [23 * 60, 1 * 60];
	add(
		'circularMeanMinutes',
		'straddles_midnight',
		{ values: straddle },
		circularMeanMinutes(straddle)
	);
	add(
		'circularStdMinutes',
		'straddles_midnight',
		{ values: straddle },
		circularStdMinutes(straddle)
	);
	const tight = [480, 490, 470, 485];
	add('circularMeanMinutes', 'tight', { values: tight }, circularMeanMinutes(tight));
	add('circularStdMinutes', 'tight', { values: tight }, circularStdMinutes(tight));
	const opposite = [0, 720];
	add('circularMeanMinutes', 'dispersed', { values: opposite }, circularMeanMinutes(opposite));
	add('circularStdMinutes', 'dispersed', { values: opposite }, circularStdMinutes(opposite));
	add('circularMeanMinutes', 'empty', { values: [] }, circularMeanMinutes([]));
	add('circularStdMinutes', 'empty', { values: [] }, circularStdMinutes([]));
	add('circularStdMinutes', 'single', { values: [600] }, circularStdMinutes([600]));

	const eating: [string, string][] = [
		['2024-03-10T00:30:00Z', 'UTC'],
		['2024-03-10T03:59:00Z', 'UTC'],
		['2024-03-10T04:00:00Z', 'UTC'],
		['2025-03-30T00:30:00Z', 'Europe/Zurich'],
		['2025-01-15T02:15:00Z', 'America/New_York'],
		['not-a-timestamp', 'UTC']
	];
	eating.forEach(([iso, tz], i) =>
		add('eatingDayOf', `sample_${i}`, { isoString: iso, timeZone: tz }, eatingDayOf(iso, tz))
	);
}

// --- nullDiv / nullSum ----------------------------------------------------------
{
	// The SQL NULL semantics the whole aggregation layer is built on.
	add('nullDiv', 'plain', { a: 10, b: 4 }, nullDiv(10, 4));
	add('nullDiv', 'divide_by_zero_is_null', { a: 10, b: 0 }, nullDiv(10, 0));
	add('nullSum', 'skips_nulls', { values: [1, null, 3, null, 5] }, nullSum([1, null, 3, null, 5]));
	add('nullSum', 'all_null_is_null', { values: [null, null] }, nullSum([null, null]));
	add('nullSum', 'empty_is_null', { values: [] }, nullSum([]));
}

const out = {
	version: 1,
	description:
		'Frozen golden vectors locking the shared Kotlin analytics to the TypeScript analytics. Generated from the TS implementation by analytics-parity/generate.ts — do not hand-edit.',
	tolerances: { default: 1e-9, pValue: 1e-7 },
	cases
};

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, 'fixtures/golden-vectors.json');
const jsonSource = JSON.stringify(out, null, 2) + '\n';

/**
 * The same cases as Kotlin source.
 *
 * The Kotlin harness lives in `commonTest` so the vectors are asserted on every
 * target — including the Kotlin/Native binary the iOS app links, which a JVM-only
 * test would never touch. `commonTest` has no filesystem, hence embedding.
 *
 * One literal per case rather than one for the whole file: a JVM string constant
 * is capped at 65535 bytes and the full fixture is already past that.
 */
const kotlinLiteral = (value: string) =>
	'"' +
	value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/\n/g, '\\n') +
	'"';

const kotlinTarget = resolve(
	here,
	'../mobile/shared/src/commonTest/kotlin/com/bissbilanz/analytics/GoldenVectors.kt'
);
const kotlinSource = `// GENERATED FILE — DO NOT EDIT.
// Source of truth: analytics-parity/generate.ts. Regenerate with \`bun run analytics:generate\`.
package com.bissbilanz.analytics

/** Tolerance for [GOLDEN_VECTOR_CASES]; pValue flows through an iterative beta approximation. */
internal const val GOLDEN_TOLERANCE_DEFAULT: Double = ${out.tolerances.default}
internal const val GOLDEN_TOLERANCE_P_VALUE: Double = ${out.tolerances.pValue}

/** One JSON \`{ fn, name, input, expected }\` object per case. */
internal val GOLDEN_VECTOR_CASES: List<String> =
    listOf(
${cases.map((c) => '        ' + kotlinLiteral(JSON.stringify(c))).join(',\n')},
    )
`;
// `--check` is the CI guard: the Kotlin fixture is generated, so a hand-edit or a
// forgotten regeneration after an analytics change would otherwise let the two
// languages assert different vectors and quietly agree with nobody.
const checkMode = process.argv.includes('--check');
const targets = [
	{ path: target, content: jsonSource },
	{ path: kotlinTarget, content: kotlinSource }
];

let drift = false;
for (const { path, content } of targets) {
	if (checkMode) {
		let current = '';
		try {
			current = readFileSync(path, 'utf-8');
		} catch {
			// missing file counts as drift
		}
		if (current !== content) {
			console.error(`DRIFT: ${path} is stale — run \`bun run analytics:generate\``);
			drift = true;
		}
	} else {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
		console.log(`Wrote ${cases.length} cases to ${path}`);
	}
}
if (checkMode) {
	if (drift) process.exit(1);
	console.log('Golden vectors are up to date.');
}
