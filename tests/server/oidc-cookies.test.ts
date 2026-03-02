import { describe, expect, test } from 'vitest';
import { oidcCookieOptions } from '../../src/lib/server/oidc-cookies';

describe('oidcCookieOptions', () => {
	test('uses HttpOnly and SameSite=Lax', () => {
		const opts = oidcCookieOptions(true);
		expect(opts.httpOnly).toBe(true);
		expect(opts.sameSite).toBe('lax');
		expect(opts.secure).toBe(true);
	});
});
