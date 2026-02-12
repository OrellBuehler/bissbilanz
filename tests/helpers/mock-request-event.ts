/**
 * Mock SvelteKit RequestEvent factory for testing route handlers
 */

import type { RequestEvent } from '@sveltejs/kit';
import type { User } from '$lib/server/schema';

interface MockEventOptions {
	user?: User | null;
	searchParams?: Record<string, string>;
	body?: Record<string, any>;
	params?: Record<string, string>;
	headers?: Record<string, string>;
	formData?: Record<string, string>;
	method?: string;
	url?: string;
}

export function createMockEvent(options: MockEventOptions = {}): RequestEvent<any, any> {
	const {
		user = null,
		searchParams = {},
		body,
		params = {},
		headers = {},
		formData: formDataValues,
		method = body || formDataValues ? 'POST' : 'GET',
		url = 'http://localhost:5173/api/test'
	} = options;

	// Build URL with search params
	const urlObj = new URL(url);
	Object.entries(searchParams).forEach(([key, value]) => {
		urlObj.searchParams.set(key, value);
	});

	// Build headers
	const headersObj = new Headers(headers);
	if (body && !headersObj.has('content-type')) {
		headersObj.set('content-type', 'application/json');
	}

	// Build request
	const requestInit: RequestInit = {
		method,
		headers: headersObj
	};

	if (body) {
		requestInit.body = JSON.stringify(body);
	} else if (formDataValues) {
		const fd = new FormData();
		Object.entries(formDataValues).forEach(([key, value]) => {
			fd.append(key, value);
		});
		requestInit.body = fd;
	}

	const request = new Request(urlObj, requestInit);

	// Create mock event
	const event = {
		request,
		url: urlObj,
		params,
		locals: {
			user
		},
		cookies: {
			get: () => undefined,
			set: () => {},
			delete: () => {},
			serialize: () => ''
		},
		fetch: globalThis.fetch,
		getClientAddress: () => '127.0.0.1',
		platform: undefined,
		route: {
			id: '/api/test'
		},
		setHeaders: () => {},
		isDataRequest: false,
		isSubRequest: false
	} as unknown as RequestEvent;

	return event;
}
