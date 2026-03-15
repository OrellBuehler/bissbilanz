import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';
import { apiFetch } from '$lib/utils/api';

// openapi-fetch always passes a Request object. apiFetch expects (url: string, options: RequestInit).
// The offline queue, optimistic writes, and Dexie caching in apiFetch don't map cleanly to the
// onRequest/onResponse middleware pattern (offline writes short-circuit before fetch; reads too),
// so we keep the fetch wrapper approach.
const wrappedFetch = ((input: Request) =>
	apiFetch(input.url, {
		method: input.method,
		headers: input.headers,
		body: input.body
	})) as typeof globalThis.fetch;

export const api = createClient<paths>({
	baseUrl: '',
	fetch: wrappedFetch
});
