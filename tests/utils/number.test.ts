import { describe, expect, test } from 'vitest';
import { round2 } from '../../src/lib/utils/number';

describe('round2', () => {
	test('rounds positive numbers to 2 decimal places', () => {
		expect(round2(1.234)).toBe(1.23);
		expect(round2(1.235)).toBe(1.24);
		expect(round2(1.999)).toBe(2);
		expect(round2(3.456)).toBe(3.46);
	});

	test('rounds negative numbers to 2 decimal places', () => {
		expect(round2(-1.234)).toBe(-1.23);
		expect(round2(-1.236)).toBe(-1.24);
		expect(round2(-3.456)).toBe(-3.46);
	});

	test('returns 0 for zero', () => {
		expect(round2(0)).toBe(0);
	});

	test('returns already-rounded values unchanged', () => {
		expect(round2(1.5)).toBe(1.5);
		expect(round2(2.25)).toBe(2.25);
		expect(round2(10.99)).toBe(10.99);
	});

	test('handles floating point precision edge cases', () => {
		expect(round2(0.1 + 0.2)).toBe(0.3);
		expect(round2(0.1 + 0.7)).toBe(0.8);
		expect(round2(1.005)).toBe(1);
	});

	test('handles very large numbers', () => {
		expect(round2(999999.999)).toBe(1000000);
		expect(round2(1234567.891)).toBe(1234567.89);
	});

	test('handles very small numbers', () => {
		expect(round2(0.001)).toBe(0);
		expect(round2(0.004)).toBe(0);
		expect(round2(0.005)).toBe(0.01);
		expect(round2(0.009)).toBe(0.01);
	});

	test('returns whole numbers unchanged', () => {
		expect(round2(1)).toBe(1);
		expect(round2(42)).toBe(42);
		expect(round2(100)).toBe(100);
	});
});
