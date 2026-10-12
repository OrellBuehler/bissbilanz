import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { expectResponseContract } from '../helpers/contract';
import { adminEvent } from '../helpers/admin';
import { onClaudeAccessChanged } from '$lib/server/claude/events';

const OVERVIEW = {
	configured: true,
	enabled: false,
	model: 'claude-opus-5-5',
	monthStart: '2026-10-01T00:00:00.000Z',
	globalBudgetUsd: 90,
	defaultUserBudgetUsd: 10,
	monthSpendUsd: 12.5,
	monthCalls: 31,
	openReservations: 1,
	topUsers: [{ userId: null, name: null, email: null, spendUsd: 2, calls: 3 }],
	runs: { queued: 1, running: 0, retryWait: 0, blocked: 2, proposed: 0, dismissedThisMonth: 4 }
};

const getClaudeOverview = vi.fn();
const setClaudeEnabled = vi.fn();

vi.mock('$lib/server/db', () => ({ getDB: () => ({}) }));
vi.mock('$lib/server/admin/users', () => ({
	getClaudeOverview: (...args: unknown[]) => getClaudeOverview(...args),
	listAdminUsers: async () => ({}),
	getAdminUserDetail: async () => ({})
}));
vi.mock('$lib/server/claude/settings', () => ({
	setClaudeEnabled: (...args: unknown[]) => setClaudeEnabled(...args),
	getClaudeEnabled: async () => false
}));

const claudeModule = await import('../../src/routes/api/admin/claude/+server');

const notAdmins = ['user', 'bearer-admin', 'anonymous'] as const;

const changes: unknown[] = [];
let unsubscribe: () => void;

beforeEach(() => {
	vi.clearAllMocks();
	changes.length = 0;
	unsubscribe = onClaudeAccessChanged((change) => {
		changes.push(change);
	});
	getClaudeOverview.mockResolvedValue(OVERVIEW);
	setClaudeEnabled.mockResolvedValue({ changed: true });
});

afterEach(() => unsubscribe());

describe('GET /api/admin/claude', () => {
	test.each(notAdmins)('is a 404 for %s', async (as) => {
		const response = await claudeModule.GET(adminEvent({ as }));
		await expectResponseContract('GET', '/api/admin/claude', response);
		expect(response.status).toBe(404);
		expect(getClaudeOverview).not.toHaveBeenCalled();
	});

	test('returns the overview', async () => {
		const response = await claudeModule.GET(adminEvent());
		await expectResponseContract('GET', '/api/admin/claude', response);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(OVERVIEW);
	});
});

describe('PATCH /api/admin/claude', () => {
	const patch = (body: unknown, as: Parameters<typeof adminEvent>[0] = {}) =>
		adminEvent({ method: 'PATCH', body: body as never, ...as });

	test.each(notAdmins)('is a 404 for %s and changes nothing', async (as) => {
		const response = await claudeModule.PATCH(patch({ enabled: true }, { as }));
		await expectResponseContract('PATCH', '/api/admin/claude', response);
		expect(response.status).toBe(404);
		expect(setClaudeEnabled).not.toHaveBeenCalled();
		expect(changes).toEqual([]);
	});

	test('flips the kill switch and tells running work to re-check access', async () => {
		const response = await claudeModule.PATCH(patch({ enabled: true }));
		await expectResponseContract('PATCH', '/api/admin/claude', response);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ enabled: true });
		expect(setClaudeEnabled).toHaveBeenCalledWith(
			expect.anything(),
			{ userId: expect.any(String), label: 'test@example.com' },
			true
		);
		expect(changes).toEqual([{}]);
	});

	test('does not emit when nothing changed', async () => {
		setClaudeEnabled.mockResolvedValue({ changed: false });
		const response = await claudeModule.PATCH(patch({ enabled: false }));
		expect(response.status).toBe(200);
		expect(changes).toEqual([]);
	});

	test.each([{}, { enabled: 'on' }, { enabled: null }])(
		'rejects body %o with 400',
		async (body) => {
			const response = await claudeModule.PATCH(patch(body));
			// Not asserted: details is ZodError#format()'s recursive tree, which validationErrorResponseSchema can't describe without oasdiff flagging a breaking change (see shared.ts).
			expect(response.status).toBe(400);
			expect(setClaudeEnabled).not.toHaveBeenCalled();
		}
	);

	test('rejects a body that is not JSON with 400', async () => {
		const event = adminEvent({ method: 'PATCH' });
		const response = await claudeModule.PATCH({
			...event,
			request: new Request('http://localhost:5173/api/admin/claude', {
				method: 'PATCH',
				body: '{nope'
			})
		} as never);
		await expectResponseContract('PATCH', '/api/admin/claude', response);
		expect(response.status).toBe(400);
	});
});

describe('admin responses never carry the API key', () => {
	test('overview and settings bodies contain no apiKey or sk- value', async () => {
		const overview = await (await claudeModule.GET(adminEvent())).text();
		const settings = await (
			await claudeModule.PATCH(adminEvent({ method: 'PATCH', body: { enabled: true } }))
		).text();
		for (const body of [overview, settings]) {
			expect(body).not.toMatch(/apiKey|api_key|sk-/i);
		}
	});
});
