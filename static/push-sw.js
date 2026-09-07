/**
 * Web Push handlers, imported into the Workbox-generated service worker
 * (see `workbox.importScripts` in vite.config.ts). Kept as a plain static
 * script so the precache/runtime-caching setup stays on generateSW.
 *
 * All user-visible strings arrive inside the push payload, already localized
 * server-side — the service worker has no access to the Paraglide runtime.
 */

const DEFAULT_URL = '/supplements';

self.addEventListener('push', (event) => {
	let payload = {};
	try {
		payload = event.data ? event.data.json() : {};
	} catch {
		payload = { body: event.data ? event.data.text() : '' };
	}

	const title = payload.title || 'Bissbilanz';
	const options = {
		body: payload.body || '',
		icon: '/icon-192.png',
		badge: '/icon-192.png',
		// Collapses successive reminders into a single notification.
		tag: payload.tag || 'bissbilanz',
		renotify: Boolean(payload.tag),
		data: {
			url: payload.url || DEFAULT_URL,
			supplementIds: payload.supplementIds || [],
			loggedTitle: payload.loggedTitle || ''
		},
		actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : []
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

const openApp = async (url) => {
	const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
	for (const client of clientList) {
		if ('focus' in client) {
			if ('navigate' in client) {
				try {
					await client.navigate(url);
				} catch {
					// Cross-origin or a client that refuses navigation — just focus it.
				}
			}
			return client.focus();
		}
	}
	return self.clients.openWindow(url);
};

const logSupplements = async (ids) => {
	const results = await Promise.all(
		ids.map((id) =>
			fetch(`/api/supplements/${id}/log`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: '{}'
			})
				.then((res) => res.ok)
				.catch(() => false)
		)
	);
	return results.every(Boolean);
};

self.addEventListener('notificationclick', (event) => {
	const data = event.notification.data || {};
	const url = data.url || DEFAULT_URL;
	event.notification.close();

	if (event.action === 'log' && Array.isArray(data.supplementIds) && data.supplementIds.length) {
		event.waitUntil(
			logSupplements(data.supplementIds).then((ok) => {
				// The session cookie is SameSite=Lax and this is a same-origin POST, so
				// it rides along; if it did not (signed out, expired), fall back to
				// opening the app so the user can log manually.
				if (ok) {
					return data.loggedTitle
						? self.registration.showNotification(data.loggedTitle, {
								icon: '/icon-192.png',
								badge: '/icon-192.png',
								tag: 'bissbilanz-logged'
							})
						: undefined;
				}
				return openApp(url);
			})
		);
		return;
	}

	event.waitUntil(openApp(url));
});
