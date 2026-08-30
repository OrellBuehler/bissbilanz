import { type ConfidenceLevel } from './correlation';
import { weightMovingAverage } from './moving-average';
import {
	KCAL_PER_KG_FAT,
	EXPENDITURE_PER_KG_KCAL_PER_DAY,
	PLATEAU_THRESHOLD_KG_PER_WEEK,
	PLATEAU_MIN_SPAN_DAYS
} from './constants.generated';

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
	/** Calendar days spanned by the weights the plateau test ran on. */
	plateauDays: number;
	estimatedDeficit: number | null;
	/**
	 * The only "cause" the data can actually show is high day-to-day intake
	 * variance; metabolic adaptation and sodium-driven water retention are not
	 * identifiable from a scale plus a food log, so they are no longer asserted.
	 */
	cause: 'intake_variance' | 'none';
	confidence: ConfidenceLevel;
	sampleSize: number;
};

export type WeightForecast = {
	/** Trailing 7-day smoothed weight the projection is anchored on. */
	currentWeight: number | null;
	weeklyRate: number;
	day30: number | null;
	day60: number | null;
	day90: number | null;
	sampleSize: number;
	confidence: ConfidenceLevel;
};

type DatedWeight = { date: string; weightKg: number | null };
type DatedCalories = { date: string; calories: number | null };
type SmoothedPoint = { date: string; day: number; value: number };

function epochDay(date: string): number {
	return Math.floor(Date.parse(date + 'T00:00:00Z') / 86_400_000);
}

/**
 * OLS slope of value on calendar day (kg/day). Regressing on the date rather
 * than the row index keeps sparse logging from compressing time: weigh-ins on
 * days 1, 2, 3 and 14 are 13 days apart, not three rows.
 */
function slopePerDay(points: SmoothedPoint[]): number {
	const n = points.length;
	const xMean = points.reduce((s, p) => s + p.day, 0) / n;
	const yMean = points.reduce((s, p) => s + p.value, 0) / n;
	let num = 0;
	let den = 0;
	for (const p of points) {
		const dx = p.day - xMean;
		num += dx * (p.value - yMean);
		den += dx * dx;
	}
	return den === 0 ? 0 : num / den;
}

/**
 * One weight per measured date (same-date entries collapse to the latest).
 * The slope is fitted to these raw points: over a window an OLS line is
 * already the least-squares smoother, and pre-smoothing with a trailing
 * average would only add lag bias at the window's start plus autocorrelated
 * residuals.
 */
function measuredWeights(series: DatedWeight[]): SmoothedPoint[] {
	const measured = series
		.filter((e) => e.weightKg !== null)
		.map((e) => ({ date: e.date, weightKg: e.weightKg as number }));
	return weightMovingAverage(measured, 1).map((p) => ({
		date: p.date,
		day: epochDay(p.date),
		value: p.weightKg
	}));
}

/**
 * Trailing 7-calendar-day smoothed weights, one per measured date, for the
 * projection anchor. A single raw measurement carries ~0.5–2 kg of fluid and
 * glycogen noise, which the old forecast propagated into all three horizons.
 */
function smoothedWeights(series: DatedWeight[]): SmoothedPoint[] {
	const measured = series
		.filter((e) => e.weightKg !== null)
		.map((e) => ({ date: e.date, weightKg: e.weightKg as number }));
	return weightMovingAverage(measured, 7).map((p) => ({
		date: p.date,
		day: epochDay(p.date),
		value: p.movingAvg
	}));
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

function windowInputs(
	weightSeries: DatedWeight[],
	calorieSeries: DatedCalories[],
	windowDays: number
): { weights: SmoothedPoint[]; calories: number[] } {
	const allDates = [...weightSeries.map((e) => e.date), ...calorieSeries.map((e) => e.date)];
	const cutoff = cutoffFromData(allDates, windowDays);
	const weights = measuredWeights(weightSeries).filter((p) => p.date >= cutoff);
	const calories = calorieSeries
		.filter((e) => e.date >= cutoff && e.calories !== null)
		.map((e) => e.calories as number);
	return { weights, calories };
}

export function computeAdaptiveTDEE(
	weightSeries: DatedWeight[],
	calorieSeries: DatedCalories[],
	windowDays = 14
): TDEEResult {
	const { weights, calories } = windowInputs(weightSeries, calorieSeries, windowDays);
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

	const weeklyRate = slopePerDay(weights) * 7;
	const weeklyEnergyBalance = weeklyRate * KCAL_PER_KG_FAT;
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
	weightSeries: DatedWeight[],
	calorieSeries: DatedCalories[],
	estimatedTDEE: number | null
): PlateauResult {
	const { weights, calories } = windowInputs(weightSeries, calorieSeries, 14);
	const sampleSize = weights.length;
	const confidence: ConfidenceLevel =
		sampleSize >= 14 ? 'medium' : sampleSize >= 7 ? 'low' : 'insufficient';

	const notPlateaued = (conf: ConfidenceLevel): PlateauResult => ({
		isPlateaued: false,
		plateauDays: 0,
		estimatedDeficit: null,
		cause: 'none',
		confidence: conf,
		sampleSize
	});

	if (sampleSize < 3) return notPlateaued('insufficient');

	const spanDays = weights[weights.length - 1].day - weights[0].day + 1;
	// Fewer than seven weigh-ins over fewer than ten days cannot separate
	// "flat" from "not enough data": with ~0.5 kg of daily noise the slope's
	// own standard error is of the order of the plateau threshold there.
	if (sampleSize < 7 || spanDays < PLATEAU_MIN_SPAN_DAYS) return notPlateaued(confidence);

	const weeklyRate = slopePerDay(weights) * 7;
	if (Math.abs(weeklyRate) >= PLATEAU_THRESHOLD_KG_PER_WEEK) return notPlateaued(confidence);

	const estimatedDeficit =
		estimatedTDEE !== null && calories.length > 0 ? estimatedTDEE - mean(calories) : null;
	const cause: PlateauResult['cause'] =
		calories.length > 0 && stddev(calories) > 300 ? 'intake_variance' : 'none';

	return {
		isPlateaued: true,
		plateauDays: spanDays,
		estimatedDeficit,
		cause,
		confidence,
		sampleSize
	};
}

/**
 * Projects the smoothed current weight forward at `weeklyRate`, decelerating as
 * expenditure falls with mass: dW/dt = (I − TDEE(W)) / ρ with TDEE linear in W
 * (≈ 22 kcal/kg/day, Hall 2011) gives an exponential approach with time
 * constant τ = ρ / 22 ≈ 350 days, so a straight line overstates loss by ~12% at
 * 90 days. `rateConfidence` is the confidence of the rate estimate itself (from
 * the 14-day TDEE window), which is what the projection actually rests on.
 */
export function projectWeight(
	weightSeries: DatedWeight[],
	weeklyRate: number,
	rateConfidence?: ConfidenceLevel
): WeightForecast {
	const smoothed = smoothedWeights(weightSeries);
	const currentWeight = smoothed.length > 0 ? smoothed[smoothed.length - 1].value : null;

	const sampleSize = smoothed.length;
	const confidence: ConfidenceLevel =
		rateConfidence ??
		(sampleSize > 21
			? 'high'
			: sampleSize > 14
				? 'medium'
				: sampleSize > 7
					? 'low'
					: 'insufficient');

	const tau = KCAL_PER_KG_FAT / EXPENDITURE_PER_KG_KCAL_PER_DAY;
	const dailyRate = weeklyRate / 7;
	const project = (days: number) =>
		currentWeight !== null ? currentWeight + dailyRate * tau * (1 - Math.exp(-days / tau)) : null;

	return {
		currentWeight,
		weeklyRate,
		day30: project(30),
		day60: project(60),
		day90: project(90),
		sampleSize,
		confidence
	};
}
