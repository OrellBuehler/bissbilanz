import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/sveltekit';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { claudeUsage, users } from '$lib/server/schema';
import { closeTestDB, createTestDatabase, dropTestDatabase, runTestMigrations } from './helpers';
import {
	TEST_API_KEY,
	claudeConfigMock,
	claudeTestConfig,
	createFakeClaude,
	message,
	openPool,
	resetClaudeTestConfig,
	seedUser,
	setKillSwitch,
	textBlock,
	type PoolDB
} from './claude-helpers';

vi.mock('@sentry/sveltekit', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sentry/sveltekit')>()),
	captureException: vi.fn(),
	addBreadcrumb: vi.fn()
}));

const DB_NAME = `test_claude_budget_${randomUUID().replaceAll('-', '')}`;
let dbUrl: string;
let db: PoolDB;
let closePool: () => Promise<void>;
let callModule: typeof import('$lib/server/claude/call');
let budget: typeof import('$lib/server/claude/budget');
let capability: typeof import('$lib/server/claude/capability');
let pricing: typeof import('$lib/server/claude/pricing');
let errors: typeof import('$lib/server/claude/errors');
let constants: typeof import('$lib/server/claude/constants');
let usage: typeof import('$lib/server/claude/usage');

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	const pool = openPool(dbUrl, 5);
	db = pool.db;
	closePool = async () => {
		await pool.client.end();
	};
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
	vi.doMock('$lib/server/claude/config', claudeConfigMock);
	callModule = await import('$lib/server/claude/call');
	budget = await import('$lib/server/claude/budget');
	capability = await import('$lib/server/claude/capability');
	pricing = await import('$lib/server/claude/pricing');
	errors = await import('$lib/server/claude/errors');
	constants = await import('$lib/server/claude/constants');
	usage = await import('$lib/server/claude/usage');
});

afterAll(async () => {
	callModule?.setClaudeClientForTests(null);
	await closePool?.();
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

beforeEach(async () => {
	resetClaudeTestConfig();
	vi.mocked(Sentry.captureException).mockClear();
	await db.delete(claudeUsage);
	await setKillSwitch(db, true);
});

const params = () => ({
	system: [{ type: 'text' as const, text: 'system prompt' }],
	tools: [],
	messages: [{ role: 'user' as const, content: 'log my lunch' }]
});

const call = (userId: string, extra: Record<string, unknown> = {}) =>
	callModule.callClaude({
		userId,
		feature: 'test',
		params: params(),
		imageCount: 0,
		...extra
	});

const reservation = () =>
	pricing.maxCallCostUsd(
		claudeTestConfig.model,
		callModule.estimateInputTokens(params(), 0),
		constants.TASK_MAX_TOKENS
	);

const usageRows = () => db.select().from(claudeUsage);

const ok = () => message([textBlock('done')], 'end_turn');

describe('gates', () => {
	it('rejects without a key before touching the database or the client', async () => {
		const user = await seedUser(db);
		const fake = createFakeClaude([ok()]);
		callModule.setClaudeClientForTests(fake);
		claudeTestConfig.configured = false;
		await expect(call(user.id)).rejects.toMatchObject({ code: 'not_configured' });
		expect(fake.calls).toHaveLength(0);
		expect(await usageRows()).toHaveLength(0);
	});

	it('checks the kill switch before access', async () => {
		const user = await seedUser(db, { access: null });
		const fake = createFakeClaude([ok()]);
		callModule.setClaudeClientForTests(fake);
		await setKillSwitch(db, false);
		await expect(call(user.id)).rejects.toMatchObject({ code: 'disabled' });
		expect(fake.calls).toHaveLength(0);
	});

	it('treats a missing kill switch row as off', async () => {
		const user = await seedUser(db);
		callModule.setClaudeClientForTests(createFakeClaude([ok()]));
		await db.execute(sql`DELETE FROM app_settings WHERE key = 'claude_enabled'`);
		await expect(call(user.id)).rejects.toMatchObject({ code: 'disabled' });
	});

	it('rejects users without an access row and users with disabled access', async () => {
		const none = await seedUser(db, { access: null });
		const off = await seedUser(db, { access: false });
		const fake = createFakeClaude([ok(), ok()]);
		callModule.setClaudeClientForTests(fake);
		await expect(call(none.id)).rejects.toMatchObject({ code: 'no_access' });
		await expect(call(off.id)).rejects.toMatchObject({ code: 'no_access' });
		expect(fake.calls).toHaveLength(0);
		expect(await usageRows()).toHaveLength(0);
	});

	it('checks access before the user budget', async () => {
		const user = await seedUser(db, { access: false, budget: 0 });
		callModule.setClaudeClientForTests(createFakeClaude([ok()]));
		await expect(call(user.id)).rejects.toMatchObject({ code: 'no_access' });
	});

	it('rejects the ai_task feature once the processor is no longer claude', async () => {
		const user = await seedUser(db, { processor: 'assistant' });
		const fake = createFakeClaude([ok()]);
		callModule.setClaudeClientForTests(fake);
		await expect(call(user.id, { feature: 'ai_task' })).rejects.toBeInstanceOf(
			errors.ClaudeProcessorChangedError
		);
		expect(fake.calls).toHaveLength(0);
		expect(await usageRows()).toHaveLength(0);
	});

	it('rejects when the user budget cannot cover the reservation', async () => {
		const user = await seedUser(db, { budget: 0.1 });
		const fake = createFakeClaude([ok()]);
		callModule.setClaudeClientForTests(fake);
		await expect(call(user.id)).rejects.toMatchObject({ code: 'user_budget_exhausted' });
		expect(fake.calls).toHaveLength(0);
	});

	it('falls back to the default user budget without a per-user budget', async () => {
		const user = await seedUser(db, { budget: null });
		claudeTestConfig.defaultUserBudgetUsd = 0.1;
		callModule.setClaudeClientForTests(createFakeClaude([ok()]));
		await expect(call(user.id)).rejects.toMatchObject({ code: 'user_budget_exhausted' });
	});

	it('rejects when the global budget cannot cover the reservation', async () => {
		const user = await seedUser(db);
		claudeTestConfig.globalMonthlyBudgetUsd = 0.1;
		callModule.setClaudeClientForTests(createFakeClaude([ok()]));
		await expect(call(user.id)).rejects.toMatchObject({ code: 'global_budget_exhausted' });
	});

	it('checks the user budget before the global one', async () => {
		const user = await seedUser(db, { budget: 0.1 });
		claudeTestConfig.globalMonthlyBudgetUsd = 0.1;
		callModule.setClaudeClientForTests(createFakeClaude([ok()]));
		await expect(call(user.id)).rejects.toMatchObject({ code: 'user_budget_exhausted' });
	});

	it('revoking access takes effect on the next call', async () => {
		const user = await seedUser(db);
		callModule.setClaudeClientForTests(createFakeClaude([ok(), ok()]));
		await call(user.id);
		await db.execute(sql`UPDATE claude_access SET enabled = false WHERE user_id = ${user.id}`);
		await expect(call(user.id)).rejects.toMatchObject({ code: 'no_access' });
	});
});

describe('reservation and settlement', () => {
	it('reserves the maximum cost and settles with the real usage', async () => {
		const user = await seedUser(db);
		const response = message([textBlock('hi')], 'end_turn', {
			usage: {
				input_tokens: 2000,
				output_tokens: 500,
				cache_read_input_tokens: 10_000,
				cache_creation_input_tokens: 1000
			}
		});
		callModule.setClaudeClientForTests(createFakeClaude([response]));
		await call(user.id, { aiTaskId: undefined });
		const [row] = await usageRows();
		expect(row?.status).toBe('succeeded');
		expect(row?.reservedUsd).toBeCloseTo(reservation(), 6);
		expect(row?.costUsd).toBeCloseTo((2000 * 4 + 500 * 20 + 10_000 * 0.2 + 1000 * 5) / 1e6, 6);
		expect(row?.inputTokens).toBe(2000);
		expect(row?.outputTokens).toBe(500);
		expect(row?.cacheReadInputTokens).toBe(10_000);
		expect(row?.cacheCreationInputTokens).toBe(1000);
		expect(row?.settledAt).not.toBeNull();
		expect(row?.userId).toBe(user.id);
	});

	it('prices by the model the response reports', async () => {
		const user = await seedUser(db);
		callModule.setClaudeClientForTests(
			createFakeClaude([
				message([textBlock('a')], 'end_turn', { model: 'claude-haiku-5-5' }),
				message([textBlock('b')], 'end_turn', { model: 'claude-some-future-model' })
			])
		);
		await call(user.id);
		await call(user.id);
		const rows = (await usageRows()).sort((a, b) => a.model.localeCompare(b.model));
		const haiku = rows.find((row) => row.model === 'claude-haiku-5-5');
		const unknown = rows.find((row) => row.model === 'claude-some-future-model');
		expect(haiku?.costUsd).toBeCloseTo((1000 * 0.1 + 200 * 0.5) / 1e6, 6);
		expect(unknown?.costUsd).toBeCloseTo((1000 * 10 + 200 * 50) / 1e6, 6);
	});

	it('records an API error as failed at zero cost and maps it without request details', async () => {
		const user = await seedUser(db);
		const secret = `${TEST_API_KEY} user said: secret lunch`;
		callModule.setClaudeClientForTests(
			createFakeClaude([
				new Anthropic.BadRequestError(
					400,
					{ type: 'error', error: { type: 'invalid_request_error', message: secret } },
					secret,
					new Headers({ 'request-id': 'req_123' })
				)
			])
		);
		const error = await call(user.id).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(errors.ClaudeApiError);
		expect(error).toMatchObject({ kind: 'invalid_request', status: 400, retryable: false });
		expect(String((error as Error).message)).not.toContain('secret');
		const [row] = await usageRows();
		expect(row).toMatchObject({ status: 'failed', costUsd: 0, errorCode: 'invalid_request' });
		expect(row?.settledAt).not.toBeNull();
		const captured = JSON.stringify(vi.mocked(Sentry.captureException).mock.calls);
		expect(captured).not.toContain(TEST_API_KEY);
		expect(captured).not.toContain('secret lunch');
		expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1);
	});

	it('does not report retryable API errors to Sentry as exceptions', async () => {
		const user = await seedUser(db);
		callModule.setClaudeClientForTests(
			createFakeClaude([
				new Anthropic.RateLimitError(
					429,
					{ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } },
					'slow down',
					new Headers()
				)
			])
		);
		await expect(call(user.id)).rejects.toMatchObject({ kind: 'rate_limited', retryable: true });
		expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled();
		const [row] = await usageRows();
		expect(row).toMatchObject({ status: 'failed', costUsd: 0, errorCode: 'rate_limited' });
	});

	it.each([
		['timeout', () => new Anthropic.APIConnectionTimeoutError({ message: 'timed out' }), 'timeout'],
		['connection', () => new Anthropic.APIConnectionError({ message: 'reset' }), 'connection']
	])('charges the reservation when the outcome is unknown (%s)', async (_name, make, kind) => {
		const user = await seedUser(db);
		callModule.setClaudeClientForTests(createFakeClaude([make()]));
		await expect(call(user.id)).rejects.toMatchObject({ kind, retryable: true });
		const [row] = await usageRows();
		expect(row?.status).toBe('failed');
		expect(row?.errorCode).toBe('billing_unknown');
		expect(row?.costUsd).toBeCloseTo(reservation(), 6);
	});

	it('charges the reservation when an in-flight call is aborted', async () => {
		const user = await seedUser(db);
		const controller = new AbortController();
		callModule.setClaudeClientForTests(
			createFakeClaude([
				async (_params, options) => {
					setTimeout(() => controller.abort(), 20);
					return new Promise((_resolve, reject) => {
						options.signal?.addEventListener('abort', () =>
							reject(new Anthropic.APIUserAbortError())
						);
					});
				}
			])
		);
		await expect(call(user.id, { signal: controller.signal })).rejects.toBeInstanceOf(
			errors.ClaudeAbortedError
		);
		const [row] = await usageRows();
		expect(row?.errorCode).toBe('billing_unknown');
		expect(row?.costUsd).toBeCloseTo(reservation(), 6);
	});

	it('charges nothing when the request was never sent', async () => {
		const user = await seedUser(db);
		const fake = createFakeClaude([ok()]);
		callModule.setClaudeClientForTests(fake);
		const controller = new AbortController();
		controller.abort();
		await expect(call(user.id, { signal: controller.signal })).rejects.toBeInstanceOf(
			errors.ClaudeAbortedError
		);
		expect(fake.calls).toHaveLength(0);
		const [row] = await usageRows();
		expect(row).toMatchObject({ status: 'failed', costUsd: 0, errorCode: 'not_sent' });
	});

	it('records unexpected client failures after sending at the reserved cost', async () => {
		const user = await seedUser(db);
		callModule.setClaudeClientForTests(createFakeClaude([new TypeError('boom')]));
		await expect(call(user.id)).rejects.toBeInstanceOf(TypeError);
		const [row] = await usageRows();
		expect(row?.errorCode).toBe('billing_unknown');
		expect(row?.costUsd).toBeCloseTo(reservation(), 6);
	});

	it('abandons stale reservations at their reserved cost', async () => {
		const user = await seedUser(db);
		const [stale, fresh] = await db
			.insert(claudeUsage)
			.values([
				{
					userId: user.id,
					feature: 'test',
					model: 'claude-opus-5-5',
					reservedUsd: 0.3,
					createdAt: sql`now() - interval '11 minutes'`
				},
				{ userId: user.id, feature: 'test', model: 'claude-opus-5-5', reservedUsd: 0.3 }
			])
			.returning();
		expect(await budget.abandonStaleReservations()).toBe(1);
		const rows = await usageRows();
		const staleRow = rows.find((row) => row.id === stale!.id);
		const freshRow = rows.find((row) => row.id === fresh!.id);
		expect(staleRow).toMatchObject({ status: 'abandoned', costUsd: 0.3 });
		expect(staleRow?.settledAt).not.toBeNull();
		expect(freshRow?.status).toBe('reserved');
	});
});

describe('month and accounts', () => {
	it('ignores rows from the previous UTC month', async () => {
		const user = await seedUser(db, { budget: 1 });
		await db.insert(claudeUsage).values({
			userId: user.id,
			feature: 'test',
			model: 'claude-opus-5-5',
			status: 'succeeded',
			costUsd: 500,
			createdAt: sql`${usage.MONTH_START_SQL} - interval '1 second'`
		});
		callModule.setClaudeClientForTests(createFakeClaude([ok()]));
		await expect(call(user.id)).resolves.toBeDefined();
		const spend = await usage.getMonthSpend(db, { userId: user.id });
		expect(spend.calls).toBe(1);
	});

	it('counts open reservations at their estimate and settled rows at cost', async () => {
		const user = await seedUser(db, { budget: 1 });
		await db.insert(claudeUsage).values([
			{ userId: user.id, feature: 'test', model: 'claude-opus-5-5', reservedUsd: 0.7 },
			{
				userId: user.id,
				feature: 'test',
				model: 'claude-opus-5-5',
				status: 'succeeded',
				reservedUsd: 5,
				costUsd: 0.1
			}
		]);
		expect((await usage.getMonthSpend(db, { userId: user.id })).spendUsd).toBeCloseTo(0.8, 6);
		callModule.setClaudeClientForTests(createFakeClaude([ok()]));
		await expect(call(user.id)).rejects.toMatchObject({ code: 'user_budget_exhausted' });
	});

	it('keeps spend in the global total after the account is deleted', async () => {
		const user = await seedUser(db);
		callModule.setClaudeClientForTests(createFakeClaude([ok()]));
		await call(user.id);
		const before = (await usage.getMonthSpend(db)).spendUsd;
		await db.delete(users).where(eq(users.id, user.id));
		const [row] = await usageRows();
		expect(row?.userId).toBeNull();
		expect((await usage.getMonthSpend(db)).spendUsd).toBeCloseTo(before, 6);
	});

	it('shares the global budget across users', async () => {
		const first = await seedUser(db);
		const second = await seedUser(db);
		claudeTestConfig.globalMonthlyBudgetUsd = reservation() + 0.3;
		const spendy = () =>
			message([textBlock('done')], 'end_turn', { usage: { input_tokens: 50_000 } });
		callModule.setClaudeClientForTests(createFakeClaude([spendy(), spendy(), spendy()]));
		await call(first.id);
		await call(second.id);
		await expect(call(first.id)).rejects.toMatchObject({ code: 'global_budget_exhausted' });
	});
});

describe('concurrent reservations', () => {
	it('never reserves beyond the budget with more callers than pool connections', async () => {
		const user = await seedUser(db, { budget: 1 });
		const total = 12;
		const admissible = Math.floor(1 / reservation());
		expect(admissible).toBeGreaterThan(0);
		expect(admissible).toBeLessThan(total);

		let started = 0;
		let rejected = 0;
		let release: () => void = () => {};
		const released = new Promise<void>((resolve) => {
			release = resolve;
		});
		const settledCheck = () => {
			if (started + rejected === total) release();
		};
		const fake = {
			messages: {
				create: async () => {
					started++;
					settledCheck();
					await released;
					return ok();
				}
			}
		};
		callModule.setClaudeClientForTests(fake);

		const results = await Promise.all(
			Array.from({ length: total }, () =>
				call(user.id).then(
					() => 'ok' as const,
					(error: unknown) => {
						rejected++;
						settledCheck();
						return error;
					}
				)
			)
		);

		const succeeded = results.filter((result) => result === 'ok');
		const gated = results.filter((result) => result !== 'ok');
		expect(succeeded).toHaveLength(admissible);
		expect(gated).toHaveLength(total - admissible);
		for (const error of gated) {
			expect(error).toMatchObject({ code: 'user_budget_exhausted' });
		}
		const spend = await usage.getMonthSpend(db, { userId: user.id });
		expect(spend.calls).toBe(admissible);
		const rows = await usageRows();
		expect(rows.reduce((sum, row) => sum + row.reservedUsd, 0)).toBeLessThanOrEqual(1);
	});

	it('does not over-admit when reservations are still open', async () => {
		const user = await seedUser(db, { budget: 1 });
		const admissible = Math.floor(1 / reservation());
		const holds: (() => void)[] = [];
		callModule.setClaudeClientForTests({
			messages: {
				create: () =>
					new Promise((resolve) => {
						holds.push(() => resolve(ok()));
					})
			}
		});
		const pending = Array.from({ length: 12 }, () =>
			call(user.id).catch((error: unknown) => error)
		);
		while (holds.length < admissible) await new Promise((resolve) => setTimeout(resolve, 25));
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(holds).toHaveLength(admissible);
		const reserved = await db
			.select({ id: claudeUsage.id })
			.from(claudeUsage)
			.where(eq(claudeUsage.status, 'reserved'));
		expect(reserved).toHaveLength(admissible);
		const spend = await usage.getMonthSpend(db, { userId: user.id });
		expect(spend.spendUsd).toBeLessThanOrEqual(1);
		holds.forEach((resolve) => resolve());
		await Promise.all(pending);
	});
});

describe('capability', () => {
	it('is unavailable without a key, kill switch or access', async () => {
		const user = await seedUser(db);
		const nobody = await seedUser(db, { access: null });
		expect(await capability.getClaudeCapability(nobody.id)).toEqual({ available: false });
		await setKillSwitch(db, false);
		expect(await capability.getClaudeCapability(user.id)).toEqual({ available: false });
		await setKillSwitch(db, true);
		claudeTestConfig.configured = false;
		expect(await capability.getClaudeCapability(user.id)).toEqual({ available: false });
	});

	it('reports the smaller of the user and global remaining budget', async () => {
		const user = await seedUser(db, { budget: 5 });
		expect(await capability.getClaudeCapability(user.id)).toEqual({
			available: true,
			remainingBudgetUsd: 5
		});
		await db.insert(claudeUsage).values({
			userId: user.id,
			feature: 'test',
			model: 'claude-opus-5-5',
			status: 'succeeded',
			costUsd: 1.234
		});
		claudeTestConfig.globalMonthlyBudgetUsd = 3;
		expect(await capability.getClaudeCapability(user.id)).toEqual({
			available: true,
			remainingBudgetUsd: 1.77
		});
	});

	it('is unavailable below the minimum task call cost', async () => {
		const user = await seedUser(db, { budget: 0.4 });
		expect(capability.minTaskCallUsd()).toBeGreaterThan(0.4);
		expect(await capability.getClaudeCapability(user.id)).toEqual({ available: false });
	});

	it('assertClaudeAllowed checks the gates and the raw processor', async () => {
		const ok = await seedUser(db);
		const switched = await seedUser(db, { processor: 'device' });
		await expect(capability.assertClaudeAllowed(ok.id)).resolves.toBeUndefined();
		await expect(capability.assertClaudeAllowed(switched.id)).rejects.toBeInstanceOf(
			errors.ClaudeProcessorChangedError
		);
		await db.execute(sql`UPDATE claude_access SET enabled = false WHERE user_id = ${ok.id}`);
		await expect(capability.assertClaudeAllowed(ok.id)).rejects.toMatchObject({
			code: 'no_access'
		});
	});
});
