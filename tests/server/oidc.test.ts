import { describe, expect, test } from 'vitest';
import {
	buildAuthorizeUrl,
	createCodeChallenge,
	generateNonce,
	generateState
} from '../../src/lib/server/oidc';

const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

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
			clientId: 'client',
			redirectUri: 'https://app.local/callback',
			state: 'state123',
			nonce: 'nonce123',
			codeChallenge: 'challenge'
		});
		expect(url).toContain('state=state123');
		expect(url).toContain('nonce=nonce123');
	});
});
