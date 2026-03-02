import { describe, expect, test } from 'vitest';
import { assertSameOrigin } from '../../src/lib/server/security';

describe('assertSameOrigin', () => {
	test('throws when origin mismatches', () => {
		expect(() => assertSameOrigin('https://evil.com', 'https://app.local')).toThrow();
	});
});
