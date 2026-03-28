import { describe, expect, test } from 'vitest';
import { getAdditiveInfo, getRiskColor } from '../../src/lib/utils/additives';

describe('getAdditiveInfo', () => {
	test('returns info for known low-risk additive e100', () => {
		const info = getAdditiveInfo('en:e100');
		expect(info).toEqual({ name: 'Curcumin', risk: 'low' });
	});

	test('returns info for known low-risk additive e200', () => {
		const info = getAdditiveInfo('en:e200');
		expect(info).toEqual({ name: 'Sorbic Acid', risk: 'low' });
	});

	test('returns info for known high-risk additive e102', () => {
		const info = getAdditiveInfo('en:e102');
		expect(info).toEqual({ name: 'Tartrazine', risk: 'high' });
	});

	test('returns info for known moderate-risk additive e210', () => {
		const info = getAdditiveInfo('en:e210');
		expect(info).toEqual({ name: 'Benzoic Acid', risk: 'moderate' });
	});

	test('returns info for additive with letter suffix e150a', () => {
		const info = getAdditiveInfo('en:e150a');
		expect(info).toEqual({ name: 'Caramel Color', risk: 'low' });
	});

	test('returns info for additive with letter suffix e472e', () => {
		const info = getAdditiveInfo('en:e472e');
		expect(info).toEqual({ name: 'DATEM', risk: 'low' });
	});

	test('is case-insensitive for tag lookup', () => {
		expect(getAdditiveInfo('EN:E100')).toEqual({ name: 'Curcumin', risk: 'low' });
		expect(getAdditiveInfo('En:E200')).toEqual({ name: 'Sorbic Acid', risk: 'low' });
		expect(getAdditiveInfo('en:E951')).toEqual({ name: 'Aspartame', risk: 'high' });
	});

	test('returns moderate risk for unknown additive', () => {
		const info = getAdditiveInfo('en:e999');
		expect(info.risk).toBe('moderate');
	});

	test('extracts uppercase E-number name for unknown additive', () => {
		const info = getAdditiveInfo('en:e999');
		expect(info.name).toBe('E999');
	});

	test('extracts uppercase E-number with letter suffix for unknown additive', () => {
		const info = getAdditiveInfo('en:e999a');
		expect(info.name).toBe('E999A');
	});

	test('returns moderate risk for empty string', () => {
		const info = getAdditiveInfo('');
		expect(info.risk).toBe('moderate');
	});

	test('returns the raw tag as name when no E-number pattern present', () => {
		const info = getAdditiveInfo('unknown-additive');
		expect(info.name).toBe('unknown-additive');
		expect(info.risk).toBe('moderate');
	});

	test('handles tag without en: prefix for unknown additive', () => {
		const info = getAdditiveInfo('e100');
		expect(info.risk).toBe('moderate');
		expect(info.name).toBe('E100');
	});

	test('does not match known additive without en: prefix', () => {
		const withPrefix = getAdditiveInfo('en:e100');
		const withoutPrefix = getAdditiveInfo('e100');
		expect(withoutPrefix.name).not.toBe(withPrefix.name);
	});
});

describe('getRiskColor', () => {
	test('returns green classes for low risk', () => {
		const color = getRiskColor('low');
		expect(color).toBe('text-green-600 bg-green-50 border-green-200');
	});

	test('returns amber classes for moderate risk', () => {
		const color = getRiskColor('moderate');
		expect(color).toBe('text-amber-600 bg-amber-50 border-amber-200');
	});

	test('returns red classes for high risk', () => {
		const color = getRiskColor('high');
		expect(color).toBe('text-red-600 bg-red-50 border-red-200');
	});
});
