import { pearsonCorrelation, type CorrelationResult } from './correlation';
import { benjaminiHochberg } from './stats';
import { shiftDate } from './date-utils';

export type LagResult = {
	lag: number;
	correlation: CorrelationResult | null;
	/** Benjamini–Hochberg adjusted p across the lags tested; null when untested. */
	qValue: number | null;
};

export type CaloricLagResult = {
	/** The lag with the largest |r| among those significant after FDR control, else null. */
	bestLag: number | null;
	/** Number of lags that had enough paired days to be tested. */
	comparisons: number;
	results: LagResult[];
};

const MIN_PAIRS = 7;
const FDR_LEVEL = 0.05;

/**
 * How many days after a day's intake the scale moves. Correlates the day-over-
 * day *change* in weight with intake `lag` days earlier: both intake and body
 * weight trend, and correlating two trending level series produces spurious
 * relationships between independent random walks (Granger & Newbold 1974).
 * The best lag is a maximum picked over `maxLag` candidates, so it is only
 * reported when it survives Benjamini–Hochberg control across them. What a
 * 1–3 day lag detects is glycogen and its bound water, not fat mass.
 */
export function computeCaloricLag(
	dailyCalories: { date: string; value: number | null }[],
	dailyWeight: { date: string; value: number | null }[],
	maxLag: number = 7
): CaloricLagResult {
	const calorieMap = new Map<string, number>();
	for (const entry of dailyCalories) {
		if (entry.value !== null) {
			calorieMap.set(entry.date, entry.value);
		}
	}

	const weightMap = new Map<string, number>();
	for (const entry of dailyWeight) {
		if (entry.value !== null) {
			weightMap.set(entry.date, entry.value);
		}
	}

	const weightDeltas = new Map<string, number>();
	for (const [date, weight] of weightMap) {
		const previous = weightMap.get(shiftDate(date, -1));
		if (previous !== undefined) weightDeltas.set(date, weight - previous);
	}

	const results: LagResult[] = [];

	// Start at lag=1: same-day correlation (lag=0) is excluded because
	// caloric intake cannot measurably affect weight on the same day
	for (let lag = 1; lag <= maxLag; lag++) {
		const pairedCalories: number[] = [];
		const pairedDeltas: number[] = [];

		for (const [date, delta] of weightDeltas) {
			const calories = calorieMap.get(shiftDate(date, -lag));
			if (calories !== undefined) {
				pairedCalories.push(calories);
				pairedDeltas.push(delta);
			}
		}

		if (pairedCalories.length < MIN_PAIRS) {
			results.push({ lag, correlation: null, qValue: null });
		} else {
			results.push({
				lag,
				correlation: pearsonCorrelation(pairedCalories, pairedDeltas),
				qValue: null
			});
		}
	}

	const tested = results.filter((r) => r.correlation !== null);
	const qValues = benjaminiHochberg(tested.map((r) => r.correlation!.pValue));
	tested.forEach((r, i) => {
		r.qValue = qValues[i];
	});

	let bestLag: number | null = null;
	let bestAbsR = -1;

	for (const result of tested) {
		if (result.qValue === null || result.qValue > FDR_LEVEL) continue;
		const absR = Math.abs(result.correlation!.r);
		if (absR > bestAbsR) {
			bestAbsR = absR;
			bestLag = result.lag;
		}
	}

	return { bestLag, comparisons: tested.length, results };
}
