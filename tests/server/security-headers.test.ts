import { describe, expect, test } from 'vitest';
import { securityHeaders } from '../../src/lib/server/security';
import svelteConfig from '../../svelte.config.js';

describe('securityHeaders', () => {
	test('includes HSTS', () => {
		const headers = securityHeaders();
		expect(headers['strict-transport-security']).toBeTruthy();
	});

	test('does not set content-security-policy directly (owned by svelte.config.js kit.csp)', () => {
		const headers: Record<string, string> = securityHeaders();
		expect(headers['content-security-policy']).toBeUndefined();
	});

	test('X-Frame-Options is DENY', () => {
		expect(securityHeaders()['x-frame-options']).toBe('DENY');
	});

	test('X-Content-Type-Options is nosniff', () => {
		expect(securityHeaders()['x-content-type-options']).toBe('nosniff');
	});

	test('Referrer-Policy is strict-origin-when-cross-origin', () => {
		expect(securityHeaders()['referrer-policy']).toBe('strict-origin-when-cross-origin');
	});

	test('Permissions-Policy allows camera on self only', () => {
		const policy = securityHeaders()['permissions-policy'];
		expect(policy).toContain('camera=(self)');
		expect(policy).toContain('microphone=()');
		expect(policy).toContain('geolocation=()');
	});
});

describe('kit.csp (svelte.config.js)', () => {
	const directives = svelteConfig.kit!.csp!.directives!;

	test('script-src has no unsafe-inline', () => {
		expect(directives['script-src']).not.toContain('unsafe-inline');
	});

	test('img-src allows openfoodfacts domains', () => {
		expect(directives['img-src']).toContain('https://images.openfoodfacts.net');
		expect(directives['img-src']).toContain('https://images.openfoodfacts.org');
	});

	test('connect-src allows Sentry ingest', () => {
		expect(directives['connect-src']).toContain('https://*.ingest.de.sentry.io');
	});
});
