import adapter from 'svelte-adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			precompress: true
		}),
		serviceWorker: {
			register: false
		},
		// Disable SvelteKit's built-in CSRF to allow cross-origin MCP/OAuth requests.
		// MCP clients (Claude, OpenAI, etc.) connect from unpredictable origins.
		// Manual CSRF origin checking is applied in hooks.server.ts for non-exempt routes.
		csrf: {
			trustedOrigins: ['*']
		},
		// script-src has no 'unsafe-inline' — SvelteKit adds a nonce/hash for its own
		// inline scripts (mode: 'auto'). Other security headers stay in security.ts.
		csp: {
			mode: 'auto',
			directives: {
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
				'script-src': [
					'self',
					'wasm-unsafe-eval',
					'https://a.orellbuehler.ch',
					'https://js.stripe.com'
				],
				// js.stripe.com hosts the button itself, checkout.stripe.com the payment
				// overlay, hooks.stripe.com the 3-D Secure challenge.
				'frame-src': [
					'https://js.stripe.com',
					'https://checkout.stripe.com',
					'https://hooks.stripe.com'
				],
				'connect-src': [
					'self',
					'https://a.orellbuehler.ch',
					'https://*.ingest.de.sentry.io',
					'https://api.stripe.com'
				],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;
