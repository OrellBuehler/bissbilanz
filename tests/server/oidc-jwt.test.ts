import { describe, expect, test } from 'bun:test';
import { assertClaims } from '../../src/lib/server/oidc-jwt';

describe('assertClaims', () => {
	test('throws when issuer mismatches', () => {
		expect(() =>
			assertClaims(
				{ iss: 'bad', aud: 'client', nonce: 'n' },
				{ issuer: 'good', audience: 'client', nonce: 'n' }
			)
		).toThrow();
	});
});
