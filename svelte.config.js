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
					'https://avatar.storage.infomaniak.com'
				],
				'style-src': ['self', 'unsafe-inline'],
				'script-src': ['self', 'wasm-unsafe-eval', 'https://a.orellbuehler.ch'],
				'connect-src': ['self', 'https://a.orellbuehler.ch', 'https://*.ingest.de.sentry.io'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;
