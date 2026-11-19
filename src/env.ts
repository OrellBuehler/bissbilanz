import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value ?? '';

// All four are read at runtime, so they can change without a rebuild. Unset
// means the feature is off, which every caller checks by truthiness.
export const variables = defineEnvVars({
	PUBLIC_SENTRY_DSN: { public: true, schema: optional },
	PUBLIC_SENTRY_ENVIRONMENT: { public: true, schema: optional },
	PUBLIC_STRIPE_BUY_BUTTON_ID: { public: true, schema: optional },
	PUBLIC_STRIPE_PUBLISHABLE_KEY: { public: true, schema: optional }
});
