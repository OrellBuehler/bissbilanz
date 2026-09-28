export type SwipeDirection = 'next' | 'previous';

export const SWIPE_THRESHOLD_PX = 60;

/**
 * Classify a finished pointer gesture. Right-to-left (negative dx) is "next".
 * A mostly-vertical drag is a scroll, never a swipe.
 */
export const resolveSwipe = (
	dx: number,
	dy: number,
	threshold = SWIPE_THRESHOLD_PX
): SwipeDirection | null => {
	if (Math.abs(dx) < threshold) return null;
	if (Math.abs(dx) < Math.abs(dy) * 1.5) return null;
	return dx < 0 ? 'next' : 'previous';
};
