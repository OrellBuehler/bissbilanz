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
		}
	}
};

export default config;
