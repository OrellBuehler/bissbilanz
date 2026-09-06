import { describe, it, expect } from 'vitest';
import {
	computeGoalProjection,
	computeWeightStats,
	daysBetween,
	ratePerWeek
} from '../weight-goal';

const series = (start: string, weights: number[]) =>
	weights.map((weightKg, i) => {
		const d = new Date(start + 'T00:00:00Z');
		d.setUTCDate(d.getUTCDate() + i);
		return { entryDate: d.toISOString().slice(0, 10), weightKg };
	});

describe('ratePerWeek', () => {
	it('returns null with fewer than two distinct days', () => {
		expect(ratePerWeek([])).toBeNull();
		expect(ratePerWeek([{ entryDate: '2026-01-01', weightKg: 80 }])).toBeNull();
		expect(
			ratePerWeek([
				{ entryDate: '2026-01-01', weightKg: 80 },
				{ entryDate: '2026-01-01', weightKg: 81 }
			])
		).toBeNull();
	});

	it('recovers a known linear slope', () => {
		const points = series('2026-01-01', [80, 79.9, 79.8, 79.7, 79.6, 79.5, 79.4, 79.3]);
		expect(ratePerWeek(points)).toBeCloseTo(-0.7, 6);
	});

	it('regresses on calendar days, not row index', () => {
		const points = [
			{ entryDate: '2026-01-01', weightKg: 80 },
			{ entryDate: '2026-01-15', weightKg: 78 }
		];
		expect(ratePerWeek(points)).toBeCloseTo(-1, 6);
	});

	it('ignores input order', () => {
		const points = series('2026-01-01', [80, 79.5, 79]);
		expect(ratePerWeek([...points].reverse())).toBeCloseTo(ratePerWeek(points)!, 10);
	});
});

describe('computeWeightStats', () => {
	it('returns nulls for an empty series', () => {
		expect(computeWeightStats([])).toEqual({
			latestKg: null,
			latestDate: null,
			average7Kg: null,
			change30Kg: null,
			ratePerWeekKg: null
		});
	});

	it('averages only the trailing 7 days', () => {
		const points = [
			{ entryDate: '2026-01-01', weightKg: 100 },
			...series('2026-02-01', [80, 81, 82, 83, 84, 85, 86])
		];
		const stats = computeWeightStats(points);
		expect(stats.latestKg).toBe(86);
		expect(stats.latestDate).toBe('2026-02-07');
		expect(stats.average7Kg).toBeCloseTo(83, 6);
	});

	it('measures the 30-day change against the oldest entry inside the window', () => {
		const points = [
			{ entryDate: '2025-11-01', weightKg: 95 },
			{ entryDate: '2026-01-05', weightKg: 82 },
			{ entryDate: '2026-02-01', weightKg: 80 }
		];
		expect(computeWeightStats(points).change30Kg).toBeCloseTo(-2, 6);
	});

	it('has no 30-day change with a single entry', () => {
		expect(computeWeightStats([{ entryDate: '2026-02-01', weightKg: 80 }]).change30Kg).toBeNull();
	});
});

describe('computeGoalProjection', () => {
	const base = { asOf: '2026-01-01', ratePerWeekKg: -0.5 };

	it('returns null without a current weight or a target', () => {
		expect(
			computeGoalProjection({ ...base, currentWeightKg: null, targetWeightKg: 75 })
		).toBeNull();
		expect(
			computeGoalProjection({ ...base, currentWeightKg: 80, targetWeightKg: null })
		).toBeNull();
	});

	it('reports the target as reached inside the tolerance band', () => {
		const p = computeGoalProjection({ ...base, currentWeightKg: 75.1, targetWeightKg: 75 })!;
		expect(p.reached).toBe(true);
		expect(p.status).toBe('reached');
		expect(p.direction).toBe('maintain');
		expect(p.projectedDate).toBeNull();
	});

	it('projects the date the target is hit at the current rate', () => {
		const p = computeGoalProjection({ ...base, currentWeightKg: 80, targetWeightKg: 75 })!;
		expect(p.remainingKg).toBeCloseTo(-5, 6);
		expect(p.direction).toBe('lose');
		expect(p.daysToTarget).toBe(70);
		expect(p.projectedDate).toBe('2026-03-12');
		expect(p.status).toBe('on_track');
	});

	it('is on track when the projection lands before the target date', () => {
		const p = computeGoalProjection({
			...base,
			currentWeightKg: 80,
			targetWeightKg: 75,
			targetDate: '2026-06-01'
		})!;
		expect(p.status).toBe('on_track');
		expect(p.daysUntilTargetDate).toBe(151);
		expect(p.requiredRatePerWeekKg).toBeCloseTo((-5 / 151) * 7, 6);
	});

	it('is behind when the projection lands after the target date', () => {
		const p = computeGoalProjection({
			...base,
			currentWeightKg: 80,
			targetWeightKg: 75,
			targetDate: '2026-02-01'
		})!;
		expect(p.status).toBe('behind');
	});

	it('is stalled when the trend runs the wrong way and no date is set', () => {
		const p = computeGoalProjection({
			asOf: '2026-01-01',
			currentWeightKg: 80,
			targetWeightKg: 75,
			ratePerWeekKg: 0.3
		})!;
		expect(p.status).toBe('stalled');
		expect(p.projectedDate).toBeNull();
	});

	it('is behind when the trend runs the wrong way and a date is set', () => {
		const p = computeGoalProjection({
			asOf: '2026-01-01',
			currentWeightKg: 80,
			targetWeightKg: 75,
			targetDate: '2026-06-01',
			ratePerWeekKg: 0
		})!;
		expect(p.status).toBe('behind');
	});

	it('is unknown without a trend', () => {
		const p = computeGoalProjection({
			asOf: '2026-01-01',
			currentWeightKg: 80,
			targetWeightKg: 75,
			ratePerWeekKg: null
		})!;
		expect(p.status).toBe('unknown');
		expect(p.projectedDate).toBeNull();
	});

	it('handles gaining toward a higher target', () => {
		const p = computeGoalProjection({
			asOf: '2026-01-01',
			currentWeightKg: 60,
			targetWeightKg: 63.5,
			ratePerWeekKg: 0.25
		})!;
		expect(p.direction).toBe('gain');
		expect(p.remainingKg).toBeCloseTo(3.5, 6);
		expect(p.daysToTarget).toBe(98);
		expect(p.status).toBe('on_track');
	});

	it('drops the required rate once the target date has passed', () => {
		const p = computeGoalProjection({
			asOf: '2026-06-02',
			currentWeightKg: 80,
			targetWeightKg: 75,
			targetDate: '2026-06-01',
			ratePerWeekKg: -0.5
		})!;
		expect(p.daysUntilTargetDate).toBe(-1);
		expect(p.requiredRatePerWeekKg).toBeNull();
		expect(p.status).toBe('behind');
	});
});

describe('daysBetween', () => {
	it('counts calendar days across a month boundary', () => {
		expect(daysBetween('2026-01-30', '2026-02-02')).toBe(3);
		expect(daysBetween('2026-02-02', '2026-01-30')).toBe(-3);
	});
});
