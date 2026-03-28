import { describe, test, expect } from 'vitest';
import { computeWeekdayWeekendSplit } from '$lib/analytics/weekday-weekend';

describe('computeWeekdayWeekendSplit', () => {
	test('consistent eating gives small delta', () => {
		const days = [
			{ date: '2024-01-01', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-02', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-03', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-04', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-05', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-06', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-07', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 }
		];
		const result = computeWeekdayWeekendSplit(days);
		expect(result.calorieDelta).toBe(0);
		expect(result.calorieDeltaPct).toBe(0);
	});

	test('weekend overeating gives positive calorieDelta', () => {
		const days = [
			{ date: '2024-01-01', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-02', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-03', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-04', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-05', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-06', calories: 2800, protein: 110, carbs: 280, fat: 90, fiber: 20 },
			{ date: '2024-01-07', calories: 2800, protein: 110, carbs: 280, fat: 90, fiber: 20 }
		];
		const result = computeWeekdayWeekendSplit(days);
		expect(result.calorieDelta).toBeGreaterThan(0);
		expect(result.weekend.avgCalories).toBe(2800);
		expect(result.weekday.avgCalories).toBe(2000);
	});

	test('day classification: Mon-Fri are weekdays, Sat-Sun are weekend', () => {
		// 2024-01-01 = Monday, 2024-01-06 = Saturday, 2024-01-07 = Sunday
		const days = [
			{ date: '2024-01-01', calories: 1800, protein: 90, carbs: 180, fat: 60, fiber: 20 },
			{ date: '2024-01-06', calories: 2400, protein: 120, carbs: 240, fat: 80, fiber: 25 },
			{ date: '2024-01-07', calories: 2400, protein: 120, carbs: 240, fat: 80, fiber: 25 }
		];
		const result = computeWeekdayWeekendSplit(days);
		expect(result.weekday.days).toBe(1);
		expect(result.weekend.days).toBe(2);
		expect(result.weekday.avgCalories).toBe(1800);
		expect(result.weekend.avgCalories).toBe(2400);
	});

	test('returns zero stats when no weekday data', () => {
		const days = [
			{ date: '2024-01-06', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-07', calories: 2200, protein: 110, carbs: 220, fat: 75, fiber: 28 }
		];
		const result = computeWeekdayWeekendSplit(days);
		expect(result.weekday.days).toBe(0);
		expect(result.calorieDeltaPct).toBe(0);
	});

	test('sampleSize equals total days', () => {
		const days = [
			{ date: '2024-01-01', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-02', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 },
			{ date: '2024-01-06', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 }
		];
		const result = computeWeekdayWeekendSplit(days);
		expect(result.sampleSize).toBe(3);
	});
});
