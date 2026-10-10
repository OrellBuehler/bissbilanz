import { describe, test, expect, beforeEach, vi } from 'vitest';
import { RateLimitError } from '$lib/server/errors';
import { users } from '$lib/server/schema';
import { createMockEvent } from '../helpers/mock-request-event';
import { expectResponseContract } from '../helpers/contract';
import { TEST_USER } from '../helpers/fixtures';
import { createMockDB } from '../helpers/mock-db';

const { db, setResult, reset } = createMockDB();

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	users
}));

let mockDataRange: any = { earliest: null, latest: null };
let mockDeleteError: Error | null = null;
let mockRateLimitError: Error | null = null;
let mockOnDelete: (() => void) | null = null;

vi.mock('$lib/server/account', () => ({
	getAccountDataRange: async () => mockDataRange,
	deleteAccount: async () => {
		mockOnDelete?.();
		if (mockDeleteError) throw mockDeleteError;
	}
}));

vi.mock('$lib/server/rate-limit', () => ({
	rateLimit: () => {
		if (mockRateLimitError) throw mockRateLimitError;
	}
}));

const { GET, DELETE } = await import('../../src/routes/api/account/+server');

const cookies = { delete: () => {} };

describe('api/account', () => {
	beforeEach(() => {
		reset();
		mockDataRange = { earliest: null, latest: null };
		mockDeleteError = null;
		mockRateLimitError = null;
		mockOnDelete = null;
	});

	describe('GET /api/account', () => {
		test('returns 401 when not authenticated', async () => {
			const response = await GET(createMockEvent({ user: null }));
			await expectResponseContract('GET', '/api/account', response);
			expect(response.status).toBe(401);
		});

		test('returns the account and data range', async () => {
			setResult([
				{
					email: TEST_USER.email,
					name: TEST_USER.name,
					createdAt: new Date('2026-01-01T00:00:00Z')
				}
			]);
			mockDataRange = { earliest: '2026-01-01', latest: '2026-02-01' };
			const response = await GET(createMockEvent({ user: TEST_USER }));
			await expectResponseContract('GET', '/api/account', response);
			const data = await response.json();
			expect(response.status).toBe(200);
			expect(data.user.email).toBe(TEST_USER.email);
			expect(data.dataRange.earliest).toBe('2026-01-01');
		});
	});

	describe('DELETE /api/account', () => {
		test('returns 401 when not authenticated', async () => {
			const event = { ...createMockEvent({ user: null }), cookies };
			const response = await DELETE(event as any);
			await expectResponseContract('DELETE', '/api/account', response);
			expect(response.status).toBe(401);
		});

		test('deletes the account', async () => {
			const event = { ...createMockEvent({ user: TEST_USER }), cookies };
			const response = await DELETE(event as any);
			await expectResponseContract('DELETE', '/api/account', response);
			expect(response.status).toBe(204);
		});

		test('lets the mobile apps delete with their first-party token', async () => {
			const event = {
				...createMockEvent({ user: TEST_USER }),
				locals: { user: TEST_USER, tokenScopes: ['mcp:access', 'account:manage'] },
				cookies
			};
			const response = await DELETE(event as any);
			await expectResponseContract('DELETE', '/api/account', response);
			expect(response.status).toBe(204);
		});

		test('forbids an OAuth/MCP token from deleting the account', async () => {
			let deleted = false;
			mockOnDelete = () => {
				deleted = true;
			};
			const event = {
				...createMockEvent({ user: TEST_USER }),
				locals: { user: TEST_USER, tokenScopes: ['mcp:access'] },
				cookies
			};
			const response = await DELETE(event as any);
			await expectResponseContract('DELETE', '/api/account', response);
			expect(response.status).toBe(403);
			expect(deleted).toBe(false);
		});

		test('answers 429 with Retry-After and does not delete once rate limited', async () => {
			let deleted = false;
			mockOnDelete = () => {
				deleted = true;
			};
			mockRateLimitError = new RateLimitError(42);
			const event = { ...createMockEvent({ user: TEST_USER }), cookies };
			const response = await DELETE(event as any);
			await expectResponseContract('DELETE', '/api/account', response);
			expect(response.status).toBe(429);
			expect(response.headers.get('Retry-After')).toBe('42');
			expect(await response.json()).toEqual({ error: 'Too many requests' });
			expect(deleted).toBe(false);
		});
	});
});
