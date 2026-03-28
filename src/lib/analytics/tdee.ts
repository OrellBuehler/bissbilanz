import { type ConfidenceLevel } from './correlation';

export type TDEEResult = {
	estimatedTDEE: number | null;
	trend: 'loss' | 'gain' | 'maintenance';
	avgIntake: number;
	weeklyRate: number;
	confidence: ConfidenceLevel;
	sampleSize: number;
};

export type PlateauResult = {
	isPlateaued: boolean;
	plateauDays: number;
	estimatedDeficit: number | null;
	cause: 'adaptive_metabolism' | 'intake_variance' | 'water_retention' | 'none';
	confidence: ConfidenceLevel;
	sampleSize: number;
};

export type WeightForecast = {
	currentWeight: number | null;
	weeklyRate: number;
	day30: number | null;
	day60: number | null;
	day90: number | null;
	sampleSize: number;
	confidence: ConfidenceLevel;
};

function linearSlope(values: number[]): number {
	const n = values.length;
	const xMean = (n - 1) / 2;
	const yMean = values.reduce((s, v) => s + v, 0) / n;
	let num = 0;
	let den = 0;
	for (let i = 0; i < n; i++) {
		const dx = i - xMean;
		num += dx * (values[i] - yMean);
		den += dx * dx;
	}
	return den === 0 ? 0 : num / den;
}

function mean(values: number[]): number {
	return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[]): number {
	const m = mean(values);
	const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
	return Math.sqrt(variance);
}

function cutoffFromData(dates: string[], windowDays: number): string {
	if (dates.length === 0) return '';
	const maxDate = dates.sort().at(-1)!;
	const d = new Date(maxDate + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() - windowDays);
	return d.toISOString().slice(0, 10);
}

export function computeAdaptiveTDEE(
	weightSeries: { date: string; weightKg: number | null }[],
	calorieSeries: { date: string; calories: number | null }[],
	windowDays = 14
): TDEEResult {
	const allDates = [...weightSeries.map((e) => e.date), ...calorieSeries.map((e) => e.date)];
	const cutoff = cutoffFromData(allDates, windowDays);

	const weights = weightSeries
		.filter((e) => e.date >= cutoff && e.weightKg !== null)
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((e) => e.weightKg as number);

	const calories = calorieSeries
		.filter((e) => e.date >= cutoff && e.calories !== null)
		.map((e) => e.calories as number);

	const sampleSize = weights.length;

	if (weights.length < 5 || calories.length < 10) {
		return {
			estimatedTDEE: null,
			trend: 'maintenance',
			avgIntake: calories.length > 0 ? mean(calories) : 0,
			weeklyRate: 0,
			confidence: 'insufficient',
			sampleSize
		};
	}

	const slope = linearSlope(weights);
	const weeklyRate = slope * 7;
	const weeklyEnergyBalance = weeklyRate * 7700;
	const avgDailyIntake = mean(calories);
	let estimatedTDEE = avgDailyIntake - weeklyEnergyBalance / 7;

	let confidence: ConfidenceLevel = sampleSize >= 21 ? 'high' : sampleSize >= 14 ? 'medium' : 'low';

	if (estimatedTDEE < 1200 || estimatedTDEE > 5000) {
		estimatedTDEE = Math.max(1200, Math.min(5000, estimatedTDEE));
		confidence = 'low';
	}

	const trend: TDEEResult['trend'] =
		weeklyRate < -0.05 ? 'loss' : weeklyRate > 0.05 ? 'gain' : 'maintenance';

	return { estimatedTDEE, trend, avgIntake: avgDailyIntake, weeklyRate, confidence, sampleSize };
}

export function detectPlateau(
	weightSeries: { date: string; weightKg: number | null }[],
	calorieSeries: { date: string; calories: number | null }[],
	estimatedTDEE: number | null,
	sodiumAvg?: number | null
): PlateauResult {
	const allDates = [...weightSeries.map((e) => e.date), ...calorieSeries.map((e) => e.date)];
	const cutoff = cutoffFromData(allDates, 14);

	const weights = weightSeries
		.filter((e) => e.date >= cutoff && e.weightKg !== null)
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((e) => e.weightKg as number);

	const calories = calorieSeries
		.filter((e) => e.date >= cutoff && e.calories !== null)
		.map((e) => e.calories as number);

	const sampleSize = weights.length;
	const confidence: ConfidenceLevel =
		sampleSize >= 14 ? 'medium' : sampleSize >= 7 ? 'low' : 'insufficient';

	if (sampleSize < 3) {
		return {
			isPlateaued: false,
			plateauDays: 0,
			estimatedDeficit: null,
			cause: 'none',
			confidence: 'insufficient',
			sampleSize
		};
	}

	const slope = linearSlope(weights);
	const weeklyRate = slope * 7;
	const isPlateaued = Math.abs(weeklyRate) < 0.1;

	if (!isPlateaued) {
		return {
			isPlateaued: false,
			plateauDays: 0,
			estimatedDeficit: null,
			cause: 'none',
			confidence,
			sampleSize
		};
	}

	const estimatedDeficit =
		estimatedTDEE !== null && calories.length > 0 ? estimatedTDEE - mean(calories) : null;

	let cause: PlateauResult['cause'] = 'none';

	if (calories.length > 0 && stddev(calories) > 300) {
		cause = 'intake_variance';
	} else if (sodiumAvg != null && sodiumAvg > 3000) {
		cause = 'water_retention';
	} else if (estimatedDeficit !== null && estimatedDeficit > 200) {
		cause = 'adaptive_metabolism';
	}

	return {
		isPlateaued: true,
		plateauDays: sampleSize,
		estimatedDeficit,
		cause,
		confidence,
		sampleSize
	};
}

export function projectWeight(
	weightSeries: { date: string; weightKg: number | null }[],
	weeklyRate: number
): WeightForecast {
	const sorted = weightSeries
		.filter((e) => e.weightKg !== null)
		.sort((a, b) => a.date.localeCompare(b.date));

	const currentWeight = sorted.length > 0 ? (sorted[sorted.length - 1].weightKg as number) : null;

	const sampleSize = sorted.length;
	const confidence: ConfidenceLevel =
		sampleSize > 21 ? 'high' : sampleSize > 14 ? 'medium' : sampleSize > 7 ? 'low' : 'insufficient';

	const day30 = currentWeight !== null ? currentWeight + (weeklyRate * 30) / 7 : null;
	const day60 = currentWeight !== null ? currentWeight + (weeklyRate * 60) / 7 : null;
	const day90 = currentWeight !== null ? currentWeight + (weeklyRate * 90) / 7 : null;

	return { currentWeight, weeklyRate, day30, day60, day90, sampleSize, confidence };
}
