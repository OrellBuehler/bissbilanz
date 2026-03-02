import { describe, expect, test } from 'vitest';
import { rateLimit } from '../../src/lib/server/rate-limit';

describe('rateLimit', () => {
	test('blocks after max attempts', () => {
		const key = 'ip:1';
		for (let i = 0; i < 5; i++) rateLimit(key, 5, 60_000);
		expect(() => rateLimit(key, 5, 60_000)).toThrow();
	});
});
