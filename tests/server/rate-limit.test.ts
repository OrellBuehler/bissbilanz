import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	rateLimit,
	rateLimitApi,
	rateLimitMcp,
	rateLimitUpload
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
