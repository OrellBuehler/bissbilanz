import { describe, it, expect } from 'vitest';
import { rateLimit } from './rate-limit';
import { ApiError } from './errors';

describe('rateLimit', () => {
	it('does not throw while under the limit', () => {
		expect(() => {
			for (let i = 0; i < 3; i++) rateLimit('under-limit', 3, 60_000);
		}).not.toThrow();
	});

	it('throws an ApiError with status 429 once the limit is exceeded', () => {
		for (let i = 0; i < 3; i++) rateLimit('over-limit', 3, 60_000);

		let caught: unknown;
		try {
			rateLimit('over-limit', 3, 60_000);
		} catch (e) {
			caught = e;
		}

		expect(caught).toBeInstanceOf(ApiError);
		expect((caught as ApiError).status).toBe(429);
	});
});
