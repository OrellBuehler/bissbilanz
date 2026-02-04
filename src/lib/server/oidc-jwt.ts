import { createRemoteJWKSet, jwtVerify } from 'jose';

export const assertClaims = (
	payload: { iss?: string; aud?: string | string[]; nonce?: string },
	expected: { issuer: string; audience: string; nonce: string }
) => {
	if (payload.iss !== expected.issuer) throw new Error('Invalid issuer');
	const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);
	if (!aud.includes(expected.audience)) throw new Error('Invalid audience');
	if (payload.nonce !== expected.nonce) throw new Error('Invalid nonce');
};

export const verifyIdToken = async (
	idToken: string,
	expected: { issuer: string; audience: string; nonce: string }
) => {
	const discovery = await fetch(`${expected.issuer}/.well-known/openid-configuration`).then(
		(r) => r.json()
	);
	const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
	const { payload } = await jwtVerify(idToken, jwks, {
		issuer: expected.issuer,
		audience: expected.audience
	});
	assertClaims(payload, expected);
	return payload;
};
