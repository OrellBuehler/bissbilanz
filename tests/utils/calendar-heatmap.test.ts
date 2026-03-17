import { describe, expect, test } from 'vitest';
import { heatmapStatus } from '../../src/lib/utils/insights';

describe('heatmapStatus', () => {
	test('returns "none" when no entries', () => {
		expect(heatmapStatus(0, false, 2000)).toBe('none');
	});

	test('returns "no-goal" when hasEntries but calorieGoal is 0', () => {
		expect(heatmapStatus(1500, true, 0)).toBe('no-goal');
	});

	test('returns "on-target" when within ±10% of goal', () => {
		expect(heatmapStatus(2000, true, 2000)).toBe('on-target');
		expect(heatmapStatus(1800, true, 2000)).toBe('on-target');
		expect(heatmapStatus(2200, true, 2000)).toBe('on-target');
	});

	test('exactly at 90% boundary is on-target', () => {
		expect(heatmapStatus(1800, true, 2000)).toBe('on-target');
	});

	test('exactly at 110% boundary is on-target', () => {
		expect(heatmapStatus(2200, true, 2000)).toBe('on-target');
	});

	test('returns "over" when ratio > 1.1 and <= 1.3', () => {
		expect(heatmapStatus(2400, true, 2000)).toBe('over');
	});

	test('returns "over-high" when ratio > 1.3', () => {
		expect(heatmapStatus(2700, true, 2000)).toBe('over-high');
	});

	test('returns "under" when ratio < 0.9 and >= 0.7', () => {
		expect(heatmapStatus(1500, true, 2000)).toBe('under');
	});

	test('returns "under-high" when ratio < 0.7', () => {
		expect(heatmapStatus(1300, true, 2000)).toBe('under-high');
	});

	test('zero calories with entries returns "under-high"', () => {
		expect(heatmapStatus(0, true, 2000)).toBe('under-high');
	});

	test('boundary at 70% is "under"', () => {
		expect(heatmapStatus(1400, true, 2000)).toBe('under');
	});

	test('just below 70% is "under-high"', () => {
		expect(heatmapStatus(1399, true, 2000)).toBe('under-high');
	});

	test('boundary at 130% is "over"', () => {
		expect(heatmapStatus(2600, true, 2000)).toBe('over');
	});

	test('just above 130% is "over-high"', () => {
		expect(heatmapStatus(2601, true, 2000)).toBe('over-high');
	});
});
