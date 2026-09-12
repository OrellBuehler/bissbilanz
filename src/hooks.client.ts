import * as Sentry from '@sentry/sveltekit';
import type { HandleClientError } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';

if (env.PUBLIC_SENTRY_DSN && env.PUBLIC_SENTRY_ENVIRONMENT) {
	Sentry.init({
		dsn: env.PUBLIC_SENTRY_DSN,
		environment: env.PUBLIC_SENTRY_ENVIRONMENT,
		tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,
		replaysSessionSampleRate: 0,
		replaysOnErrorSampleRate: 1.0,
		enableLogs: import.meta.env.DEV,
		integrations: [
			Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })
		]
	});
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
	} catch {
		return false;
	}
	location.reload();
	return true;
}

export const handleError: HandleClientError = (input) => {
	if (isStaleChunkError(input.error) && reloadOnceForStaleChunk()) {
		return { message: 'Updating…' };
	}
	return sentryHandleError(input);
};
