import { pearsonCorrelation, getConfidenceLevel, type ConfidenceLevel } from './correlation';
import { shiftDate } from '$lib/utils/dates';

export type SodiumWeightResult = {
	correlation: { r: number; pValue: number | null; sampleSize: number };
	avgSodium: number;
	highSodiumDays: number;
	avgWeightDeltaAfterHighSodium: number | null;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

export function computeSodiumWeightCorrelation(
	dailyNutrients: { date: string; sodium: number }[],
	weightSeries: { date: string; weightKg: number | null }[]
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
		const nextDate = shiftDate(entry.date, 1);
		const w0 = weightMap.get(entry.date);
		const w1 = weightMap.get(nextDate);
		if (w0 === undefined || w1 === undefined) continue;

		const delta = w1 - w0;
		sodiumValues.push(entry.sodium);
		weightDeltas.push(delta);

		if (entry.sodium > 2300) {
			highSodiumDays++;
			highSodiumDeltas.push(delta);
		}
	}

	const totalSodium =
		dailyNutrients.length > 0
			? dailyNutrients.reduce((s, e) => s + e.sodium, 0) / dailyNutrients.length
			: 0;

	const sampleSize = sodiumValues.length;
	const confidence = getConfidenceLevel(sampleSize);

	if (sampleSize < 7) {
		return {
			correlation: { r: 0, pValue: null, sampleSize },
			avgSodium: totalSodium,
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
		correlation: { r: result.r, pValue: result.pValue, sampleSize },
		avgSodium: totalSodium,
		highSodiumDays,
		avgWeightDeltaAfterHighSodium,
		confidence,
		sampleSize
	};
}
