import { describe, expect, test } from 'vitest';
import { isCrossOriginEndpoint, isOriginMismatch } from '../../src/lib/server/csrf';

const url = new URL('https://app.example.com/foods');

function req(method: string, headers: Record<string, string> = {}) {
	return new Request('https://app.example.com/foods', { method, headers });
}

describe('isOriginMismatch', () => {
	test('rejects cross-origin urlencoded form POST', () => {
		const r = req('POST', {
			'content-type': 'application/x-www-form-urlencoded',
			origin: 'https://evil.example'
		});
		expect(isOriginMismatch(r, url)).toBe(true);
	});

	test('allows same-origin urlencoded form POST', () => {
		const r = req('POST', {
			'content-type': 'application/x-www-form-urlencoded',
			origin: 'https://app.example.com'
		});
		expect(isOriginMismatch(r, url)).toBe(false);
	});

	test('treats a missing Origin header on a form POST as a mismatch', () => {
		const r = req('POST', { 'content-type': 'application/x-www-form-urlencoded' });
		expect(isOriginMismatch(r, url)).toBe(true);
	});

	test('matches content-type with charset parameter', () => {
		const r = req('POST', {
			'content-type': 'text/plain;charset=UTF-8',
			origin: 'https://evil.example'
		});
		expect(isOriginMismatch(r, url)).toBe(true);
	});

	test('rejects cross-origin multipart and text/plain for PUT/PATCH/DELETE', () => {
		for (const method of ['PUT', 'PATCH', 'DELETE']) {
			const r = req(method, {
				'content-type': 'multipart/form-data',
				origin: 'https://evil.example'
			});
			expect(isOriginMismatch(r, url), method).toBe(true);
		}
	});

	test('ignores GET requests', () => {
		const r = req('GET', {
			'content-type': 'application/x-www-form-urlencoded',
			origin: 'https://evil.example'
		});
		expect(isOriginMismatch(r, url)).toBe(false);
	});

	test('ignores JSON requests (covered by same-origin fetch + CORS)', () => {
		const r = req('POST', { 'content-type': 'application/json', origin: 'https://evil.example' });
		expect(isOriginMismatch(r, url)).toBe(false);
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
