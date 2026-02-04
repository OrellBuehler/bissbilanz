import { describe, expect, test } from 'bun:test';
import { securityHeaders } from '../../src/lib/server/security';

describe('securityHeaders', () => {
	test('includes CSP and HSTS', () => {
		const headers = securityHeaders();
		expect(headers['content-security-policy']).toBeTruthy();
		expect(headers['strict-transport-security']).toBeTruthy();
	});
});
