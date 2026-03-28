import { describe, expect, test } from 'vitest';
import { decryptToken, encryptToken } from '$lib/server/token-crypto';

describe('encryptToken / decryptToken', () => {
	describe('round-trip', () => {
		test('basic token', async () => {
			const secret = 'test-secret';
			const token = 'my-refresh-token';
			const encrypted = await encryptToken(token, secret);
			expect(await decryptToken(encrypted, secret)).toBe(token);
		});

		test('long token', async () => {
			const secret = 'test-secret';
			const token = 'a'.repeat(4096);
			expect(await decryptToken(await encryptToken(token, secret), secret)).toBe(token);
		});

		test('token with special characters', async () => {
			const secret = 'test-secret';
			const token = 'eyJ0eXAiOiJKV1QifQ.payload+/=?&%#@!<>';
			expect(await decryptToken(await encryptToken(token, secret), secret)).toBe(token);
		});

		test('empty string', async () => {
			const secret = 'test-secret';
			expect(await decryptToken(await encryptToken('', secret), secret)).toBe('');
		});

		test('token with unicode characters', async () => {
			const secret = 'test-secret';
			const token = 'tøken-wïth-ünïcödé-€-🔑';
			expect(await decryptToken(await encryptToken(token, secret), secret)).toBe(token);
		});
	});

	test('encrypted output is not the plaintext', async () => {
		const token = 'my-token';
		const encrypted = await encryptToken(token, 'secret');
		expect(encrypted).not.toBe(token);
	});

	test('different secrets produce different ciphertexts', async () => {
		const token = 'same-token';
		const a = await encryptToken(token, 'secret-a');
		const b = await encryptToken(token, 'secret-b');
		expect(a).not.toBe(b);
	});

	test('same plaintext encrypted twice produces different ciphertexts', async () => {
		const token = 'same-token';
		const secret = 'secret';
		const first = await encryptToken(token, secret);
		const second = await encryptToken(token, secret);
		expect(first).not.toBe(second);
	});

	describe('decryption failures', () => {
		test('wrong secret throws', async () => {
			const encrypted = await encryptToken('token', 'secret-a');
			await expect(decryptToken(encrypted, 'secret-b')).rejects.toThrow();
		});

		test('corrupted ciphertext throws', async () => {
			const encrypted = await encryptToken('token', 'secret');
			const bytes = Buffer.from(encrypted.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
			bytes[bytes.length - 1] ^= 0xff;
			const corrupted = bytes
				.toString('base64')
				.replace(/\+/g, '-')
				.replace(/\//g, '_')
				.replace(/=+$/, '');
			await expect(decryptToken(corrupted, 'secret')).rejects.toThrow();
		});

		test('invalid base64 input throws', async () => {
			await expect(decryptToken('not-valid-base64!!!', 'secret')).rejects.toThrow();
		});

		test('truncated ciphertext (too short for IV + data) throws', async () => {
			const truncated = 'AAAA';
			await expect(decryptToken(truncated, 'secret')).rejects.toThrow();
		});

		test('empty string input throws', async () => {
			await expect(decryptToken('', 'secret')).rejects.toThrow();
		});
	});
});
