import { describe, it, expect } from 'vitest';
import {
	convertQuantityForMacros,
	isSameUnitDimension,
	unitConversionFactor,
	unitDimension
} from './units';

describe('unitDimension', () => {
	it('classifies mass units', () => {
		expect(unitDimension('g')).toBe('mass');
		expect(unitDimension('kg')).toBe('mass');
		expect(unitDimension('oz')).toBe('mass');
		expect(unitDimension('lb')).toBe('mass');
	});

	it('classifies volume units', () => {
		expect(unitDimension('ml')).toBe('volume');
		expect(unitDimension('cl')).toBe('volume');
		expect(unitDimension('l')).toBe('volume');
		expect(unitDimension('fl_oz')).toBe('volume');
		expect(unitDimension('cup')).toBe('volume');
		expect(unitDimension('tbsp')).toBe('volume');
		expect(unitDimension('tsp')).toBe('volume');
	});
});

describe('isSameUnitDimension', () => {
	it('is true within a dimension', () => {
		expect(isSameUnitDimension('g', 'kg')).toBe(true);
		expect(isSameUnitDimension('ml', 'cup')).toBe(true);
	});

	it('is false across dimensions', () => {
		expect(isSameUnitDimension('g', 'ml')).toBe(false);
		expect(isSameUnitDimension('cup', 'lb')).toBe(false);
	});
});

describe('unitConversionFactor', () => {
	// Golden cases — every platform (TS, Kotlin, Swift) must agree on these.
	it('g <-> kg', () => {
		expect(unitConversionFactor('kg', 'g')).toBeCloseTo(1000, 9);
		expect(unitConversionFactor('g', 'kg')).toBeCloseTo(0.001, 9);
	});

	it('oz -> g uses the exact factor', () => {
		expect(unitConversionFactor('oz', 'g')).toBeCloseTo(28.349523125, 9);
	});

	it('lb -> g uses the exact factor', () => {
		expect(unitConversionFactor('lb', 'g')).toBeCloseTo(453.59237, 9);
	});

	it('fl_oz -> ml uses the exact factor', () => {
		expect(unitConversionFactor('fl_oz', 'ml')).toBeCloseTo(29.5735295625, 9);
	});

	it('cup/tbsp/tsp -> ml match the codebase-wide rounded factors', () => {
		expect(unitConversionFactor('cup', 'ml')).toBeCloseTo(240, 9);
		expect(unitConversionFactor('tbsp', 'ml')).toBeCloseTo(15, 9);
		expect(unitConversionFactor('tsp', 'ml')).toBeCloseTo(5, 9);
	});

	it('is null across dimensions', () => {
		expect(unitConversionFactor('g', 'ml')).toBeNull();
		expect(unitConversionFactor('cup', 'oz')).toBeNull();
	});

	it('is 1 for identical units', () => {
		expect(unitConversionFactor('tbsp', 'tbsp')).toBeCloseTo(1, 9);
	});
});

describe('convertQuantityForMacros', () => {
	it('converts 2 tbsp into ml (30 ml) for a food measured in ml', () => {
		expect(convertQuantityForMacros(2, 'tbsp', 'ml')).toBeCloseTo(30, 9);
	});

	it('converts 1 lb into g (453.59237 g) for a food measured in g', () => {
		expect(convertQuantityForMacros(1, 'lb', 'g')).toBeCloseTo(453.59237, 9);
	});

	it('is a no-op when units already match', () => {
		expect(convertQuantityForMacros(150, 'g', 'g')).toBe(150);
	});

	it('falls back to the raw quantity for legacy cross-dimension rows', () => {
		expect(convertQuantityForMacros(2, 'cup', 'g')).toBe(2);
		expect(convertQuantityForMacros(100, 'g', 'ml')).toBe(100);
	});
});
