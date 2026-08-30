import { pearsonCorrelation, type CorrelationResult } from './correlation';
import { benjaminiHochberg } from './stats';
import { shiftDate } from './date-utils';

export type NutrientCorrelation = {
	nutrientKey: string;
	correlation: CorrelationResult;
	/** Benjamini–Hochberg adjusted p across every nutrient screened. */
	qValue: number;
	/** Number of nutrients that were testable in this screen. */
	comparisons: number;
};

const MIN_PAIRS = 7;
const MIN_ABS_R = 0.15;
const FDR_LEVEL = 0.1;

/**
 * Screens every nutrient key against a daily outcome. The strongest of thirty
 * correlations is an upward-biased maximum even when nothing is there, so the
 * screen applies Benjamini–Hochberg control across the keys tested and only
 * returns those under the FDR threshold, most extreme first. Callers pairing a
 * nutrient with body weight should pass day-over-day weight *changes* as the
 * outcome: two trending level series correlate spuriously.
 */
export function computeNutrientOutcomeCorrelations(
	dailyNutrients: { date: string; nutrients: Record<string, number | null> }[],
	outcomes: { date: string; value: number }[],
	lagDays: number = 0
): NutrientCorrelation[] {
	const outcomeMap = new Map<string, number>();
	for (const o of outcomes) {
		outcomeMap.set(o.date, o.value);
	}

	const allKeys = new Set<string>();
	for (const day of dailyNutrients) {
		for (const key of Object.keys(day.nutrients)) {
			allKeys.add(key);
		}
	}

	const tested: { nutrientKey: string; correlation: CorrelationResult }[] = [];

	for (const key of allKeys) {
		const paired: { nutrient: number; outcome: number }[] = [];
		let nullCount = 0;

		for (const day of dailyNutrients) {
			const nutrientValue = day.nutrients[key] ?? null;
			if (nutrientValue === null || nutrientValue === undefined) {
				nullCount++;
				continue;
			}

			const outcomeDate = lagDays === 0 ? day.date : shiftDate(day.date, lagDays);
			const outcomeValue = outcomeMap.get(outcomeDate);
			if (outcomeValue === undefined) continue;

			paired.push({ nutrient: nutrientValue, outcome: outcomeValue });
		}

		const totalDays = dailyNutrients.length;
		if (totalDays === 0 || nullCount / totalDays > 0.5) continue;

		if (paired.length < MIN_PAIRS) continue;

		const xVals = paired.map((p) => p.nutrient);
		const yVals = paired.map((p) => p.outcome);

		tested.push({ nutrientKey: key, correlation: pearsonCorrelation(xVals, yVals) });
	}

	const qValues = benjaminiHochberg(tested.map((t) => t.correlation.pValue));
	const results = tested
		.map((t, i) => ({ ...t, qValue: qValues[i], comparisons: tested.length }))
		.filter((t) => Math.abs(t.correlation.r) >= MIN_ABS_R && t.qValue <= FDR_LEVEL);

	results.sort((a, b) => Math.abs(b.correlation.r) - Math.abs(a.correlation.r));

	return results;
}
