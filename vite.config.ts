import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		port: 4000
	},
	plugins: [
		sentrySvelteKit({ autoUploadSourceMaps: false }),
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
				scope: '/',
				start_url: '/',
				name: 'Bissbilanz',
				short_name: 'Bissbilanz',
				description: 'Food tracking with AI assistance',
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
				]
			},
			workbox: {
				globPatterns: [
					'client/**/*.{js,css,ico,png,svg,webp,woff,woff2,wasm}',
					'prerendered/**/*.{html,json}'
				],
				navigateFallback: '/',
				navigateFallbackDenylist: [/^\/api\//, /^\/login/, /^\/authorize/, /^\/token/],
				runtimeCaching: [
					{
						urlPattern: /^\/api\/auth\/me$/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'auth-cache',
							expiration: {
								maxEntries: 1,
								maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
							}
						}
					},
					{
						urlPattern:
							/\/api\/(foods|recipes|entries|goals|stats|supplements|meal-types|preferences|weight|favorites|openfoodfacts)/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'api-cache',
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
