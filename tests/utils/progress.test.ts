import { describe, expect, test } from 'vitest';
import { progressColor } from '../../src/lib/utils/progress';

describe('progressColor', () => {
	test('returns green within 10% of goal', () => {
		expect(progressColor(95, 100)).toBe('text-emerald-600');
	});

	test('returns red when over goal', () => {
		expect(progressColor(120, 100)).toBe('text-red-600');
	});
});
