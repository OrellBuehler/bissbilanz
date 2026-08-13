import { SignJWT, importPKCS8 } from 'jose';
import { config } from './env';

type AppleConfig = {
	servicesId: string;
	teamId: string;
	keyId: string;
	privateKey: string;
};

/** Returns null unless every piece of the Sign in with Apple key material is present. */
export function appleConfig(): AppleConfig | null {
	const { servicesId, teamId, keyId, privateKey } = config.apple;
	if (!servicesId || !teamId || !keyId || !privateKey) return null;
	return { servicesId, teamId, keyId, privateKey };
}

let cachedKey: Promise<CryptoKey> | null = null;

function signingKey(pem: string) {
	// Env vars carry the .p8 with escaped newlines.
	cachedKey ??= importPKCS8(pem.replace(/\\n/g, '\n'), 'ES256') as Promise<CryptoKey>;
	return cachedKey;
}

/**
 * Apple has no static client secret: it is an ES256 JWT signed with the .p8 key.
 * Minting one per exchange keeps the 6-month maximum lifetime irrelevant, so there
 * is no secret to rotate.
 */
export async function createAppleClientSecret(): Promise<string> {
	const apple = appleConfig();
	if (!apple) throw new Error('Sign in with Apple is not configured');

	return new SignJWT({})
		.setProtectedHeader({ alg: 'ES256', kid: apple.keyId })
		.setIssuer(apple.teamId)
		.setSubject(apple.servicesId)
		.setAudience('https://appleid.apple.com')
		.setIssuedAt()
		.setExpirationTime('5m')
		.sign(await signingKey(apple.privateKey));
}
