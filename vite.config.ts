import path from 'node:path';
import adapter from '@sveltejs/adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { cspDirectives } from './csp.config.ts';
import { ocrAssetBase, ocrAssets } from './scripts/ocr-assets.ts';

// Self-hosted Tesseract assets for the nutrition-label scanner, staged out of
// node_modules by the plugin below and addressed by version so a bumped core is
// never served out of a stale runtime cache.
const ocrBase = ocrAssetBase();

export default defineConfig({
	server: {
		port: 4000
	},
	define: {
		__OCR_ASSET_BASE__: JSON.stringify(ocrBase)
	},
	resolve: {
		// SvelteKit 3 no longer generates $lib, and its own `alias` option is
		// deprecated in favour of #lib subpath imports. A plain Vite alias keeps
		// the existing `$lib/...` imports working without a codebase-wide rename;
		// tsconfig.json declares the matching paths for the type checker and Bun.
		alias: { $lib: path.resolve(import.meta.dirname, 'src/lib') }
	},
	ssr: {
		// CSS-only package (a `style` export and nothing else): the server build's
		// externalisation check resolves it like Node would and fails.
		noExternal: ['tw-animate-css']
	},
	plugins: [
		ocrAssets(),
		sentrySvelteKit({ autoUploadSourceMaps: false, autoInstrument: false }),
		tailwindcss(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['url', 'cookie', 'baseLocale']
		}),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter({ precompress: true }),
			serviceWorker: { register: false },
			// Poll for a newer deploy so `updated.current` flips while a PWA tab
			// sits open for days; the root layout then hard-navigates instead of
			// importing chunks that no longer exist (see hooks.client.ts).
			version: { pollInterval: 5 * 60 * 1000 },
			// Disable SvelteKit's built-in CSRF to allow cross-origin MCP/OAuth requests.
			// MCP clients (Claude, OpenAI, etc.) connect from unpredictable origins.
			// Manual CSRF origin checking is applied in hooks.server.ts for non-exempt routes.
			csrf: { trustedOrigins: ['*'] },
			// script-src has no 'unsafe-inline' — SvelteKit adds a nonce/hash for its own
			// inline scripts (mode: 'auto'). Other security headers stay in security.ts.
			csp: {
				mode: 'auto',
				directives: cspDirectives
			}
		})
	]
});
