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
	weights: Array<{ weightKg: number }>;
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

	// The food query is inclusive of both endpoints, so it covers `days + 1`
	// calendar days; average intake over that inclusive count. The weight-change
	// *rate* (calculateMaintenance) is per-interval, so it keeps `days`.
	const inclusiveDays = days + 1;
	const totalCalories = Object.values(dailyTotals).reduce((sum, cal) => sum + cal, 0);
	const avgDailyCalories = totalCalories / inclusiveDays;
	const coverage = daysWithEntries.length / inclusiveDays;

	const firstWeight = weights[0];
	const lastWeight = weights[weights.length - 1];
	const weightChangeKg = lastWeight.weightKg - firstWeight.weightKg;

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
			firstWeight: firstWeight.weightKg,
			lastWeight: lastWeight.weightKg,
			startDate,
			endDate
		}
	};
}
