import { describe, expect, test } from 'bun:test';
import {
	calculateMaintenance,
	KCAL_PER_KG_FAT,
	KCAL_PER_KG_MUSCLE
} from '../../src/lib/utils/maintenance';

describe('calculateMaintenance', () => {
	test('calculates maintenance from weight loss (issue example)', () => {
		const result = calculateMaintenance({
			weightChangeKg: -2,
			avgDailyCalories: 1800,
			days: 28,
			muscleRatio: 0.3
		});

		expect(result).not.toBeNull();
		expect(result!.fatMassKg).toBe(1.4);
		expect(result!.muscleMassKg).toBe(0.6);
		expect(result!.fatCalories).toBe(10780);
		expect(result!.muscleCalories).toBe(1080);
		expect(result!.totalDeficit).toBe(11860);
		expect(result!.dailyDeficit).toBe(424);
		expect(result!.maintenanceCalories).toBe(2224);
	});

	test('calculates maintenance from weight gain', () => {
		const result = calculateMaintenance({
			weightChangeKg: 1,
			avgDailyCalories: 2500,
			days: 14,
			muscleRatio: 0.3
		});

		expect(result).not.toBeNull();
		expect(result!.totalDeficit).toBeLessThan(0);
		expect(result!.maintenanceCalories).toBeLessThan(2500);
	});

	test('handles zero weight change', () => {
		const result = calculateMaintenance({
			weightChangeKg: 0,
			avgDailyCalories: 2000,
			days: 28
		});

		expect(result).not.toBeNull();
		expect(result!.maintenanceCalories).toBe(2000);
		expect(result!.dailyDeficit).toBe(0);
	});

	test('uses default muscle ratio of 0.3', () => {
		const result = calculateMaintenance({
			weightChangeKg: -1,
			avgDailyCalories: 2000,
			days: 7
		});

		expect(result).not.toBeNull();
		expect(result!.muscleRatio).toBe(0.3);
		expect(result!.fatMassKg).toBe(0.7);
		expect(result!.muscleMassKg).toBe(0.3);
	});

	test('returns null for zero days', () => {
		const result = calculateMaintenance({
			weightChangeKg: -1,
			avgDailyCalories: 2000,
			days: 0
		});

		expect(result).toBeNull();
	});

	test('returns null for negative calories', () => {
		const result = calculateMaintenance({
			weightChangeKg: -1,
			avgDailyCalories: -100,
			days: 7
		});

		expect(result).toBeNull();
	});

	test('custom muscle ratio', () => {
		const result = calculateMaintenance({
			weightChangeKg: -1,
			avgDailyCalories: 2000,
			days: 7,
			muscleRatio: 0.5
		});

		expect(result).not.toBeNull();
		expect(result!.fatMassKg).toBe(0.5);
		expect(result!.muscleMassKg).toBe(0.5);
		expect(result!.fatCalories).toBe(KCAL_PER_KG_FAT * 0.5);
		expect(result!.muscleCalories).toBe(KCAL_PER_KG_MUSCLE * 0.5);
	});

	test('energy constants are correct', () => {
		expect(KCAL_PER_KG_FAT).toBe(7700);
		expect(KCAL_PER_KG_MUSCLE).toBe(1800);
	});
});
