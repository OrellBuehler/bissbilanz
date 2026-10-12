import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDB } from '../../helpers/mock-db';

const h = vi.hoisted(() => ({
	captureException: vi.fn(),
	getClaudeEnabled: vi.fn(),
	getMonthSpend: vi.fn(),
	config: {
		model: 'claude-opus-5-5',
		configured: true,
		globalMonthlyBudgetUsd: 90,
		defaultUserBudgetUsd: 10
	}
}));

const { db, queueResults, setResult, reset, getCalls } = createMockDB();

vi.mock('@sentry/sveltekit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sentry/sveltekit')>()),
	captureException: h.captureException
}));
vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/claude/config', () => ({ claudeConfig: () => h.config }));
vi.mock('$lib/server/claude/settings', () => ({ getClaudeEnabled: h.getClaudeEnabled }));
vi.mock('$lib/server/claude/usage', () => ({
	getMonthSpend: h.getMonthSpend,
	effectiveUserBudgetUsd: (access: { monthlyBudgetUsd: number | null } | undefined) =>
		access?.monthlyBudgetUsd ?? h.config.defaultUserBudgetUsd
}));

const budget = await import('$lib/server/claude/budget');
const capability = await import('$lib/server/claude/capability');
const errors = await import('$lib/server/claude/errors');

const input = {
	userId: 'user-1',
	feature: 'ai_task',
	model: 'claude-opus-5-5',
	aiTaskId: 'task-1',
	reservedUsd: 0.4,
	requireClaudeProcessor: true
};

const spend = (user: number, global: number) => {
	h.getMonthSpend.mockImplementation(async (_db: unknown, options?: { userId?: string }) => ({
		spendUsd: options?.userId ? user : global,
		calls: 0
	}));
};

beforeEach(() => {
	reset();
	h.getClaudeEnabled.mockReset().mockResolvedValue(true);
	h.getMonthSpend.mockReset();
	Object.assign(h.config, {
		model: 'claude-opus-5-5',
		configured: true,
		globalMonthlyBudgetUsd: 90,
		defaultUserBudgetUsd: 10
	});
	spend(0, 0);
});

describe('reserveCall', () => {
	const gates = (access: unknown, prefs: unknown, inserted: unknown = [{ id: 'usage-1' }]) =>
		queueResults([[], access, prefs, inserted]);

	test('takes the advisory lock, then inserts a reservation', async () => {
		gates([{ enabled: true, monthlyBudgetUsd: null }], [{ processor: 'claude' }]);
		await expect(budget.reserveCall(input)).resolves.toBe('usage-1');
		const values = getCalls().find((call) => call.method === 'values')!.args[0];
		expect(values).toMatchObject({
			userId: 'user-1',
			feature: 'ai_task',
			model: 'claude-opus-5-5',
			status: 'reserved',
			reservedUsd: 0.4,
			aiTaskId: 'task-1'
		});
	});

	test('does not require the processor for other features and allows a null task', async () => {
		queueResults([[], [{ enabled: true, monthlyBudgetUsd: 5 }], [{ id: 'usage-2' }]]);
		await expect(
			budget.reserveCall({
				...input,
				feature: 'other',
				aiTaskId: undefined,
				requireClaudeProcessor: false
			})
		).resolves.toBe('usage-2');
		expect(getCalls().find((call) => call.method === 'values')!.args[0].aiTaskId).toBeNull();
	});

	test('fails in gate order', async () => {
		h.getClaudeEnabled.mockResolvedValue(false);
		await expect(budget.reserveCall(input)).rejects.toMatchObject({ code: 'disabled' });
		h.getClaudeEnabled.mockResolvedValue(true);

		gates([], []);
		await expect(budget.reserveCall(input)).rejects.toMatchObject({ code: 'no_access' });
		gates([{ enabled: false, monthlyBudgetUsd: null }], []);
		await expect(budget.reserveCall(input)).rejects.toMatchObject({ code: 'no_access' });

		gates([{ enabled: true, monthlyBudgetUsd: null }], [{ processor: 'device' }]);
		await expect(budget.reserveCall(input)).rejects.toBeInstanceOf(
			errors.ClaudeProcessorChangedError
		);
		gates([{ enabled: true, monthlyBudgetUsd: null }], []);
		await expect(budget.reserveCall(input)).rejects.toBeInstanceOf(
			errors.ClaudeProcessorChangedError
		);

		spend(9.7, 0);
		gates([{ enabled: true, monthlyBudgetUsd: null }], [{ processor: 'claude' }]);
		await expect(budget.reserveCall(input)).rejects.toMatchObject({
			code: 'user_budget_exhausted'
		});

		spend(0, 89.7);
		gates([{ enabled: true, monthlyBudgetUsd: null }], [{ processor: 'claude' }]);
		await expect(budget.reserveCall(input)).rejects.toMatchObject({
			code: 'global_budget_exhausted'
		});
	});

	test('allows a reservation that exactly fills the budget', async () => {
		spend(9.6, 89.6);
		gates([{ enabled: true, monthlyBudgetUsd: null }], [{ processor: 'claude' }]);
		await expect(budget.reserveCall(input)).resolves.toBe('usage-1');
	});

	test('fails when the insert returns nothing', async () => {
		gates([{ enabled: true, monthlyBudgetUsd: null }], [{ processor: 'claude' }], []);
		await expect(budget.reserveCall(input)).rejects.toThrow('Failed to reserve');
	});
});

describe('settleCall and abandonStaleReservations', () => {
	test('settleCall writes the settlement and defaults the rest', async () => {
		await budget.settleCall('usage-1', {
			status: 'failed',
			costUsd: 0.2,
			errorCode: 'billing_unknown'
		});
		const patch = getCalls().find((call) => call.method === 'set')!.args[0];
		expect(patch).toMatchObject({
			status: 'failed',
			costUsd: 0.2,
			inputTokens: 0,
			outputTokens: 0,
			cacheReadInputTokens: 0,
			cacheCreationInputTokens: 0,
			errorCode: 'billing_unknown',
			requestId: null
		});
		expect(patch).not.toHaveProperty('model');
		await budget.settleCall('usage-1', {
			status: 'succeeded',
			costUsd: 0.1,
			model: 'claude-haiku-5-5',
			inputTokens: 5,
			requestId: 'req'
		});
		expect(getCalls().filter((call) => call.method === 'set')[1]!.args[0]).toMatchObject({
			model: 'claude-haiku-5-5',
			inputTokens: 5,
			requestId: 'req'
		});
	});

	test('abandonStaleReservations returns how many rows it closed', async () => {
		setResult([{ id: 'a' }, { id: 'b' }]);
		expect(await budget.abandonStaleReservations()).toBe(2);
	});
});

describe('capability', () => {
	const access = (value: unknown) => queueResults([value]);

	test('getClaudeCapability reports the smaller remaining budget', async () => {
		access([{ enabled: true, monthlyBudgetUsd: 5 }]);
		spend(1.234, 0);
		expect(await capability.getClaudeCapability('user-1')).toEqual({
			available: true,
			remainingBudgetUsd: 3.77
		});
		access([{ enabled: true, monthlyBudgetUsd: 5 }]);
		h.config.globalMonthlyBudgetUsd = 3;
		spend(0, 2.7);
		expect(await capability.getClaudeCapability('user-1')).toEqual({
			available: false
		});
	});

	test('is unavailable when any early gate is closed', async () => {
		h.config.configured = false;
		expect(await capability.getClaudeCapability('user-1')).toEqual({ available: false });
		h.config.configured = true;
		h.getClaudeEnabled.mockResolvedValue(false);
		expect(await capability.getClaudeCapability('user-1')).toEqual({ available: false });
		h.getClaudeEnabled.mockResolvedValue(true);
		access([]);
		expect(await capability.getClaudeCapability('user-1')).toEqual({ available: false });
		access([{ enabled: false, monthlyBudgetUsd: null }]);
		expect(await capability.getClaudeCapability('user-1')).toEqual({ available: false });
	});

	test('is unavailable below the minimum task call cost and never reports negative', async () => {
		expect(capability.minTaskCallUsd()).toBe(0.42);
		access([{ enabled: true, monthlyBudgetUsd: 0.41 }]);
		expect(await capability.getClaudeCapability('user-1')).toEqual({ available: false });
		access([{ enabled: true, monthlyBudgetUsd: 0.42 }]);
		expect(await capability.getClaudeCapability('user-1')).toEqual({
			available: true,
			remainingBudgetUsd: 0.42
		});
	});

	test('rethrows unexpected failures while checking', async () => {
		h.getClaudeEnabled.mockRejectedValue(new Error('db down'));
		await expect(capability.getClaudeCapability('user-1')).rejects.toThrow('db down');
	});

	test('getClaudeCapabilitySafe turns a failure into unavailable and reports it', async () => {
		h.getClaudeEnabled.mockRejectedValue(new Error('db down'));
		expect(await capability.getClaudeCapabilitySafe('user-1')).toEqual({ available: false });
		expect(h.captureException).toHaveBeenCalledWith(expect.any(Error), expect.anything());
	});

	test('assertClaudeAllowed checks the gates and the processor', async () => {
		queueResults([[{ enabled: true, monthlyBudgetUsd: null }], [{ processor: 'claude' }]]);
		await expect(capability.assertClaudeAllowed('user-1')).resolves.toBeUndefined();
		queueResults([[{ enabled: true, monthlyBudgetUsd: null }], [{ processor: 'device' }]]);
		await expect(capability.assertClaudeAllowed('user-1')).rejects.toBeInstanceOf(
			errors.ClaudeProcessorChangedError
		);
		queueResults([[{ enabled: false, monthlyBudgetUsd: null }]]);
		await expect(capability.assertClaudeAllowed('user-1')).rejects.toMatchObject({
			code: 'no_access'
		});
	});
});
