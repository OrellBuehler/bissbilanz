import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';
import { apiFetch } from '$lib/utils/api';

// openapi-fetch passes a Request object; apiFetch expects (url, options).
// apiFetch handles offline write queueing; all other offline/caching logic
// is in the service layer (src/lib/services/).
const wrappedFetch = (async (input: Request) => {
	const body = input.body ? await input.text() : undefined;
	return apiFetch(input.url, {
		method: input.method,
		headers: input.headers,
		body
	});
}) as typeof globalThis.fetch;

export const api = createClient<paths>({
	baseUrl: '',
	fetch: wrappedFetch
});
