import * as Sentry from '@sentry/sveltekit';
import { browser } from '$app/environment';
import {
	CLIENT_PLATFORM_HEADER,
	CLIENT_VERSION_HEADER,
	UPDATE_REQUIRED_STATUS,
	parseVersion
} from '$lib/client-version';

const RELOAD_GUARD_KEY = 'bissbilanz:update-reload-at';
const RELOAD_GUARD_MS = 5 * 60 * 1000;

/** Sets the web build's platform + version headers; dev builds have no release version and send none. */
export function applyClientVersionHeaders(headers: Headers): Headers {
	const version = import.meta.env.VITE_APP_VERSION;
	if (typeof version === 'string' && parseVersion(version)) {
		headers.set(CLIENT_PLATFORM_HEADER, 'web');
		headers.set(CLIENT_VERSION_HEADER, version);
	}
	return headers;
}

export function isUpdateRequired(response: Response): boolean {
	return response.status === UPDATE_REQUIRED_STATUS;
}

/**
 * The server no longer accepts this bundle's version: fetch the new service
 * worker and reload, at most once per guard window so a server that keeps
 * answering 426 can't trap the tab in a reload loop.
 */
export async function reloadForUpdate(): Promise<void> {
	if (!browser) return;
	let last = 0;
	try {
		last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
		sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
	} catch (err) {
		Sentry.captureException(err, { level: 'warning', extra: { context: 'reloadForUpdate' } });
	}
	if (Date.now() - last < RELOAD_GUARD_MS) return;
	try {
		const registration = await navigator.serviceWorker?.getRegistration();
		await registration?.update();
	} catch (err) {
		Sentry.captureException(err, { level: 'warning', extra: { context: 'reloadForUpdate' } });
	}
	location.reload();
}
