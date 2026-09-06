import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { ocrAssetBase, ocrAssets } from './scripts/ocr-assets';

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
	plugins: [
		ocrAssets(),
		sentrySvelteKit({ autoUploadSourceMaps: false, autoInstrument: false }),
		tailwindcss(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['url', 'cookie', 'baseLocale']
		}),
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				id: '/',
				scope: '/',
				start_url: '/',
				lang: 'en',
				categories: ['health', 'fitness', 'lifestyle', 'food'],
				name: 'Bissbilanz — Calorie and Macro Tracker',
				short_name: 'Bissbilanz',
				description:
					'Track calories, macros and 43+ nutrients. Build recipes, scan barcodes, and let AI help you log — all offline-ready.',
				theme_color: '#000000',
				background_color: '#ffffff',
				display: 'standalone',
				icons: [
					{
						src: '/icon-192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: '/icon-512.png',
						sizes: '512x512',
						type: 'image/png'
					},
					{
						src: '/icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				],
				shortcuts: [
					{
						name: 'Add Entry',
						short_name: 'Add',
						url: '/?add=true',
						icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }]
					},
					{
						name: 'Scan Barcode',
						short_name: 'Scan',
						url: '/?scan=true',
						icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }]
					},
					{
						name: 'Foods',
						short_name: 'Foods',
						url: '/foods',
						icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }]
					},
					{
						name: 'Recipes',
						short_name: 'Recipes',
						url: '/recipes',
						icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }]
					}
				]
			},
			workbox: {
				globPatterns: [
					'client/**/*.{js,css,ico,png,svg,webp,woff,woff2,wasm}',
					'prerendered/**/*.{html,json}'
				],
				// The OCR worker, wasm core and language data are megabytes each and
				// only needed when the label scanner is opened — they are cached at
				// runtime on first use instead of precached for every visitor.
				globIgnores: ['**/ocr/**'],
				navigateFallback: '/',
				navigateFallbackDenylist: [/^\/api\//, /^\/login/, /^\/authorize/, /^\/token/],
				runtimeCaching: [
					{
						// Keeps label scanning working offline once the assets have been
						// fetched once. The URLs carry the Tesseract version, so a bump
						// simply misses the cache instead of mixing core and worker.
						urlPattern: new RegExp(`^.*${ocrBase}/`),
						handler: 'CacheFirst',
						options: {
							cacheName: 'ocr-assets-cache',
							expiration: {
								maxEntries: 12,
								maxAgeSeconds: 90 * 24 * 60 * 60
							},
							cacheableResponse: { statuses: [0, 200] }
						}
					},
					{
						urlPattern: /\/__data\.json(\?.*)?$/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'ssr-data-cache',
							networkTimeoutSeconds: 3,
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 24 * 60 * 60
							}
						}
					},
					{
						urlPattern:
							/\/api\/(foods|recipes|entries|goals|stats|supplements|meal-types|preferences|weight|favorites|openfoodfacts|sleep|analytics)/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'api-cache',
							networkTimeoutSeconds: 3,
							expiration: {
								maxEntries: 200,
								maxAgeSeconds: 24 * 60 * 60 // 24 hours
							}
						}
					}
				]
			}
		})
	]
});
