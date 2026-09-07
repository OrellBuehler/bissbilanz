import { getContext, setContext } from 'svelte';
import type { InsightCardId } from './card-ids';

export type InsightPinContext = {
	readonly id: InsightCardId;
	readonly pinned: boolean;
	toggle: () => void;
};

const KEY = Symbol('insight-pin');

export const setInsightPinContext = (value: () => InsightPinContext) => setContext(KEY, value);

export const getInsightPinContext = (): (() => InsightPinContext) | undefined =>
	getContext<(() => InsightPinContext) | undefined>(KEY);
