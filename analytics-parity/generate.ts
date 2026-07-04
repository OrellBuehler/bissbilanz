/**
 * Generates the frozen golden-vector fixtures from the TypeScript analytics.
 * Run with: `bun run analytics-parity/generate.ts`
 *
 * The fixtures lock the shared Kotlin analytics to the TS analytics — see
 * analytics-parity/README.md. Keep this file dependency-free (pure imports of
 * the analytics modules) so it runs without the SvelteKit runtime.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pearsonCorrelation } from '../src/lib/analytics/correlation';
import { movingAverage } from '../src/lib/analytics/moving-average';
import { computeAdaptiveTDEE, detectPlateau, projectWeight } from '../src/lib/analytics/tdee';
import {
	aggregateDailyNutrientTotals,
	type AggEntry,
	type AggFood,
	type AggRecipe
} from '../src/lib/analytics/aggregation';
import { calculateMaintenance, type MaintenanceInput } from '../src/lib/utils/maintenance';
import { computeTEF } from '../src/lib/analytics/food-quality';
import { extractMealTimingPatterns } from '../src/lib/analytics/meal-timing';
import { computeCalorieFrontLoading } from '../src/lib/analytics/calorie-patterns';
import { computeCaffeineSleepCutoff } from '../src/lib/analytics/caffeine-sleep';
import { computeMealRegularity } from '../src/lib/analytics/meal-regularity';

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
		'plateau_adaptive',
		{ weightSeries: w, calorieSeries: c, estimatedTDEE: tdee, sodiumAvg: null },
		detectPlateau(w, c, tdee, null)
	);

	const w2 = weightSeries(14, 78, 0.0);
	const c2 = calorieSeries(14, (i) => (i % 2 === 0 ? 1500 : 2900)); // high variance
	add(
		'detectPlateau',
		'plateau_intake_variance',
		{ weightSeries: w2, calorieSeries: c2, estimatedTDEE: 2300, sodiumAvg: null },
		detectPlateau(w2, c2, 2300, null)
	);

	const w3 = weightSeries(14, 78, -0.06); // clearly losing → not plateau
	const c3 = calorieSeries(14, () => 2000);
	add(
		'detectPlateau',
		'not_plateau',
		{ weightSeries: w3, calorieSeries: c3, estimatedTDEE: 2400, sodiumAvg: null },
		detectPlateau(w3, c3, 2400, null)
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
		{ protein: 100, carbs: 0, fat: 40, calories: 0 }
	];
	add('computeTEF', 'varying_calories', { dailyNutrients: tefDays }, computeTEF(tefDays));
	add('computeTEF', 'empty', { dailyNutrients: [] }, computeTEF([]));
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
		{ date: '2025-03-07', eatenAt: '2025-03-07T15:30:00Z', caffeine: 90 }, // 16:30 local
		{ date: '2025-03-08', eatenAt: '2025-03-08T16:45:00Z', caffeine: 85 }, // 17:45 local
		{ date: '2025-03-09', eatenAt: '2025-03-09T17:10:00Z', caffeine: 100 }, // 18:10 local
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
		{ date: '2025-03-08', sleepQuality: 6.1, sleepDurationMinutes: 380 },
		{ date: '2025-03-09', sleepQuality: 5.8, sleepDurationMinutes: 365 },
		{ date: '2025-03-10', sleepQuality: 6.4, sleepDurationMinutes: 395 },
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

const out = {
	version: 1,
	description:
		'Frozen golden vectors locking the shared Kotlin analytics to the TypeScript analytics. Generated from the TS implementation by analytics-parity/generate.ts — do not hand-edit.',
	tolerances: { default: 1e-9, pValue: 1e-7 },
	cases
};

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, 'fixtures/golden-vectors.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${cases.length} cases to ${target}`);
