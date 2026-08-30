import { round2 } from '$lib/utils/number';
import { calculateEntryMacros } from '$lib/utils/nutrition';
import { daysBetween } from '$lib/utils/dates';
import {
	KCAL_PER_KG_FAT,
	KCAL_PER_KG_MUSCLE,
	DEFAULT_MUSCLE_RATIO
} from '../analytics/constants.generated';

export { KCAL_PER_KG_FAT, KCAL_PER_KG_MUSCLE, DEFAULT_MUSCLE_RATIO };

export type MaintenanceInput = {
	weightChangeKg: number;
	avgDailyCalories: number;
	days: number;
	muscleRatio?: number;
};

export type MaintenanceResult = {
	maintenanceCalories: number;
	dailyDeficit: number;
	totalEnergyBalance: number;
	fatMassKg: number;
	muscleMassKg: number;
	fatCalories: number;
	muscleCalories: number;
	avgDailyCalories: number;
	weightChangeKg: number;
	days: number;
	muscleRatio: number;
};

export function calculateMaintenance(input: MaintenanceInput): MaintenanceResult | null {
	const { weightChangeKg, avgDailyCalories, days, muscleRatio = DEFAULT_MUSCLE_RATIO } = input;

	if (days <= 0 || avgDailyCalories < 0) return null;

	const fatRatio = 1 - muscleRatio;
	const fatMassKg = Math.abs(weightChangeKg) * fatRatio;
	const muscleMassKg = Math.abs(weightChangeKg) * muscleRatio;

	const fatCalories = fatMassKg * KCAL_PER_KG_FAT;
	const muscleCalories = muscleMassKg * KCAL_PER_KG_MUSCLE;
	const totalEnergy = fatCalories + muscleCalories;

	const sign = weightChangeKg < 0 ? 1 : weightChangeKg > 0 ? -1 : 0;
	const totalEnergyBalance = totalEnergy * sign;
	const dailyDeficit = days > 0 ? totalEnergyBalance / days : 0;

	const maintenanceCalories = Math.round(avgDailyCalories + dailyDeficit);

	return {
		maintenanceCalories,
		dailyDeficit: Math.round(dailyDeficit),
		totalEnergyBalance: Math.round(totalEnergyBalance),
		fatMassKg: round2(fatMassKg),
		muscleMassKg: round2(muscleMassKg),
		fatCalories: Math.round(fatCalories),
		muscleCalories: Math.round(muscleCalories),
		avgDailyCalories: Math.round(avgDailyCalories),
		weightChangeKg,
		days,
		muscleRatio
	};
}

export type MaintenanceReportInput = {
	entries: Array<{
		date: string;
		calories: number | null;
		protein: number | null;
		carbs: number | null;
		fat: number | null;
		fiber: number | null;
		servings: number;
	}>;
	/** Sorted ascending by date. `entryDate` enables endpoint smoothing. */
	weights: Array<{ weightKg: number; entryDate?: string }>;
	fastingDays: Iterable<string>;
	startDate: string;
	endDate: string;
	muscleRatio?: number;
};

export type MaintenanceReport = {
	result: MaintenanceResult;
	meta: {
		weightEntries: number;
		foodEntryDays: number;
		totalDays: number;
		coverage: number;
		/** Smoothed start/end anchors (7-day means around the endpoints) when dates are known. */
		firstWeight: number;
		lastWeight: number;
		startDate: string;
		endDate: string;
	};
};

export type MaintenanceReportError = {
	error: 'insufficient_data' | 'invalid_range' | 'calculation_failed';
	message: string;
};

const ANCHOR_WINDOW_DAYS = 7;

function epochDay(date: string): number {
	return Math.floor(Date.parse(date + 'T00:00:00Z') / 86_400_000);
}

/**
 * Weight change over the interval from smoothed endpoints. A single raw
 * measurement carries up to ~2 kg of fluid noise, which over 30 days is ~500
 * kcal/day of maintenance error, so each endpoint is the mean of the weights in
 * the first / last seven days. The two anchors sit inside the interval, so
 * their difference is scaled up to the full `days` by the anchors' actual
 * separation (their mean dates). Falls back to raw endpoints when the weights
 * carry no dates or the anchors overlap.
 */
export function smoothedWeightChange(
	weights: Array<{ weightKg: number; entryDate?: string }>,
	days: number
): { firstWeight: number; lastWeight: number; weightChangeKg: number } {
	const raw = {
		firstWeight: weights[0].weightKg,
		lastWeight: weights[weights.length - 1].weightKg,
		weightChangeKg: weights[weights.length - 1].weightKg - weights[0].weightKg
	};
	if (!weights.every((w) => w.entryDate)) return raw;

	const dated = weights
		.map((w) => ({ day: epochDay(w.entryDate as string), weightKg: w.weightKg }))
		.sort((a, b) => a.day - b.day);
	const firstDay = dated[0].day;
	const lastDay = dated[dated.length - 1].day;
	const head = dated.filter((w) => w.day < firstDay + ANCHOR_WINDOW_DAYS);
	const tail = dated.filter((w) => w.day > lastDay - ANCHOR_WINDOW_DAYS);
	const meanOf = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
	const headDay = meanOf(head.map((w) => w.day));
	const tailDay = meanOf(tail.map((w) => w.day));
	const separation = tailDay - headDay;
	if (separation <= 0) return raw;

	const firstWeight = meanOf(head.map((w) => w.weightKg));
	const lastWeight = meanOf(tail.map((w) => w.weightKg));
	return {
		firstWeight,
		lastWeight,
		weightChangeKg: ((lastWeight - firstWeight) * days) / separation
	};
}

export function buildMaintenanceReport(
	input: MaintenanceReportInput
): MaintenanceReport | MaintenanceReportError {
	const { entries, weights, fastingDays, startDate, endDate, muscleRatio } = input;

	if (weights.length < 2) {
		return {
			error: 'insufficient_data',
			message: 'At least 2 weight entries are required in the selected range'
		};
	}

	const dailyTotals: Record<string, number> = {};
	for (const entry of entries) {
		dailyTotals[entry.date] = (dailyTotals[entry.date] ?? 0) + calculateEntryMacros(entry).calories;
	}
	// Fasting days count as logged days with 0 kcal.
	for (const fastingDate of fastingDays) {
		if (!(fastingDate in dailyTotals)) dailyTotals[fastingDate] = 0;
	}

	const daysWithEntries = Object.keys(dailyTotals);
	if (daysWithEntries.length === 0) {
		return { error: 'insufficient_data', message: 'No food entries found in the selected range' };
	}

	const days = daysBetween(startDate, endDate);
	if (days <= 0) {
		return { error: 'invalid_range', message: 'End date must be after start date' };
	}

	// Mean intake is over the days that were actually logged (fasting days are
	// explicit zeros above). An unlogged day is unknown, not a zero-calorie day —
	// dividing by every calendar day understated intake, and therefore
	// maintenance, by the user's non-logging rate. The inclusive calendar count
	// only feeds the coverage figure; the weight-change *rate* keeps `days`.
	const inclusiveDays = days + 1;
	const totalCalories = Object.values(dailyTotals).reduce((sum, cal) => sum + cal, 0);
	const avgDailyCalories = totalCalories / daysWithEntries.length;
	const coverage = daysWithEntries.length / inclusiveDays;

	const { firstWeight, lastWeight, weightChangeKg } = smoothedWeightChange(weights, days);

	const result = calculateMaintenance({ weightChangeKg, avgDailyCalories, days, muscleRatio });
	if (!result) {
		return { error: 'calculation_failed', message: 'Could not calculate maintenance calories' };
	}

	return {
		result,
		meta: {
			weightEntries: weights.length,
			foodEntryDays: daysWithEntries.length,
			totalDays: inclusiveDays,
			coverage,
			firstWeight,
			lastWeight,
			startDate,
			endDate
		}
	};
}
