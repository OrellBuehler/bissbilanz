import { describe, test, expect, beforeEach, vi } from 'vitest';
import { expectResponseContract } from '../helpers/contract';
import { adminEvent } from '../helpers/admin';
import { ApiError } from '$lib/server/errors';

const USER_ID = '10000000-0000-4000-8000-0000000000a1';

const USER_ROW = {
	id: USER_ID,
	name: 'Ada',
	email: 'ada@example.com',
	avatarUrl: null,
	isAdmin: false,
	providers: ['google', 'infomaniak'],
	createdAt: '2026-01-01T00:00:00.000Z',
	lastActiveAt: null,
	entryCount: 12,
	openAiTaskCount: 1,
	claude: {
		enabled: true,
		monthlyBudgetUsd: null,
		effectiveBudgetUsd: 10,
		monthSpendUsd: 1.25,
		monthCalls: 4,
		note: null
	}
};

const listAdminUsers = vi.fn();
const getAdminUserDetail = vi.fn();
const updateClaudeAccess = vi.fn();

vi.mock('$lib/server/db', () => ({ getDB: () => ({}) }));
vi.mock('$lib/server/admin/users', () => ({
	listAdminUsers: (...args: unknown[]) => listAdminUsers(...args),
	getAdminUserDetail: (...args: unknown[]) => getAdminUserDetail(...args),
	getClaudeOverview: async () => ({})
}));
vi.mock('$lib/server/admin/claude-access', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/server/admin/claude-access')>();
	return {
		...original,
		updateClaudeAccess: (...args: unknown[]) => updateClaudeAccess(...args)
	};
});

const usersModule = await import('../../src/routes/api/admin/users/+server');
const userModule = await import('../../src/routes/api/admin/users/[id]/+server');
const accessModule = await import('../../src/routes/api/admin/users/[id]/claude-access/+server');

const notAdmins = ['user', 'bearer-admin', 'anonymous'] as const;

beforeEach(() => {
	vi.clearAllMocks();
	listAdminUsers.mockResolvedValue({ users: [USER_ROW], total: 1 });
	getAdminUserDetail.mockResolvedValue({
		user: USER_ROW,
		dailyUsage: [{ date: '2026-10-12', costUsd: 0.5, calls: 2 }],
		recentCalls: [
			{
				id: '10000000-0000-4000-8000-0000000000c1',
				createdAt: '2026-10-12T10:00:00.000Z',
				feature: 'ai_task',
				model: 'claude-opus-5-5',
				status: 'succeeded',
				inputTokens: 100,
				outputTokens: 20,
				cacheReadInputTokens: 0,
				cacheCreationInputTokens: 50,
				costUsd: 0.05,
				errorCode: null,
				aiTaskId: null,
				aiTaskStatus: null
			}
		],
		auditLog: [
			{
				id: '10000000-0000-4000-8000-0000000000d1',
				createdAt: '2026-10-12T09:00:00.000Z',
				action: 'claude_access.grant',
				actorLabel: 'admin@example.com',
				before: { enabled: false, monthlyBudgetUsd: null, note: null },
				after: { enabled: true, monthlyBudgetUsd: null, note: 'friend' }
			}
		]
	});
	updateClaudeAccess.mockResolvedValue({
		enabled: true,
		monthlyBudgetUsd: 5,
		effectiveBudgetUsd: 5,
		note: 'friend',
		grantedAt: '2026-10-12T09:00:00.000Z',
		updatedAt: '2026-10-12T09:00:00.000Z'
	});
});

describe('GET /api/admin/users', () => {
	test.each(notAdmins)('is a 404 for %s and never reaches the query', async (as) => {
		const response = await usersModule.GET(adminEvent({ as }));
		await expectResponseContract('GET', '/api/admin/users', response);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'Not found' });
		expect(listAdminUsers).not.toHaveBeenCalled();
	});

	test('lists users with defaults', async () => {
		const response = await usersModule.GET(adminEvent());
		await expectResponseContract('GET', '/api/admin/users', response);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ users: [USER_ROW], total: 1 });
		expect(listAdminUsers).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				access: 'all',
				sort: 'createdAt',
				order: 'desc',
				limit: 25,
				offset: 0
			})
		);
	});

	test('passes filters, sorting and paging', async () => {
		const response = await usersModule.GET(
			adminEvent({
				searchParams: {
					q: ' ada ',
					access: 'enabled',
					sort: 'monthSpendUsd',
					order: 'asc',
					limit: '10',
					offset: '20'
				}
			})
		);
		expect(response.status).toBe(200);
		expect(listAdminUsers).toHaveBeenCalledWith(expect.anything(), {
			q: 'ada',
			access: 'enabled',
			sort: 'monthSpendUsd',
			order: 'asc',
			limit: 10,
			offset: 20
		});
	});

	test.each<Record<string, string>>([
		{ sort: 'password' },
		{ access: 'maybe' },
		{ order: 'sideways' },
		{ limit: '0' },
		{ limit: '101' },
		{ offset: '-1' },
		{ q: 'x'.repeat(101) }
	])('rejects invalid query %o with 400', async (searchParams) => {
		const response = await usersModule.GET(adminEvent({ searchParams }));
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
		expect(response.status).toBe(400);
		expect(listAdminUsers).not.toHaveBeenCalled();
	});
});

describe('GET /api/admin/users/{id}', () => {
	test.each(notAdmins)('is a 404 for %s', async (as) => {
		const response = await userModule.GET(adminEvent({ as, params: { id: USER_ID } }));
		await expectResponseContract('GET', '/api/admin/users/{id}', response);
		expect(response.status).toBe(404);
		expect(getAdminUserDetail).not.toHaveBeenCalled();
	});

	test('returns the detail with the default window', async () => {
		const response = await userModule.GET(adminEvent({ params: { id: USER_ID } }));
		await expectResponseContract('GET', '/api/admin/users/{id}', response);
		expect(response.status).toBe(200);
		expect(getAdminUserDetail).toHaveBeenCalledWith(expect.anything(), USER_ID, 30);
	});

	test('honours the days window', async () => {
		await userModule.GET(adminEvent({ params: { id: USER_ID }, searchParams: { days: '90' } }));
		expect(getAdminUserDetail).toHaveBeenCalledWith(expect.anything(), USER_ID, 90);
	});

	test.each(['6', '91', 'abc'])('rejects days=%s with 400', async (days) => {
		const response = await userModule.GET(
			adminEvent({ params: { id: USER_ID }, searchParams: { days } })
		);
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
		expect(response.status).toBe(400);
	});

	test('rejects a malformed id with 400', async () => {
		const response = await userModule.GET(adminEvent({ params: { id: 'nope' } }));
		await expectResponseContract('GET', '/api/admin/users/{id}', response);
		expect(response.status).toBe(400);
	});

	test('an unknown user is a 404', async () => {
		getAdminUserDetail.mockRejectedValue(new ApiError(404, 'Not found'));
		const response = await userModule.GET(adminEvent({ params: { id: USER_ID } }));
		await expectResponseContract('GET', '/api/admin/users/{id}', response);
		expect(response.status).toBe(404);
	});
});

describe('PATCH /api/admin/users/{id}/claude-access', () => {
	const patch = (as: Parameters<typeof adminEvent>[0] = {}, body: unknown = { enabled: true }) =>
		adminEvent({ method: 'PATCH', params: { id: USER_ID }, body: body as never, ...as });

	test.each(notAdmins)('is a 404 for %s and writes nothing', async (as) => {
		const response = await accessModule.PATCH(patch({ as }));
		await expectResponseContract('PATCH', '/api/admin/users/{id}/claude-access', response);
		expect(response.status).toBe(404);
		expect(updateClaudeAccess).not.toHaveBeenCalled();
	});

	test('updates access and labels the audit actor with the admin email', async () => {
		const response = await accessModule.PATCH(
			patch({}, { enabled: true, monthlyBudgetUsd: 5, note: 'friend' })
		);
		await expectResponseContract('PATCH', '/api/admin/users/{id}/claude-access', response);
		expect(response.status).toBe(200);
		expect((await response.json()).access.effectiveBudgetUsd).toBe(5);
		expect(updateClaudeAccess).toHaveBeenCalledWith(
			expect.anything(),
			{ userId: expect.any(String), label: 'test@example.com' },
			USER_ID,
			{ enabled: true, monthlyBudgetUsd: 5, note: 'friend' }
		);
	});

	test('accepts a null budget (default) and note', async () => {
		const response = await accessModule.PATCH(patch({}, { monthlyBudgetUsd: null, note: null }));
		expect(response.status).toBe(200);
		expect(updateClaudeAccess).toHaveBeenCalledWith(expect.anything(), expect.anything(), USER_ID, {
			monthlyBudgetUsd: null,
			note: null
		});
	});

	test('falls back to the user id when the admin has no email', async () => {
		const event = patch();
		event.locals.user = { ...event.locals.user!, email: null };
		await accessModule.PATCH(event);
		const actor = updateClaudeAccess.mock.calls[0][1];
		expect(actor.label).toBe(actor.userId);
	});

	test.each([
		{},
		{ monthlyBudgetUsd: -1 },
		{ monthlyBudgetUsd: 1000.01 },
		{ monthlyBudgetUsd: 1.234 },
		{ monthlyBudgetUsd: '5' },
		{ note: 'x'.repeat(501) },
		{ enabled: 'yes' }
	])('rejects body %o with 400', async (body) => {
		const response = await accessModule.PATCH(patch({}, body));
		// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
		expect(response.status).toBe(400);
		expect(updateClaudeAccess).not.toHaveBeenCalled();
	});

	test.each([0, 0.01, 7.5, 1000])('accepts budget %s', async (monthlyBudgetUsd) => {
		const response = await accessModule.PATCH(patch({}, { monthlyBudgetUsd }));
		expect(response.status).toBe(200);
	});

	test('rejects a malformed id with 400', async () => {
		const response = await accessModule.PATCH(
			adminEvent({ method: 'PATCH', params: { id: 'nope' }, body: { enabled: true } })
		);
		await expectResponseContract('PATCH', '/api/admin/users/{id}/claude-access', response);
		expect(response.status).toBe(400);
	});

	test('an unknown user is a 404', async () => {
		updateClaudeAccess.mockRejectedValue(new ApiError(404, 'Not found'));
		const response = await accessModule.PATCH(patch());
		await expectResponseContract('PATCH', '/api/admin/users/{id}/claude-access', response);
		expect(response.status).toBe(404);
	});
});
