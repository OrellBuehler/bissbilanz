import * as Sentry from '@sentry/sveltekit';
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

export const handleError = Sentry.handleErrorWithSentry();
