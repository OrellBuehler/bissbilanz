import { browser } from '$app/environment';
import { enqueue } from '$lib/stores/offline-queue';

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
	const method = options.method?.toUpperCase() ?? 'GET';
	const isWrite = method === 'POST' || method === 'PATCH' || method === 'DELETE';

	if (browser && !navigator.onLine && isWrite) {
		const body = options.body ? JSON.parse(options.body as string) : {};
		await enqueue(method, url, body);
		return new Response(JSON.stringify({ queued: true }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	}

	return fetch(url, options);
}
