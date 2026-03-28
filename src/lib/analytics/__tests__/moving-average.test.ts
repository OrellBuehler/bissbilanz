import { describe, it, expect } from 'vitest';
import { movingAverage } from '../moving-average';

describe('movingAverage', () => {
	it('computes 3-day average with known values', () => {
		const series = [1, 2, 3, 4, 5, 6, 7];
		const result = movingAverage(series, 3);
		expect(result[0]).toBeNull();
		expect(result[1]).toBeNull();
		expect(result[2]).toBeCloseTo(2.0);
		expect(result[3]).toBeCloseTo(3.0);
		expect(result[4]).toBeCloseTo(4.0);
		expect(result[5]).toBeCloseTo(5.0);
		expect(result[6]).toBeCloseTo(6.0);
	});

	it('computes 7-day moving average', () => {
		const series = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const result = movingAverage(series, 7);
		expect(result.slice(0, 6).every((v) => v === null)).toBe(true);
		expect(result[6]).toBeCloseTo(4.0);
		expect(result[9]).toBeCloseTo(7.0);
	});

	it('handles null values by skipping them in average', () => {
		// series [2, null, 4, null, 6] with window=3:
		// index 2: [2, null, 4] -> avg(2,4) = 3.0
		// index 3: [null, 4, null] -> avg(4) = 4.0
		// index 4: [4, null, 6] -> avg(4,6) = 5.0
		const series = [2, null, 4, null, 6];
		const result = movingAverage(series, 3);
		expect(result[0]).toBeNull();
		expect(result[1]).toBeNull();
		expect(result[2]).toBeCloseTo(3.0);
		expect(result[3]).toBeCloseTo(4.0);
		expect(result[4]).toBeCloseTo(5.0);
	});

	it('returns null when all values in window are null', () => {
		const series = [null, null, null, 4, 5];
		const result = movingAverage(series, 3);
		expect(result[2]).toBeNull();
		expect(result[3]).toBeCloseTo(4.0);
		expect(result[4]).toBeCloseTo(4.5);
	});

	it('returns all nulls when window larger than series', () => {
		const series = [1, 2, 3];
		const result = movingAverage(series, 5);
		expect(result.every((v) => v === null)).toBe(true);
	});

	it('window of 1 returns original values with nulls in place', () => {
		const series = [1, null, 3, null, 5];
		const result = movingAverage(series, 1);
		expect(result[0]).toBe(1);
		expect(result[1]).toBeNull();
		expect(result[2]).toBe(3);
		expect(result[3]).toBeNull();
		expect(result[4]).toBe(5);
	});

	it('returns array of same length as input', () => {
		const series = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const result = movingAverage(series, 4);
		expect(result).toHaveLength(series.length);
	});

	it('handles empty array', () => {
		const result = movingAverage([], 3);
		expect(result).toHaveLength(0);
	});
});
