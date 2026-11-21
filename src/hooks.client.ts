import * as Sentry from '@sentry/sveltekit';
import type { HandleClientError } from '@sveltejs/kit/hooks';
import { PUBLIC_SENTRY_DSN, PUBLIC_SENTRY_ENVIRONMENT } from '$app/env/public';
import { sentryRelease } from '$lib/sentry-release';
import { installServerFailureReporting } from '$lib/utils/server-failure';
import { isClientNoise, scrubBreadcrumb } from '$lib/utils/sentry-scrub';

if (PUBLIC_SENTRY_DSN && PUBLIC_SENTRY_ENVIRONMENT) {
	Sentry.init({
		dsn: PUBLIC_SENTRY_DSN,
		environment: PUBLIC_SENTRY_ENVIRONMENT,
		release: sentryRelease(import.meta.env.VITE_APP_VERSION),
		tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,
		replaysSessionSampleRate: 0,
		replaysOnErrorSampleRate: 1.0,
		beforeSendLog: (log) => (import.meta.env.DEV ? log : null),
		beforeSend: (event, hint) =>
			isClientNoise(hint.originalException, navigator.onLine) ? null : event,
		beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
		integrations: [
			Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })
		]
	});
	installServerFailureReporting();
}

const sentryHandleError = Sentry.handleErrorWithSentry<HandleClientError>();

// A deploy replaces every hashed chunk under /_app/immutable, so a page that
// was served (or precached by the service worker) before it still references
// files that no longer exist. SvelteKit only recovers from that during
// client-side navigation via its version check; when the missing chunk is a
// node the initial hydration needs, the user gets the error page instead
// (Sentry BISSBILANZ-2Q). A full reload fetches the current HTML — once per
// URL, so a genuinely broken build can't loop.
const STALE_CHUNK_RELOAD_KEY = 'bissbilanz:stale-chunk-reload';

function isStaleChunkError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		/Failed to fetch dynamically imported module/i.test(message) ||
		/Importing a module script failed/i.test(message) ||
		/error loading dynamically imported module/i.test(message)
	);
}

function reloadOnceForStaleChunk(): boolean {
	try {
		const marker = `${location.pathname}${location.search}`;
		if (sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) === marker) return false;
		sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, marker);
	} catch (err) {
		Sentry.captureException(err, { level: 'warning' });
		return false;
	}
	location.reload();
	return true;
}

export const handleError: HandleClientError = (input) => {
	if (isStaleChunkError(input.error) && reloadOnceForStaleChunk()) {
		return { message: 'Updating…' };
	}
	// Expected errors and framework errors (a 502 thrown from a load function)
	// reach the error page, which reports server failures with a stable fingerprint.
	if (input.kind !== 'unknown') return;
	return sentryHandleError(input);
};
