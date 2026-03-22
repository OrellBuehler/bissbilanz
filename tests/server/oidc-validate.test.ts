import { describe, expect, test } from 'vitest';
import { assertNonce, assertState, decodeIdToken } from '../../src/lib/server/oidc-validate';

describe('assertState', () => {
	test('does not throw when state matches', () => {
		expect(() => assertState('abc123', 'abc123')).not.toThrow();
	});

	test('throws on mismatch', () => {
		expect(() => assertState('expected', 'actual')).toThrow('Invalid OIDC state');
	});

	test('throws when expected is undefined', () => {
		expect(() => assertState(undefined, 'actual')).toThrow('Invalid OIDC state');
	});

	test('throws when actual is null', () => {
		expect(() => assertState('expected', null)).toThrow('Invalid OIDC state');
	});
});

describe('assertNonce', () => {
	test('does not throw when nonce matches', () => {
		expect(() => assertNonce('nonce123', 'nonce123')).not.toThrow();
	});

	test('throws on mismatch', () => {
		expect(() => assertNonce('expected', 'actual')).toThrow('Invalid OIDC nonce');
	});

	test('throws when expected is undefined', () => {
		expect(() => assertNonce(undefined, 'actual')).toThrow('Invalid OIDC nonce');
	});

	test('throws when actual is undefined', () => {
		expect(() => assertNonce('expected', undefined)).toThrow('Invalid OIDC nonce');
	});
});

describe('decodeIdToken', () => {
	const makeToken = (payload: object) => {
		const encoded = btoa(JSON.stringify(payload))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=/g, '');
		return `header.${encoded}.signature`;
	};

	test('decodes nonce from a valid token', () => {
		const token = makeToken({ nonce: 'test-nonce', sub: 'user1' });
		expect(decodeIdToken(token).nonce).toBe('test-nonce');
	});

	test('returns object without nonce when nonce is absent', () => {
		const token = makeToken({ sub: 'user1' });
		const result = decodeIdToken(token);
		expect(result.nonce).toBeUndefined();
	});

	test('throws when token has no dot-separated segments', () => {
		expect(() => decodeIdToken('notajwt')).toThrow();
	});

	test('throws when payload segment is not valid base64', () => {
		expect(() => decodeIdToken('header.!!!.signature')).toThrow();
	});

	test('throws when payload decodes to non-JSON', () => {
		const invalidJson = btoa('not json');
		expect(() => decodeIdToken(`header.${invalidJson}.signature`)).toThrow();
	});
});
