import adapter from 'svelte-adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// Disable SvelteKit's built-in CSRF to allow cross-origin OAuth token exchange.
		// Manual CSRF origin checking is applied in hooks.server.ts for non-exempt routes.
		csrf: {
			trustedOrigins: ['*']
		}
	}
};

export default config;
