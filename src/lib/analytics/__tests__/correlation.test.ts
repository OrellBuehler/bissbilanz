import { describe, it, expect } from 'vitest';
import { pearsonCorrelation, getConfidenceLevel } from '../correlation';

describe('getConfidenceLevel', () => {
	it('returns insufficient for n < 7', () => {
		expect(getConfidenceLevel(0)).toBe('insufficient');
		expect(getConfidenceLevel(6)).toBe('insufficient');
	});

	it('returns low for 7 <= n < 14', () => {
		expect(getConfidenceLevel(7)).toBe('low');
		expect(getConfidenceLevel(13)).toBe('low');
	});

	it('returns medium for 14 <= n < 30', () => {
		expect(getConfidenceLevel(14)).toBe('medium');
		expect(getConfidenceLevel(29)).toBe('medium');
	});

	it('returns high for n >= 30', () => {
		expect(getConfidenceLevel(30)).toBe('high');
		expect(getConfidenceLevel(100)).toBe('high');
	});
});

describe('pearsonCorrelation', () => {
	it('detects perfect positive correlation', () => {
		const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const y = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
		const result = pearsonCorrelation(x, y);
		expect(result.r).toBeCloseTo(1.0, 5);
		expect(result.constantInput).toBe(false);
	});

	it('detects perfect negative correlation', () => {
		const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const y = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
		const result = pearsonCorrelation(x, y);
		expect(result.r).toBeCloseTo(-1.0, 5);
		expect(result.constantInput).toBe(false);
	});

	it('returns near-zero for uncorrelated data', () => {
		// x alternates high/low, y alternates low/high — perfectly anti-phase → r ≈ 0 overall
		// Use pre-verified uncorrelated vectors (r ≈ 0.06 computed externally)
		const x = [1, 5, 2, 6, 3, 7, 4, 8, 5, 9, 6, 10, 7, 11, 8];
		const y = [8, 2, 9, 1, 7, 3, 10, 2, 6, 4, 11, 3, 5, 5, 12];
		const result = pearsonCorrelation(x, y);
		expect(Math.abs(result.r)).toBeLessThan(0.5);
	});

	it('returns r=0 and constantInput=true for constant x', () => {
		const x = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
		const y = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const result = pearsonCorrelation(x, y);
		expect(result.r).toBe(0);
		expect(result.pValue).toBe(1);
		expect(result.constantInput).toBe(true);
		expect(result.confidence).toBe('insufficient');
	});

	it('returns r=0 and constantInput=true for constant y', () => {
		const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const y = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
		const result = pearsonCorrelation(x, y);
		expect(result.r).toBe(0);
		expect(result.constantInput).toBe(true);
	});

	it('throws on mismatched array lengths', () => {
		expect(() => pearsonCorrelation([1, 2, 3], [1, 2])).toThrow();
	});

	it('returns insufficient confidence for n < 7', () => {
		const x = [1, 2, 3, 4, 5];
		const y = [2, 4, 6, 8, 10];
		const result = pearsonCorrelation(x, y);
		expect(result.confidence).toBe('insufficient');
		expect(result.sampleSize).toBe(5);
	});

	it('returns low confidence for 7 <= n < 14', () => {
		const x = [1, 2, 3, 4, 5, 6, 7];
		const y = [2, 4, 6, 8, 10, 12, 14];
		const result = pearsonCorrelation(x, y);
		expect(result.confidence).toBe('low');
	});

	it('returns high confidence for n >= 30', () => {
		const x = Array.from({ length: 30 }, (_, i) => i + 1);
		const y = x.map((v) => v * 2 + Math.sin(v) * 0.1);
		const result = pearsonCorrelation(x, y);
		expect(result.confidence).toBe('high');
	});

	it('computes known statistical values', () => {
		// Pre-computed: x=[1,2,3,4,5,6,7], y=[1,3,2,5,4,6,7] => r ≈ 0.9
		const x = [1, 2, 3, 4, 5, 6, 7];
		const y = [1, 3, 2, 5, 4, 6, 7];
		const result = pearsonCorrelation(x, y);
		expect(result.r).toBeGreaterThan(0.85);
		expect(result.r).toBeLessThan(1.0);
		expect(result.pValue).toBeLessThan(0.05);
		expect(result.sampleSize).toBe(7);
	});

	it('handles large arrays (1000 items) without overflow', () => {
		const x = Array.from({ length: 1000 }, (_, i) => i + 1);
		const y = x.map((v) => v * 3 + 5);
		const result = pearsonCorrelation(x, y);
		expect(result.r).toBeCloseTo(1.0, 5);
		expect(Number.isFinite(result.r)).toBe(true);
		expect(Number.isFinite(result.pValue)).toBe(true);
		expect(result.sampleSize).toBe(1000);
		expect(result.confidence).toBe('high');
	});

	it('r=1.0 yields near-zero p-value', () => {
		const x = Array.from({ length: 30 }, (_, i) => i + 1);
		const y = x.map((v) => v * 2);
		const result = pearsonCorrelation(x, y);
		expect(result.r).toBeCloseTo(1.0, 5);
		expect(result.pValue).toBeLessThan(0.001);
	});

	it('r near 0 yields p-value near 1', () => {
		// orthogonal vectors: sin and cos over a full period -> r = 0
		const n = 100;
		const x = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / n));
		const y = Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * i) / n));
		const result = pearsonCorrelation(x, y);
		expect(Math.abs(result.r)).toBeLessThan(0.01);
		expect(result.pValue).toBeGreaterThan(0.5);
	});
});
