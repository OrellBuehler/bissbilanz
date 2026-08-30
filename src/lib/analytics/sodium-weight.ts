import { pearsonCorrelation, getConfidenceLevel, type ConfidenceLevel } from './correlation';
import { shiftDate } from './date-utils';
import { MIN_NUTRIENT_COVERAGE } from './constants.generated';

/** The 2019 IOM Chronic Disease Risk Reduction intake — a policy figure, used only to label days. */
export const SODIUM_CDRR_MG = 2300;

export type SodiumWeightResult = {
	correlation: {
		r: number;
		pValue: number | null;
		ciLow: number | null;
		ciHigh: number | null;
		sampleSize: number;
	};
	/** Mean sodium over the days that had a next-day weight pair — the same days the correlation used. */
	avgSodium: number;
	highSodiumDays: number;
	avgWeightDeltaAfterHighSodium: number | null;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

export function computeSodiumWeightCorrelation(
	dailyNutrients: { date: string; sodium: number; coverage?: number }[],
	weightSeries: { date: string; weightKg: number | null }[],
	minCoverage = MIN_NUTRIENT_COVERAGE
): SodiumWeightResult {
	const weightMap = new Map<string, number>();
	for (const e of weightSeries) {
		if (e.weightKg !== null) {
			weightMap.set(e.date, e.weightKg);
		}
	}

	const sodiumValues: number[] = [];
	const weightDeltas: number[] = [];
	let highSodiumDays = 0;
	const highSodiumDeltas: number[] = [];

	for (const entry of dailyNutrients) {
		if ((entry.coverage ?? 1) < minCoverage) continue;
		const nextDate = shiftDate(entry.date, 1);
		const w0 = weightMap.get(entry.date);
		const w1 = weightMap.get(nextDate);
		if (w0 === undefined || w1 === undefined) continue;

		const delta = w1 - w0;
		sodiumValues.push(entry.sodium);
		weightDeltas.push(delta);

		if (entry.sodium > SODIUM_CDRR_MG) {
			highSodiumDays++;
			highSodiumDeltas.push(delta);
		}
	}

	const sampleSize = sodiumValues.length;
	const avgSodium = sampleSize > 0 ? sodiumValues.reduce((s, v) => s + v, 0) / sampleSize : 0;
	const confidence = getConfidenceLevel(sampleSize);

	if (sampleSize < 7) {
		return {
			correlation: { r: 0, pValue: null, ciLow: null, ciHigh: null, sampleSize },
			avgSodium,
			highSodiumDays,
			avgWeightDeltaAfterHighSodium: null,
			confidence: 'insufficient',
			sampleSize
		};
	}

	const result = pearsonCorrelation(sodiumValues, weightDeltas);

	const avgWeightDeltaAfterHighSodium =
		highSodiumDeltas.length > 0
			? highSodiumDeltas.reduce((s, v) => s + v, 0) / highSodiumDeltas.length
			: null;

	return {
		correlation: {
			r: result.r,
			pValue: result.pValue,
			ciLow: result.ciLow,
			ciHigh: result.ciHigh,
			sampleSize
		},
		avgSodium,
		highSodiumDays,
		avgWeightDeltaAfterHighSodium,
		confidence,
		sampleSize
	};
}
