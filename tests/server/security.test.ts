import { describe, expect, test } from 'vitest';
import { assertSameOrigin } from '../../src/lib/server/security';

describe('assertSameOrigin', () => {
	test('throws when origin mismatches', () => {
		expect(() => assertSameOrigin('https://evil.com', 'https://app.local')).toThrow();
	});

	test('does not throw when origin matches', () => {
		expect(() => assertSameOrigin('https://app.local', 'https://app.local')).not.toThrow();
	});

	test('throws when origin is null', () => {
		expect(() => assertSameOrigin(null, 'https://app.local')).toThrow('Missing origin');
	});

	test('is case sensitive', () => {
		expect(() => assertSameOrigin('https://App.Local', 'https://app.local')).toThrow();
	});
});
