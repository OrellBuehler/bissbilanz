import { describe, expect, test } from 'vitest';
import { parseAppleUserField } from '../../src/lib/server/auth-callback';
import { isFormPostCallback, isOriginMismatch } from '../../src/lib/server/csrf';
import { providerDefs } from '../../src/lib/server/auth-providers';
import { createTtlStore } from '../../src/lib/server/auth-transactions';

describe('apple provider definition', () => {
	test('asks for a form post and skips PKCE', () => {
		expect(providerDefs.apple.responseMode).toBe('form_post');
		expect(providerDefs.apple.usesPkce).toBe(false);
	});

	test('has no userinfo endpoint', () => {
		expect(providerDefs.apple.userinfoEndpoint).toBeUndefined();
	});

	test('maps only the subject and email, never a picture', () => {
		expect(
			providerDefs.apple.mapClaims({ sub: 'a-1', email: 'x@privaterelay.appleid.com' })
		).toEqual({ sub: 'a-1', email: 'x@privaterelay.appleid.com' });
	});
});

describe('parseAppleUserField', () => {
	test('joins the first and last name Apple sends on first authorization', () => {
		expect(parseAppleUserField('{"name":{"firstName":"Ada","lastName":"Lovelace"}}')).toBe(
			'Ada Lovelace'
		);
	});

	test('handles a partial name', () => {
		expect(parseAppleUserField('{"name":{"firstName":"Ada"}}')).toBe('Ada');
	});

	test('returns undefined when the field is absent, empty or malformed', () => {
		expect(parseAppleUserField(null)).toBeUndefined();
		expect(parseAppleUserField('')).toBeUndefined();
		expect(parseAppleUserField('not json')).toBeUndefined();
		expect(parseAppleUserField('{"name":{}}')).toBeUndefined();
		expect(parseAppleUserField('{}')).toBeUndefined();
	});
});

describe('CSRF handling for the Apple callback', () => {
	test('the origin check would otherwise reject Apple’s cross-site form post', () => {
		const request = new Request('https://app.example.com/api/auth/callback/apple', {
			method: 'POST',
			headers: {
				origin: 'https://appleid.apple.com',
				'content-type': 'application/x-www-form-urlencoded'
			},
			body: 'code=x&state=y'
		});
		expect(
			isOriginMismatch(request, new URL('https://app.example.com/api/auth/callback/apple'))
		).toBe(true);
	});

	test('only the Apple callbacks are exempted', () => {
		expect(isFormPostCallback('/api/auth/callback/apple')).toBe(true);
		expect(isFormPostCallback('/api/auth/mobile/callback/apple')).toBe(true);
		expect(isFormPostCallback('/api/auth/callback/google')).toBe(false);
		expect(isFormPostCallback('/api/auth/callback')).toBe(false);
		expect(isFormPostCallback('/api/foods')).toBe(false);
	});
});

describe('auth transaction store', () => {
	test('a state can only be consumed once', () => {
		const store = createTtlStore<{ nonce: string }>(60_000);
		store.set('state-1', { nonce: 'n-1' });
		expect(store.consume('state-1')).toEqual({ nonce: 'n-1' });
		expect(store.consume('state-1')).toBeUndefined();
	});

	test('an unknown state yields nothing', () => {
		const store = createTtlStore<{ nonce: string }>(60_000);
		expect(store.consume('never-stored')).toBeUndefined();
	});
});
