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
		fatMassKg: Math.round(fatMassKg * 100) / 100,
		muscleMassKg: Math.round(muscleMassKg * 100) / 100,
		fatCalories: Math.round(fatCalories),
		muscleCalories: Math.round(muscleCalories),
		avgDailyCalories: Math.round(avgDailyCalories),
		weightChangeKg,
		days,
		muscleRatio
	};
}
