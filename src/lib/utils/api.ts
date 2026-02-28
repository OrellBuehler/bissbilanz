import { browser } from '$app/environment';
import { enqueue } from '$lib/stores/offline-queue';
import { cacheApiResponse } from '$lib/db/cache';
import { getOfflineData } from '$lib/db/offline-reads';
import { applyOptimisticWrite } from '$lib/db/optimistic';

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
	const method = options.method?.toUpperCase() ?? 'GET';
	const isWrite =
		method === 'POST' || method === 'PATCH' || method === 'DELETE' || method === 'PUT';

	// Offline writes → queue for later sync + apply optimistically to Dexie
	if (browser && !navigator.onLine && isWrite) {
		const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
		const meta = urlToMeta(url);
		await enqueue(method, url, body, meta);
		// Apply optimistically to local cache (best-effort)
		applyOptimisticWrite(method, url, body).catch(() => {});
		return new Response(JSON.stringify({ queued: true }), {
			status: 200,
			headers: { 'content-type': 'application/json', 'x-queued': 'true' }
		});
	}

	// Offline reads → serve from Dexie cache
	if (browser && !navigator.onLine && !isWrite) {
		try {
			const data = await getOfflineData(url);
			if (data !== null) {
				return new Response(JSON.stringify(data), {
					status: 200,
					headers: { 'content-type': 'application/json', 'x-offline': 'true' }
				});
			}
		} catch {
			// Fall through to network (will fail, but let the caller handle it)
		}
	}

	// Online → fetch from network
	const response = await fetch(url, options);

	// Cache successful GET responses in Dexie (fire-and-forget)
	if (browser && !isWrite && response.ok) {
		const cloned = response.clone();
		cloned
			.json()
			.then((data) => cacheApiResponse(url, data))
			.catch(() => {});
	}

	return response;
}

export function isQueued(response: Response): boolean {
	return response.headers.get('x-queued') === 'true';
}

export function isOffline(response: Response): boolean {
	return response.headers.get('x-offline') === 'true';
}

function urlToMeta(url: string): { affectedTable?: string; affectedId?: string } | undefined {
	const parsed = new URL(url, 'http://localhost');
	const parts = parsed.pathname.split('/').filter(Boolean); // ['api', 'foods', 'abc-123']
	if (parts.length < 2 || parts[0] !== 'api') return undefined;

	const tableMap: Record<string, string> = {
		foods: 'foods',
		entries: 'foodEntries',
		recipes: 'recipes',
		goals: 'userGoals',
		preferences: 'userPreferences',
		'meal-types': 'customMealTypes',
		supplements: 'supplements',
		weight: 'weightEntries'
	};

	const table = tableMap[parts[1]];
	if (!table) return undefined;

	const id = parts.length >= 3 ? parts[2] : undefined;
	return { affectedTable: table, affectedId: id };
}
