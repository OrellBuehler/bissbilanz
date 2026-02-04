import { describe, expect, test } from 'bun:test';
import { assertNonce, assertState } from '../../src/lib/server/oidc-validate';

describe('oidc validate', () => {
	test('assertState throws on mismatch', () => {
		expect(() => assertState('expected', 'actual')).toThrow();
	});

	test('assertNonce throws on mismatch', () => {
		expect(() => assertNonce('expected', 'actual')).toThrow();
	});
});
