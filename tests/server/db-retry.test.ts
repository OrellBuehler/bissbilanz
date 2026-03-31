import { describe, test, expect } from 'vitest';
import { isTransientDbError } from '../../src/lib/server/db-retry';

describe('isTransientDbError', () => {
	test('detects idle timeout errors', () => {
		expect(isTransientDbError(new Error('Idle timeout reached after 20s'))).toBe(true);
	});

	test('detects connection terminated', () => {
		expect(isTransientDbError(new Error('Connection terminated unexpectedly'))).toBe(true);
	});

	test('detects connection reset', () => {
		expect(isTransientDbError(new Error('connection reset by peer'))).toBe(true);
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
