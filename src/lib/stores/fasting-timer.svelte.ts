import { browser } from '$app/environment';
import { clampStart, clampTargetHours } from '$lib/utils/fasting';

/**
 * The running fast. Device-local by design: like the mobile apps, a fast in
 * progress is never uploaded — only the finished session is posted to
 * /api/fasts, using the id minted here when the fast started so a retried
 * upload lands on the same row.
 */
export type RunningFast = {
	id: string;
	startedAt: string;
	targetHours: number;
};

/** Same key shape the mobile apps use for their local store. */
const STORAGE_KEY = 'fasting_session_v1';

let running = $state<RunningFast | null>(null);

const isRunningFast = (value: unknown): value is RunningFast => {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.id === 'string' &&
		typeof v.startedAt === 'string' &&
		!Number.isNaN(Date.parse(v.startedAt)) &&
		typeof v.targetHours === 'number' &&
		Number.isFinite(v.targetHours)
	);
};

const persist = () => {
	if (!browser) return;
	try {
		if (running) localStorage.setItem(STORAGE_KEY, JSON.stringify(running));
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Private mode / quota — the in-memory timer still works for this session.
	}
};

/** Reloads the running fast from storage. Safe to call on every page visit. */
export const loadRunningFast = (): RunningFast | null => {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : null;
		running = isRunningFast(parsed) ? parsed : null;
	} catch {
		running = null;
	}
	return running;
};

export const getRunningFast = (): RunningFast | null => running;

export const startFast = (targetHours: number, startedAtMs = Date.now()): RunningFast | null => {
	if (running) return running;
	running = {
		id: crypto.randomUUID(),
		startedAt: new Date(clampStart(startedAtMs, Date.now())).toISOString(),
		targetHours: clampTargetHours(targetHours)
	};
	persist();
	return running;
};

export const adjustStart = (startedAtMs: number): void => {
	if (!running) return;
	running = { ...running, startedAt: new Date(clampStart(startedAtMs, Date.now())).toISOString() };
	persist();
};

export const changeTarget = (targetHours: number): void => {
	if (!running) return;
	running = { ...running, targetHours: clampTargetHours(targetHours) };
	persist();
};

/** Ends the fast and hands back the completed session for upload. */
export const endFast = (
	endedAtMs = Date.now()
): { id: string; startedAt: string; endedAt: string; targetHours: number } | null => {
	const current = running;
	if (!current) return null;
	const startedMs = Date.parse(current.startedAt);
	// A one-second floor keeps the session inside the server's endedAt > startedAt
	// constraint even if the clock jumped backwards mid-fast.
	const endedAt = new Date(Math.max(endedAtMs, startedMs + 1000)).toISOString();
	running = null;
	persist();
	return { ...current, endedAt };
};

/** Drops the fast entirely — no history row, nothing uploaded. */
export const discardFast = (): void => {
	running = null;
	persist();
};
