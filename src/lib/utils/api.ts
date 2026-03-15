import { browser } from '$app/environment';
import { enqueue } from '$lib/stores/offline-queue';

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
	const method = options.method?.toUpperCase() ?? 'GET';
	const isWrite =
		method === 'POST' || method === 'PATCH' || method === 'DELETE' || method === 'PUT';

	// Offline writes → queue for later sync
	if (browser && !navigator.onLine && isWrite) {
		if (options.body instanceof FormData) {
			throw new TypeError('Failed to fetch');
		}

		const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
		const meta = urlToMeta(url);
		await enqueue(method, url, body, meta);
		return new Response(JSON.stringify({ queued: true }), {
			status: 200,
			headers: { 'content-type': 'application/json', 'x-queued': 'true' }
		});
	}

	return fetch(url, options);
}

export function isQueued(response: Response): boolean {
	return response.headers.get('x-queued') === 'true';
}

export function urlToMeta(
	url: string
): { affectedTable?: string; affectedId?: string } | undefined {
	const parsed = new URL(url, 'http://localhost');
	const parts = parsed.pathname.split('/').filter(Boolean);
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
