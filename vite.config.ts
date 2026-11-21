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
import { sentryRelease } from './src/lib/sentry-release.ts';

// Self-hosted Tesseract assets for the nutrition-label scanner, staged out of
// node_modules by the plugin below and addressed by version so a bumped core is
// never served out of a stale runtime cache.
const ocrBase = ocrAssetBase();

// Source maps go to Sentry only for a release build that has the token (the
// Dockerfile passes it as a build secret); local, PR and token-less builds
// skip the upload and keep generating no maps.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const release = sentryRelease(process.env.VITE_APP_VERSION);

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
		// tw-animate-css is CSS-only (a `style` export and nothing else): the server
		// build's externalisation check resolves it like Node would and fails.
		// postgres must stay bundled: Sentry instruments it at bundle time, but
		// adapter-bun externalises every package listed in `dependencies`.
		noExternal: ['tw-animate-css', 'postgres']
	},
	plugins: [
		ocrAssets(),
		sentrySvelteKit({
			autoUploadSourceMaps: Boolean(sentryAuthToken && release),
			autoInstrument: false,
			org: 'orells-organization',
			project: 'bissbilanz',
			sentryUrl: 'https://de.sentry.io',
			authToken: sentryAuthToken,
			release: { name: release },
			telemetry: false,
			// A Sentry outage must not fail the release build.
			errorHandler: (err) => console.warn('[sentry] source map upload failed:', err.message)
		}),
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
