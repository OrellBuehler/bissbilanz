import { describe, expect, test } from 'vitest';
import { decryptToken, encryptToken } from '../../src/lib/server/token-crypto';

describe('token crypto', () => {
	test('encrypts and decrypts refresh tokens', async () => {
		const secret = 'test-secret-123';
		const token = 'refresh-token-value';
		const encrypted = await encryptToken(token, secret);
		expect(encrypted).not.toBe(token);
		const decrypted = await decryptToken(encrypted, secret);
		expect(decrypted).toBe(token);
	});

	test('decrypt throws with wrong secret', async () => {
		const encrypted = await encryptToken('token', 'secret-a');
		await expect(decryptToken(encrypted, 'secret-b')).rejects.toThrow();
	});
});
