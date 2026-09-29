import { describe, expect, test } from 'vitest';
import { resolveSwipe, SWIPE_THRESHOLD_PX } from '../../src/lib/utils/swipe';

describe('resolveSwipe', () => {
	test('right-to-left is next, left-to-right is previous', () => {
		expect(resolveSwipe(-120, 5)).toBe('next');
		expect(resolveSwipe(120, -5)).toBe('previous');
	});

	test('short drags are ignored', () => {
		expect(resolveSwipe(-(SWIPE_THRESHOLD_PX - 1), 0)).toBeNull();
		expect(resolveSwipe(SWIPE_THRESHOLD_PX - 1, 0)).toBeNull();
		expect(resolveSwipe(-SWIPE_THRESHOLD_PX, 0)).toBe('next');
	});

	test('mostly vertical drags are scrolls, not swipes', () => {
		expect(resolveSwipe(-80, 200)).toBeNull();
		expect(resolveSwipe(80, -90)).toBeNull();
	});

	test('a slightly diagonal swipe still counts', () => {
		expect(resolveSwipe(-100, 40)).toBe('next');
	});
});
