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
