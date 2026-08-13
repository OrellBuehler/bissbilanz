import { describe, expect, test } from 'vitest';
import {
	buildAuthorizeUrl,
	createCodeChallenge,
	generateNonce,
	generateState
} from '../../src/lib/server/oidc';
import type { ProviderConfig } from '../../src/lib/server/auth-providers';

const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

const testProvider = (overrides: Partial<ProviderConfig> = {}): ProviderConfig => ({
	id: 'infomaniak',
	issuer: 'https://idp.example',
	authorizeEndpoint: 'https://idp.example/authorize',
	tokenEndpoint: 'https://idp.example/token',
	scopes: 'openid email profile',
	usesPkce: true,
	mapClaims: (claims) => ({ sub: String(claims.sub) }),
	clientId: 'client',
	clientSecret: async () => 'secret',
	redirectUri: 'https://app.local/callback',
	mobileRedirectUri: 'https://app.local/mobile/callback',
	...overrides
});

describe('oidc helpers', () => {
	test('generateState and generateNonce return non-empty values', () => {
		expect(generateState().length).toBeGreaterThan(10);
		expect(generateNonce().length).toBeGreaterThan(10);
	});

	test('createCodeChallenge matches RFC example', async () => {
		const challenge = await createCodeChallenge(RFC_VERIFIER);
		expect(challenge).toBe(RFC_CHALLENGE);
	});

	test('buildAuthorizeUrl includes state and nonce', () => {
		const url = buildAuthorizeUrl({
			provider: testProvider(),
			redirectUri: 'https://app.local/callback',
			state: 'state123',
			nonce: 'nonce123',
			codeChallenge: 'challenge'
		});
		expect(url).toContain('state=state123');
		expect(url).toContain('nonce=nonce123');
	});

	test('buildAuthorizeUrl uses the provider endpoint, scopes and client id', () => {
		const url = new URL(
			buildAuthorizeUrl({
				provider: testProvider({ scopes: 'openid email' }),
				redirectUri: 'https://app.local/callback',
				state: 'state123',
				nonce: 'nonce123'
			})
		);
		expect(url.origin + url.pathname).toBe('https://idp.example/authorize');
		expect(url.searchParams.get('scope')).toBe('openid email');
		expect(url.searchParams.get('client_id')).toBe('client');
		expect(url.searchParams.get('redirect_uri')).toBe('https://app.local/callback');
	});

	test('buildAuthorizeUrl omits PKCE params when the provider does not use PKCE', () => {
		const url = buildAuthorizeUrl({
			provider: testProvider({ usesPkce: false }),
			redirectUri: 'https://app.local/callback',
			state: 'state123',
			nonce: 'nonce123',
			codeChallenge: 'challenge'
		});
		expect(url).not.toContain('code_challenge');
	});

	test('buildAuthorizeUrl passes response_mode and extra params', () => {
		const url = buildAuthorizeUrl({
			provider: testProvider({
				responseMode: 'form_post',
				extraAuthParams: { prompt: 'select_account' }
			}),
			redirectUri: 'https://app.local/callback',
			state: 'state123',
			nonce: 'nonce123'
		});
		expect(url).toContain('response_mode=form_post');
		expect(url).toContain('prompt=select_account');
	});
});
