import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	rateLimit,
	rateLimitApi,
	rateLimitBulk,
	rateLimitMcp,
	rateLimitUpload,
	rateLimitWrite
} from '../../src/lib/server/rate-limit';

describe('rateLimit', () => {
	test('blocks after max attempts', () => {
		const key = 'ip:1';
		for (let i = 0; i < 5; i++) rateLimit(key, 5, 60_000);
		expect(() => rateLimit(key, 5, 60_000)).toThrow();
	});
});

describe('rateLimitApi', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test('allows calls under the limit', () => {
		const userId = `api-user-under-${Date.now()}`;
		expect(() => {
			for (let i = 0; i < 119; i++) rateLimitApi(userId);
		}).not.toThrow();
	});

	test('allows call at the limit', () => {
		const userId = `api-user-at-${Date.now()}`;
		expect(() => {
			for (let i = 0; i < 120; i++) rateLimitApi(userId);
		}).not.toThrow();
	});

	test('throws on call over the limit', () => {
		const userId = `api-user-over-${Date.now()}`;
		for (let i = 0; i < 120; i++) rateLimitApi(userId);
		expect(() => rateLimitApi(userId)).toThrow('Rate limit exceeded');
	});

	test('resets after window expires', () => {
		const userId = `api-user-reset-${Date.now()}`;
		for (let i = 0; i < 120; i++) rateLimitApi(userId);
		expect(() => rateLimitApi(userId)).toThrow();
		vi.advanceTimersByTime(60_001);
		expect(() => rateLimitApi(userId)).not.toThrow();
	});
});

describe('rateLimitUpload', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test('allows calls under the limit', () => {
		const userId = `upload-user-under-${Date.now()}`;
		expect(() => {
			for (let i = 0; i < 29; i++) rateLimitUpload(userId);
		}).not.toThrow();
	});

	test('allows call at the limit', () => {
		const userId = `upload-user-at-${Date.now()}`;
		expect(() => {
			for (let i = 0; i < 30; i++) rateLimitUpload(userId);
		}).not.toThrow();
	});

	test('throws on call over the limit', () => {
		const userId = `upload-user-over-${Date.now()}`;
		for (let i = 0; i < 30; i++) rateLimitUpload(userId);
		expect(() => rateLimitUpload(userId)).toThrow('Rate limit exceeded');
	});

	test('resets after window expires', () => {
		const userId = `upload-user-reset-${Date.now()}`;
		for (let i = 0; i < 30; i++) rateLimitUpload(userId);
		expect(() => rateLimitUpload(userId)).toThrow();
		vi.advanceTimersByTime(60_001);
		expect(() => rateLimitUpload(userId)).not.toThrow();
	});
});

describe('rateLimitMcp', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test('allows calls under the limit', () => {
		const userId = `mcp-user-under-${Date.now()}`;
		expect(() => {
			for (let i = 0; i < 299; i++) rateLimitMcp(userId);
		}).not.toThrow();
	});

	test('allows call at the limit', () => {
		const userId = `mcp-user-at-${Date.now()}`;
		expect(() => {
			for (let i = 0; i < 300; i++) rateLimitMcp(userId);
		}).not.toThrow();
	});

	test('throws on call over the limit', () => {
		const userId = `mcp-user-over-${Date.now()}`;
		for (let i = 0; i < 300; i++) rateLimitMcp(userId);
		expect(() => rateLimitMcp(userId)).toThrow('Rate limit exceeded');
	});

	test('resets after window expires', () => {
		const userId = `mcp-user-reset-${Date.now()}`;
		for (let i = 0; i < 300; i++) rateLimitMcp(userId);
		expect(() => rateLimitMcp(userId)).toThrow();
		vi.advanceTimersByTime(60_001);
		expect(() => rateLimitMcp(userId)).not.toThrow();
	});
});

describe('cleanup of stale buckets', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test('stale buckets are cleaned up after 100 calls', () => {
		const expiredKey = `cleanup-expired-${Date.now()}`;
		rateLimit(expiredKey, 5, 1_000);
		vi.advanceTimersByTime(2_000);
		for (let i = 0; i < 100; i++) {
			rateLimit(`cleanup-filler-${i}-${Date.now()}`, 5, 60_000);
		}
		expect(() => {
			for (let i = 0; i < 5; i++) rateLimit(expiredKey, 5, 60_000);
		}).not.toThrow();
	});
});

describe('rateLimitWrite buckets', () => {
	const exhaust = (userId: string, pathname: string, calls: number) => {
		for (let i = 0; i < calls; i++) rateLimitWrite(userId, pathname);
	};

	test('bulk food creates get their own 30/min bucket', () => {
		const userId = `bulk-own-${Date.now()}`;
		exhaust(userId, '/api/foods/bulk', 30);
		expect(() => rateLimitWrite(userId, '/api/foods/bulk')).toThrow('Rate limit exceeded');
		expect(() => rateLimitBulk(userId)).toThrow('Rate limit exceeded');
	});

	test('bulk calls leave the general write and image buckets alone', () => {
		const userId = `bulk-isolated-${Date.now()}`;
		exhaust(userId, '/api/foods/bulk', 30);
		expect(() => exhaust(userId, '/api/foods', 120)).not.toThrow();
		expect(() => exhaust(userId, '/api/images/upload', 30)).not.toThrow();
	});

	test('general writes and image uploads do not eat the bulk bucket', () => {
		const userId = `bulk-untouched-${Date.now()}`;
		exhaust(userId, '/api/foods', 120);
		expect(() => rateLimitWrite(userId, '/api/foods')).toThrow('Rate limit exceeded');
		exhaust(userId, '/api/ai-tasks/photo', 30);
		expect(() => exhaust(userId, '/api/foods/bulk', 30)).not.toThrow();
	});

	test('only the exact bulk path uses the bulk bucket', () => {
		const userId = `bulk-exact-${Date.now()}`;
		exhaust(userId, '/api/foods/bulk', 30);
		expect(() => rateLimitWrite(userId, '/api/foods/batch')).not.toThrow();
		expect(() => rateLimitWrite(userId, '/api/foods/bulk/')).toThrow();
	});

	test('image uploads keep their 30/min bucket', () => {
		const userId = `upload-bucket-${Date.now()}`;
		exhaust(userId, '/api/images/upload', 30);
		expect(() => rateLimitWrite(userId, '/api/images/upload')).toThrow();
		expect(() => rateLimitWrite(userId, '/api/ai-tasks/photo')).toThrow();
		expect(() => rateLimitUpload(userId)).toThrow();
	});
});
