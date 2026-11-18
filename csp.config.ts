import type { Config } from '@sveltejs/kit/vite';

type CspDirectives = NonNullable<NonNullable<Config['csp']>['directives']>;

// script-src has no 'unsafe-inline': SvelteKit adds a nonce or hash for its own
// inline scripts. Kept apart from vite.config.ts so tests can read the policy.
export const cspDirectives: CspDirectives = {
	'default-src': ['self'],
	'img-src': [
		'self',
		'data:',
		'https://images.openfoodfacts.net',
		'https://images.openfoodfacts.org',
		'https://avatar.storage.infomaniak.com',
		'https://lh3.googleusercontent.com'
	],
	'style-src': ['self', 'unsafe-inline'],
	// js.stripe.com serves the embedded buy button; the checkout it opens
	// runs in a Stripe-hosted iframe, which default-src 'self' would block.
	'script-src': ['self', 'wasm-unsafe-eval', 'https://a.orellbuehler.ch', 'https://js.stripe.com'],
	// js.stripe.com hosts the button itself, checkout.stripe.com the payment
	// overlay, hooks.stripe.com the 3-D Secure challenge.
	'frame-src': ['https://js.stripe.com', 'https://checkout.stripe.com', 'https://hooks.stripe.com'],
	'connect-src': [
		'self',
		'https://a.orellbuehler.ch',
		'https://*.ingest.de.sentry.io',
		'https://api.stripe.com'
	],
	// The nutrition-label OCR runs in a same-origin web worker; blob: covers
	// Tesseract's blob-URL worker fallback.
	'worker-src': ['self', 'blob:'],
	'base-uri': ['self'],
	'form-action': ['self'],
	'frame-ancestors': ['none']
};
