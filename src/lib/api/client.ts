import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';
import { apiFetch } from '$lib/utils/api';

// openapi-fetch passes a Request object as first arg to custom fetch.
// apiFetch expects (url: string, options: RequestInit). Wrap to bridge.
const compatFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const url =
		typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
	return apiFetch(url, init);
}) as typeof globalThis.fetch;

export const api = createClient<paths>({
	baseUrl: '',
	fetch: compatFetch
});
