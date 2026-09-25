import * as Sentry from '@sentry/sveltekit';
import { browser } from '$app/environment';

/**
 * Dismissed contextual hint cards, mirrored to localStorage. Every access is
 * wrapped in try/catch: private browsing / a blocked storage API must never
 * crash the page — worst case a hint that was already dismissed shows again.
 */
const STORAGE_KEY = 'bissbilanz_hints_v1';

function loadDismissed(): string[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
	} catch (err) {
		Sentry.captureException(err, { level: 'warning', extra: { context: 'hints.load' } });
		return [];
	}
}

let dismissed = $state<string[]>(loadDismissed());

function persist() {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));
	} catch (err) {
		Sentry.captureException(err, { level: 'warning', extra: { context: 'hints.persist' } });
	}
}

export function isDismissed(id: string): boolean {
	return dismissed.includes(id);
}

export function dismiss(id: string): void {
	if (dismissed.includes(id)) return;
	dismissed = [...dismissed, id];
	persist();
}

/** Re-shows every dismissed hint — "Show tips again" in Settings. */
export function resetAll(): void {
	dismissed = [];
	if (!browser) return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch (err) {
		Sentry.captureException(err, { level: 'warning', extra: { context: 'hints.reset' } });
	}
}
