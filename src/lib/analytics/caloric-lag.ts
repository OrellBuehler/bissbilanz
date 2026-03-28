import { pearsonCorrelation, type CorrelationResult } from './correlation';
import { shiftDate } from '$lib/utils/dates';

export type LagResult = {
	lag: number;
	correlation: CorrelationResult | null;
};

export type CaloricLagResult = {
	bestLag: number | null;
	results: LagResult[];
};

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

	const results: LagResult[] = [];

	// Start at lag=1: same-day correlation (lag=0) is excluded because
	// caloric intake cannot measurably affect weight on the same day
	for (let lag = 1; lag <= maxLag; lag++) {
		const pairedCalories: number[] = [];
		const pairedWeights: number[] = [];

		for (const [date, weight] of weightMap) {
			const shiftedDate = shiftDate(date, -lag);
			const calories = calorieMap.get(shiftedDate);
			if (calories !== undefined) {
				pairedCalories.push(calories);
				pairedWeights.push(weight);
			}
		}

		if (pairedCalories.length < 7) {
			results.push({ lag, correlation: null });
		} else {
			const correlation = pearsonCorrelation(pairedCalories, pairedWeights);
			results.push({ lag, correlation });
		}
	}

	let bestLag: number | null = null;
	let bestAbsR = -1;

	for (const result of results) {
		if (result.correlation !== null) {
			const absR = Math.abs(result.correlation.r);
			if (absR > bestAbsR) {
				bestAbsR = absR;
				bestLag = result.lag;
			}
		}
	}

	return { bestLag, results };
}
