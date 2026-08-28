import { describe, test, expect } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { getRequestIp } from '$lib/server/client-ip';

const event = (headers: Record<string, string>, socketAddr = '10.0.0.1') =>
	({
		request: new Request('https://example.test/api/auth/login', { headers }),
		getClientAddress: () => socketAddr
	}) as unknown as RequestEvent;

describe('getRequestIp', () => {
	test('falls back to the socket address when no forwarding header is present', () => {
		expect(getRequestIp(event({}))).toBe('10.0.0.1');
	});

	test('uses the forwarded client address instead of the proxy socket address', () => {
		expect(getRequestIp(event({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
	});

	// The whole point of counting from the right: everything left of our own proxy's
	// entry is attacker-controlled, so a spoofed prefix must not change the bucket.
	test('ignores spoofed entries prepended by the client', () => {
		expect(getRequestIp(event({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 203.0.113.7' }))).toBe(
			'203.0.113.7'
		);
	});

	test('tolerates whitespace and empty entries', () => {
		expect(getRequestIp(event({ 'x-forwarded-for': '  ,  203.0.113.9  ' }))).toBe('203.0.113.9');
	});

	test('never throws when the header is malformed, so a bad header cannot 500 a route', () => {
		expect(getRequestIp(event({ 'x-forwarded-for': ',,,' }))).toBe('10.0.0.1');
	});
});
