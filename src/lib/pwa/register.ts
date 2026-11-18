import * as Sentry from '@sentry/sveltekit';
import { Workbox } from 'workbox-window';

/**
 * Registers the service worker. A new deploy installs and activates its worker
 * straight away (it skips waiting), and the page then reloads onto the new build.
 */
export function registerServiceWorker(): void {
	if (!('serviceWorker' in navigator)) return;

	const workbox = new Workbox('/service-worker.js', { type: 'module' });
	workbox.addEventListener('activated', (event) => {
		if (event.isUpdate || event.isExternal) window.location.reload();
	});
	workbox.register({ immediate: true }).catch((err) => Sentry.captureException(err));
}
