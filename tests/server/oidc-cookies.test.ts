import { describe, expect, test } from 'vitest';
import { oidcCookieOptions } from '../../src/lib/server/oidc-cookies';

describe('oidcCookieOptions', () => {
	test('uses HttpOnly and SameSite=Lax', () => {
		const opts = oidcCookieOptions(true);
		expect(opts.httpOnly).toBe(true);
		expect(opts.sameSite).toBe('lax');
		expect(opts.secure).toBe(true);
	});

	test('sets secure=false when passed false', () => {
		const opts = oidcCookieOptions(false);
		expect(opts.secure).toBe(false);
	});

	test('sets path to root', () => {
		expect(oidcCookieOptions(true).path).toBe('/');
	});

	test('sets maxAge to 10 minutes', () => {
		expect(oidcCookieOptions(true).maxAge).toBe(600);
	});
});
