import { INSIGHT_CARD_IDS, MAX_PINNED_INSIGHTS, isInsightCardId } from './card-ids';
import type { InsightCardId } from './card-ids';

export { INSIGHT_CARD_IDS, MAX_PINNED_INSIGHTS };
export type { InsightCardId };

export type PinAction =
	| { type: 'pin'; id: string }
	| { type: 'unpin'; id: string }
	| { type: 'toggle'; id: string }
	| { type: 'replace'; ids: readonly unknown[] };

export type PinRejection = 'unknown-id' | 'limit-reached' | 'already-pinned' | 'not-pinned';

export type PinState = {
	pins: InsightCardId[];
	changed: boolean;
	rejected?: PinRejection;
};

/**
 * Drops unknown ids, de-duplicates and caps the list. Preferences are
 * server-backed and older clients may hold ids this build no longer knows.
 */
export const normalizePins = (raw: readonly unknown[] | null | undefined): InsightCardId[] => {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<InsightCardId>();
	for (const value of raw) {
		if (!isInsightCardId(value) || seen.has(value)) continue;
		seen.add(value);
		if (seen.size >= MAX_PINNED_INSIGHTS) break;
	}
	return [...seen];
};

export const reducePins = (current: readonly unknown[], action: PinAction): PinState => {
	const pins = normalizePins(current);

	if (action.type === 'replace') {
		const next = normalizePins(action.ids);
		const changed = next.length !== pins.length || next.some((id, i) => id !== pins[i]);
		return { pins: next, changed };
	}

	if (!isInsightCardId(action.id)) {
		return { pins, changed: false, rejected: 'unknown-id' };
	}

	const isPinned = pins.includes(action.id);
	const effect = action.type === 'toggle' ? (isPinned ? 'unpin' : 'pin') : action.type;

	if (effect === 'unpin') {
		if (!isPinned) return { pins, changed: false, rejected: 'not-pinned' };
		return { pins: pins.filter((id) => id !== action.id), changed: true };
	}

	if (isPinned) return { pins, changed: false, rejected: 'already-pinned' };
	if (pins.length >= MAX_PINNED_INSIGHTS) {
		return { pins, changed: false, rejected: 'limit-reached' };
	}
	return { pins: [...pins, action.id], changed: true };
};
