import * as Sentry from '@sentry/sveltekit';
import { PUBLIC_SENTRY_DSN } from '$env/static/public';

if (PUBLIC_SENTRY_DSN) {
	Sentry.init({
		dsn: PUBLIC_SENTRY_DSN,
		tracesSampleRate: 1.0,
		replaysSessionSampleRate: 0,
		replaysOnErrorSampleRate: 1.0,
		integrations: [Sentry.replayIntegration()]
	});
}

export const handleError = Sentry.handleErrorWithSentry();
