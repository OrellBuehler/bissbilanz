import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';
import { apiFetch } from '$lib/utils/api';

export const api = createClient<paths>({
	baseUrl: '',
	fetch: apiFetch as typeof globalThis.fetch
});
