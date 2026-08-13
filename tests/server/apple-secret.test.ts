import { describe, expect, test, vi } from 'vitest';
import { exportPKCS8, generateKeyPair, decodeProtectedHeader, decodeJwt } from 'jose';

const { privateKey } = await generateKeyPair('ES256', { extractable: true });
const pem = await exportPKCS8(privateKey);

vi.mock('$lib/server/env', () => ({
	config: {
		apple: {
			servicesId: 'ch.example.bissbilanz.web',
			teamId: 'TEAM123456',
			keyId: 'KEY1234567',
			// Env vars carry the key with escaped newlines.
			privateKey: pem.replace(/\n/g, '\\n')
		}
	}
}));

const { createAppleClientSecret, appleConfig } = await import('../../src/lib/server/apple-secret');

describe('createAppleClientSecret', () => {
	test('signs an ES256 JWT with the key id in the header', async () => {
		const secret = await createAppleClientSecret();
		expect(decodeProtectedHeader(secret)).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' });
	});

	test('carries the claims Apple requires', async () => {
		const claims = decodeJwt(await createAppleClientSecret());
		expect(claims.iss).toBe('TEAM123456');
		expect(claims.sub).toBe('ch.example.bissbilanz.web');
		expect(claims.aud).toBe('https://appleid.apple.com');
		expect(claims.exp).toBeGreaterThan(claims.iat!);
		// Apple caps client secrets at six months; a short life avoids any rotation.
		expect(claims.exp! - claims.iat!).toBeLessThanOrEqual(300);
	});

	test('reports Apple as configured when every piece of key material is present', () => {
		expect(appleConfig()).not.toBeNull();
	});
});
