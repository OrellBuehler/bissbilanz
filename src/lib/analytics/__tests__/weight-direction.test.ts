import { describe, it, expect } from 'vitest';
import { classifyWeightChangeTone, DIRECTION_TONE_TEXT_CLASS } from '../weight-direction';

describe('classifyWeightChangeTone', () => {
	it('is neutral without a resolvable goal direction', () => {
		expect(classifyWeightChangeTone(-2, null)).toBe('neutral');
		expect(classifyWeightChangeTone(2, null)).toBe('neutral');
		expect(classifyWeightChangeTone(0, null)).toBe('neutral');
	});

	it('is neutral once the user is within the goal tolerance (maintain)', () => {
		expect(classifyWeightChangeTone(-2, 'maintain')).toBe('neutral');
		expect(classifyWeightChangeTone(2, 'maintain')).toBe('neutral');
	});

	it('treats a decrease as favorable when the goal is to lose', () => {
		expect(classifyWeightChangeTone(-1, 'lose')).toBe('favorable');
		expect(classifyWeightChangeTone(1, 'lose')).toBe('unfavorable');
	});

	it('treats an increase as favorable when the goal is to gain', () => {
		expect(classifyWeightChangeTone(1, 'gain')).toBe('favorable');
		expect(classifyWeightChangeTone(-1, 'gain')).toBe('unfavorable');
	});

	it('is neutral for changes smaller than the epsilon, regardless of goal', () => {
		expect(classifyWeightChangeTone(0.01, 'lose')).toBe('neutral');
		expect(classifyWeightChangeTone(-0.01, 'gain')).toBe('neutral');
	});

	it('respects a custom epsilon', () => {
		expect(classifyWeightChangeTone(-0.2, 'lose', 0.5)).toBe('neutral');
		expect(classifyWeightChangeTone(-0.6, 'lose', 0.5)).toBe('favorable');
	});
});

describe('DIRECTION_TONE_TEXT_CLASS', () => {
	it('provides a class for every tone', () => {
		expect(DIRECTION_TONE_TEXT_CLASS.favorable).toContain('green');
		expect(DIRECTION_TONE_TEXT_CLASS.unfavorable).toContain('red');
		expect(DIRECTION_TONE_TEXT_CLASS.neutral).not.toMatch(/green|red/);
	});
});
