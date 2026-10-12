import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	AdminRequestError,
	fetchClaudeOverview,
	fetchUserDetail,
	fetchUsers,
	isUnexpectedFailure,
	patchClaudeAccess,
	patchKillSwitch,
	runOptimistic
} from '$lib/components/admin/admin-api';

vi.hoisted(() => {
	const NativeRequest = Request;
	globalThis.Request = class extends NativeRequest {
		constructor(input: RequestInfo | URL, init?: RequestInit) {
			super(
				typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input,
				init
			);
		}
	} as typeof Request;
});

const USER_ID = '10000000-0000-4000-8000-0000000000a1';

const requests: Request[] = [];

function mockFetch(status: number, body: unknown) {
	requests.length = 0;
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: Request) => {
			requests.push(input);
			return new Response(JSON.stringify(body), {
				status,
				headers: { 'content-type': 'application/json' }
			});
		})
	);
}

afterEach(() => vi.unstubAllGlobals());

const listParams = {
	q: ' ada ',
	access: 'enabled',
	sort: 'monthSpendUsd',
	order: 'asc',
	limit: 25,
	offset: 50
} as const;

describe('admin requests', () => {
	test('fetchUsers sends the filters as a query string and trims the search', async () => {
		mockFetch(200, { users: [], total: 0 });
		expect(await fetchUsers(listParams)).toEqual({ users: [], total: 0 });
		const url = new URL(requests[0].url);
		expect(url.pathname).toBe('/api/admin/users');
		expect(Object.fromEntries(url.searchParams)).toEqual({
			q: 'ada',
			access: 'enabled',
			sort: 'monthSpendUsd',
			order: 'asc',
			limit: '25',
			offset: '50'
		});
	});

	test('fetchUsers omits an empty search', async () => {
		mockFetch(200, { users: [], total: 0 });
		await fetchUsers({ ...listParams, q: '  ' });
		expect(new URL(requests[0].url).searchParams.has('q')).toBe(false);
	});

	test('fetchUserDetail passes the id and the day window', async () => {
		mockFetch(200, { user: {}, dailyUsage: [], recentCalls: [], auditLog: [] });
		await fetchUserDetail(USER_ID, 90);
		const url = new URL(requests[0].url);
		expect(url.pathname).toBe(`/api/admin/users/${USER_ID}`);
		expect(url.searchParams.get('days')).toBe('90');
	});

	test('patchClaudeAccess returns the access object and sends the body', async () => {
		const access = { enabled: true, monthlyBudgetUsd: 5, effectiveBudgetUsd: 5 };
		mockFetch(200, { access });
		expect(await patchClaudeAccess(USER_ID, { monthlyBudgetUsd: 5 })).toEqual(access);
		expect(requests[0].method).toBe('PATCH');
		expect(new URL(requests[0].url).pathname).toBe(`/api/admin/users/${USER_ID}/claude-access`);
		expect(await requests[0].json()).toEqual({ monthlyBudgetUsd: 5 });
	});

	test('patchKillSwitch returns the new state', async () => {
		mockFetch(200, { enabled: true });
		expect(await patchKillSwitch(true)).toBe(true);
		expect(await requests[0].json()).toEqual({ enabled: true });
	});

	test('fetchClaudeOverview returns the overview', async () => {
		mockFetch(200, { configured: true });
		expect(await fetchClaudeOverview()).toEqual({ configured: true });
	});

	test.each([
		[404, { error: 'Not found' }, 'Not found'],
		[400, { error: 'Validation failed' }, 'Validation failed'],
		[500, {}, undefined]
	])('a %s response throws an AdminRequestError', async (status, body, message) => {
		mockFetch(status, body);
		const error = await patchKillSwitch(true).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AdminRequestError);
		expect((error as AdminRequestError).status).toBe(status);
		if (message) expect((error as AdminRequestError).message).toBe(message);
	});
});

describe('runOptimistic', () => {
	test('applies first and keeps the change on success', async () => {
		const calls: string[] = [];
		const result = await runOptimistic({
			apply: () => calls.push('apply'),
			rollback: () => calls.push('rollback'),
			request: async () => {
				calls.push('request');
				return 42;
			}
		});
		expect(result).toBe(42);
		expect(calls).toEqual(['apply', 'request']);
	});

	test('rolls back and rethrows when the request fails', async () => {
		const calls: string[] = [];
		const failure = new AdminRequestError(500);
		await expect(
			runOptimistic({
				apply: () => calls.push('apply'),
				rollback: () => calls.push('rollback'),
				request: async () => {
					throw failure;
				}
			})
		).rejects.toBe(failure);
		expect(calls).toEqual(['apply', 'rollback']);
	});
});

describe('isUnexpectedFailure', () => {
	test('only server errors and non-HTTP failures are worth reporting', () => {
		expect(isUnexpectedFailure(new AdminRequestError(404))).toBe(false);
		expect(isUnexpectedFailure(new AdminRequestError(400))).toBe(false);
		expect(isUnexpectedFailure(new AdminRequestError(500))).toBe(true);
		expect(isUnexpectedFailure(new TypeError('Failed to fetch'))).toBe(true);
	});
});
