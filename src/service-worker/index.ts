import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { asset, resolve } from '$app/paths';
import { self } from '$app/service-worker';
import './push.js';

const PRECACHED_EXTENSIONS = /\.(js|css|ico|png|svg|webp|woff2?|wasm|webmanifest)$/;

// The OCR worker, wasm core and language data are megabytes each and only
// needed when the label scanner is opened, so they are not precached. The
// landing page images are never shown inside the app.
const isPrecached = (path: string) =>
	PRECACHED_EXTENSIONS.test(path) && !path.includes('ocr/') && !path.includes('landing/');

void self.skipWaiting();
clientsClaim();

precacheAndRoute([
	// Build output is content-hashed, so the URL is its own revision.
	...immutable
		.filter(({ path }) => isPrecached(path))
		.map(({ path }) => ({ url: resolve(path), revision: null })),
	...assets
		.filter(({ path }) => isPrecached(path))
		.map(({ path }) => ({ url: asset(path), revision: version })),
	...prerendered.map(({ path }) => ({ url: resolve(path), revision: version }))
]);
cleanupOutdatedCaches();
