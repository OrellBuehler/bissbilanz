import { describe, test, expect, vi, beforeEach } from 'vitest';
import { isTransientDbError } from '../../src/lib/server/db-retry';

describe('isTransientDbError', () => {
	test('detects idle timeout errors', () => {
		expect(isTransientDbError(new Error('Idle timeout reached after 20s'))).toBe(true);
	});

	test('detects connection closed', () => {
		expect(isTransientDbError(new Error('Connection closed'))).toBe(true);
	});

	test('detects connection terminated', () => {
		expect(isTransientDbError(new Error('Connection terminated unexpectedly'))).toBe(true);
	});

	test('detects connection reset', () => {
		expect(isTransientDbError(new Error('connection reset by peer'))).toBe(true);
	});

	test('detects connection refused', () => {
		expect(isTransientDbError(new Error('connection refused'))).toBe(true);
	});

	test('detects broken pipe', () => {
		expect(isTransientDbError(new Error('write EPIPE broken pipe'))).toBe(true);
	});

	test('detects unexpected eof', () => {
		expect(isTransientDbError(new Error('unexpected eof during read'))).toBe(true);
	});

	test('detects errors in cause chain', () => {
		const outer = new Error('DrizzleQueryError');
		outer.cause = new Error('Idle timeout reached after 10s');
		expect(isTransientDbError(outer)).toBe(true);
	});

	test('returns false for non-transient errors', () => {
		expect(isTransientDbError(new Error('unique constraint violation'))).toBe(false);
		expect(isTransientDbError(new Error('syntax error'))).toBe(false);
	});

	test('handles non-Error values', () => {
		expect(isTransientDbError('idle timeout')).toBe(true);
		expect(isTransientDbError('something else')).toBe(false);
		expect(isTransientDbError(null)).toBe(false);
	});
});

// Test withDbRetry logic in isolation (without importing db.ts which pulls in postgres)
describe('withDbRetry logic', () => {
	function createRetry(isTransient: (e: unknown) => boolean) {
		return async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
			try {
				return await fn();
			} catch (error) {
				if (isTransient(error)) {
					return await fn();
				}
				throw error;
			}
		};
	}

	let withRetry: <T>(fn: () => Promise<T>) => Promise<T>;

	beforeEach(() => {
		withRetry = createRetry(isTransientDbError);
	});

	test('returns result on success without retry', async () => {
		const fn = vi.fn().mockResolvedValue('ok');
		const result = await withRetry(fn);
		expect(result).toBe('ok');
		expect(fn).toHaveBeenCalledTimes(1);
		// no retry needed
	});

	test('retries once on transient error and succeeds', async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error('Idle timeout reached after 10s'))
			.mockResolvedValue('recovered');

		const result = await withRetry(fn);
		expect(result).toBe('recovered');
		expect(fn).toHaveBeenCalledTimes(2);
		// retried once
	});

	test('retries once on transient error and throws on second failure', async () => {
		const transientError = new Error('Idle timeout reached after 10s');
		const fn = vi.fn().mockRejectedValue(transientError);

		await expect(withRetry(fn)).rejects.toThrow('Idle timeout reached after 10s');
		expect(fn).toHaveBeenCalledTimes(2);
		// retried once
	});

	test('throws immediately on non-transient error without retry', async () => {
		const fn = vi.fn().mockRejectedValue(new Error('syntax error'));

		await expect(withRetry(fn)).rejects.toThrow('syntax error');
		expect(fn).toHaveBeenCalledTimes(1);
		// no retry needed
	});
});
