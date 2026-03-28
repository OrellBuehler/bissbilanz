import { describe, expect, test } from 'vitest';
import { securityHeaders } from '../../src/lib/server/security';

describe('securityHeaders', () => {
	test('includes CSP and HSTS', () => {
		const headers = securityHeaders();
		expect(headers['content-security-policy']).toBeTruthy();
		expect(headers['strict-transport-security']).toBeTruthy();
	});

	test('CSP img-src allows openfoodfacts domains', () => {
		const csp = securityHeaders()['content-security-policy'];
		expect(csp).toContain('https://images.openfoodfacts.net');
		expect(csp).toContain('https://images.openfoodfacts.org');
	});

	test('CSP script-src allows unsafe-inline and wasm-unsafe-eval', () => {
		const csp = securityHeaders()['content-security-policy'];
		const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src'));
		expect(scriptSrc).toContain("'unsafe-inline'");
		expect(scriptSrc).toContain("'wasm-unsafe-eval'");
	});

	test('CSP connect-src allows Sentry ingest', () => {
		const csp = securityHeaders()['content-security-policy'];
		expect(csp).toContain('https://*.ingest.de.sentry.io');
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
