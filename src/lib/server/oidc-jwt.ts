import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export const assertClaims = (
	payload: { iss?: string; aud?: string | string[]; nonce?: string },
	expected: { issuer: string; audience: string; nonce: string }
) => {
	if (payload.iss !== expected.issuer) throw new Error('Invalid issuer');
	const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);
	if (!aud.includes(expected.audience)) throw new Error('Invalid audience');
	if (payload.nonce !== expected.nonce) throw new Error('Invalid nonce');
};

const DISCOVERY_TTL_MS = 60 * 60 * 1000; // 1 hour

const discoveryCache = new Map<string, { jwksUri: string; expiresAt: number }>();
const jwksCache = new Map<string, JWTVerifyGetKey>();

const fetchJwksUri = async (issuer: string): Promise<string> => {
	const discovery = (await fetch(`${issuer}/.well-known/openid-configuration`, {
		signal: AbortSignal.timeout(10000)
	}).then((r) => r.json())) as { jwks_uri: string };
	discoveryCache.set(issuer, {
		jwksUri: discovery.jwks_uri,
		expiresAt: Date.now() + DISCOVERY_TTL_MS
	});
	return discovery.jwks_uri;
};

const getJwks = async (issuer: string): Promise<JWTVerifyGetKey> => {
	const cached = discoveryCache.get(issuer);
	const jwksUri =
		cached && cached.expiresAt > Date.now() ? cached.jwksUri : await fetchJwksUri(issuer);

	let jwks = jwksCache.get(jwksUri);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(jwksUri));
		jwksCache.set(jwksUri, jwks);
	}
	return jwks;
};

export const verifyIdToken = async (
	idToken: string,
	expected: { issuer: string; audience: string; nonce: string }
) => {
	const jwks = await getJwks(expected.issuer);
	const { payload } = await jwtVerify(idToken, jwks, {
		issuer: expected.issuer,
		audience: expected.audience
	});
	assertClaims(payload, expected);
	return payload;
};
