import { describe, expect, test } from 'vitest';
import {
	isCrossOriginEndpoint,
	isCsrfViolation,
	isOriginMismatch
} from '../../src/lib/server/csrf';

const url = new URL('https://app.example.com/foods');

function req(method: string, headers: Record<string, string> = {}) {
	return new Request('https://app.example.com/foods', { method, headers });
}

const cookie = { cookie: 'session=abc; PARAGLIDE_LOCALE=en' };
const json = { 'content-type': 'application/json' };

describe('isOriginMismatch', () => {
	test('allows same-origin fetches', () => {
		const r = req('POST', { ...cookie, ...json, 'sec-fetch-site': 'same-origin' });
		expect(isOriginMismatch(r, url)).toBe(false);
	});

	test('allows user-initiated navigations (Sec-Fetch-Site: none)', () => {
		const r = req('POST', { ...cookie, 'sec-fetch-site': 'none' });
		expect(isOriginMismatch(r, url)).toBe(false);
	});

	test('rejects a cross-site JSON POST that carries the cookie', () => {
		const r = req('POST', { ...cookie, ...json, 'sec-fetch-site': 'cross-site' });
		expect(isOriginMismatch(r, url)).toBe(true);
	});

	test('rejects a request from a sibling subdomain (same-site, not same-origin)', () => {
		for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
			const r = req(method, { ...cookie, ...json, 'sec-fetch-site': 'same-site' });
			expect(isOriginMismatch(r, url), method).toBe(true);
		}
	});

	test('trusts Sec-Fetch-Site over a matching Origin header', () => {
		const r = req('POST', {
			...cookie,
			'sec-fetch-site': 'same-site',
			origin: 'https://app.example.com'
		});
		expect(isOriginMismatch(r, url)).toBe(true);
	});

	test('falls back to Origin when Sec-Fetch-Site is absent', () => {
		expect(
			isOriginMismatch(req('POST', { ...cookie, origin: 'https://app.example.com' }), url)
		).toBe(false);
		expect(isOriginMismatch(req('POST', { ...cookie, origin: 'https://evil.example' }), url)).toBe(
			true
		);
		expect(isOriginMismatch(req('POST', { ...cookie, origin: 'null' }), url)).toBe(true);
	});

	test('rejects a cookie request with neither header', () => {
		expect(isOriginMismatch(req('POST', { ...cookie, ...json }), url)).toBe(true);
	});

	test('rejects cross-origin form posts of any content type', () => {
		for (const type of ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']) {
			const r = req('POST', { ...cookie, 'content-type': type, origin: 'https://evil.example' });
			expect(isOriginMismatch(r, url), type).toBe(true);
		}
	});

	test('exempts bearer-token requests (mobile apps)', () => {
		const r = req('POST', {
			authorization: 'Bearer token',
			'content-type': 'multipart/form-data',
			cookie: 'session=abc',
			'sec-fetch-site': 'cross-site'
		});
		expect(isOriginMismatch(r, url)).toBe(false);
	});

	test('ignores requests without the auth cookie', () => {
		expect(isOriginMismatch(req('POST', { ...json, origin: 'https://evil.example' }), url)).toBe(
			false
		);
		expect(isOriginMismatch(req('POST', { cookie: 'PARAGLIDE_LOCALE=en' }), url)).toBe(false);
	});

	test('does not mistake a cookie whose name ends in session for the auth cookie', () => {
		expect(isOriginMismatch(req('POST', { cookie: 'other_session=abc' }), url)).toBe(false);
	});

	test('ignores safe methods', () => {
		for (const method of ['GET', 'HEAD']) {
			const r = req(method, { ...cookie, 'sec-fetch-site': 'cross-site' });
			expect(isOriginMismatch(r, url), method).toBe(false);
		}
	});
});

describe('isCsrfViolation', () => {
	const crossSite = {
		...cookie,
		'sec-fetch-site': 'cross-site',
		origin: 'https://appleid.apple.com'
	};
	const at = (path: string) => new URL(`https://app.example.com${path}`);
	const post = (path: string, headers: Record<string, string>) =>
		new Request(`https://app.example.com${path}`, { method: 'POST', headers });

	test('blocks cross-site cookie POSTs to app routes', () => {
		expect(isCsrfViolation(post('/api/foods', crossSite), at('/api/foods'))).toBe(true);
		expect(isCsrfViolation(post('/api/account', crossSite), at('/api/account'))).toBe(true);
	});

	test('lets Apple post its form_post callbacks cross-site', () => {
		for (const path of ['/api/auth/callback/apple', '/api/auth/mobile/callback/apple']) {
			expect(isCsrfViolation(post(path, crossSite), at(path)), path).toBe(false);
		}
	});

	test('leaves the CORS endpoints to their own protections', () => {
		for (const path of ['/api/oauth/token', '/api/mcp', '/token']) {
			expect(isCsrfViolation(post(path, crossSite), at(path)), path).toBe(false);
		}
	});

	test('still blocks other providers callbacks that are not on the allow-list', () => {
		expect(
			isCsrfViolation(post('/api/auth/callback/google', crossSite), at('/api/auth/callback/google'))
		).toBe(true);
	});
});

describe('isCrossOriginEndpoint', () => {
	test('exempts MCP, OAuth, well-known and token paths', () => {
		expect(isCrossOriginEndpoint('/api/mcp')).toBe(true);
		expect(isCrossOriginEndpoint('/api/oauth/token')).toBe(true);
		expect(isCrossOriginEndpoint('/.well-known/oauth-authorization-server')).toBe(true);
		expect(isCrossOriginEndpoint('/token')).toBe(true);
	});

	test('does not exempt regular app and API paths', () => {
		expect(isCrossOriginEndpoint('/api/foods')).toBe(false);
		expect(isCrossOriginEndpoint('/home')).toBe(false);
		expect(isCrossOriginEndpoint('/tokens')).toBe(false);
	});
});
