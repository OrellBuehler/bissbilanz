import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import {
	adminAuditLog,
	aiTasks,
	appSettings,
	claudeAccess,
	claudeTaskLedger,
	claudeTaskRuns,
	claudeUsage,
	userPreferences,
	users
} from '$lib/server/schema';
import { listAdmins, resolveUser, setAdminFlag } from '$lib/server/admin/flag';
import { CLI_ACTOR, writeAudit } from '$lib/server/admin/audit';
import { getClaudeEnabled, setClaudeEnabled } from '$lib/server/claude/settings';
import {
	getMonthSpend,
	monthCallsSql,
	monthSpendUsdSql,
	MONTH_START_SQL
} from '$lib/server/claude/usage';

const DB_NAME = 'test_claude_foundation';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

const db = () => getTestDB(dbUrl);

async function expectConstraint(promise: Promise<unknown>, constraint: string) {
	await expect(promise).rejects.toSatisfy((error: Error) => {
		const cause = (error.cause ?? error) as { constraint_name?: string };
		return cause.constraint_name === constraint;
	});
}

async function insertUser(email: string | null, extra: Partial<typeof users.$inferInsert> = {}) {
	const [user] = await db()
		.insert(users)
		.values({ infomaniakSub: `sub-${crypto.randomUUID()}`, email, ...extra })
		.returning();
	return user;
}

async function insertTask(userId: string) {
	const [task] = await db()
		.insert(aiTasks)
		.values({ userId, description: 'Salad', date: '2026-02-10' })
		.returning();
	return task;
}

beforeEach(async () => {
	await db().delete(adminAuditLog);
	await db().delete(appSettings);
	await db().delete(claudeUsage);
	await db().delete(users);
});

describe('migration', () => {
	it('adds users.is_admin defaulting to false', async () => {
		const user = await insertUser('plain@example.com');
		expect(user.isAdmin).toBe(false);
	});

	it('creates the claude and admin tables', async () => {
		const rows = await db().execute<{ table_name: string }>(
			sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('claude_access', 'claude_usage', 'admin_audit_log', 'app_settings', 'claude_task_runs', 'claude_task_ledger')`
		);
		expect(rows.map((r) => r.table_name).sort()).toEqual([
			'admin_audit_log',
			'app_settings',
			'claude_access',
			'claude_task_ledger',
			'claude_task_runs',
			'claude_usage'
		]);
	});

	it('widens the processor and processed_by checks to claude and still rejects others', async () => {
		const user = await insertUser('prefs@example.com');
		await db().insert(userPreferences).values({ userId: user.id, aiTaskProcessor: 'claude' });
		await expectConstraint(
			db()
				.update(userPreferences)
				.set({ aiTaskProcessor: 'gpt' })
				.where(eq(userPreferences.userId, user.id)),
			'user_preferences_ai_task_processor_valid'
		);

		const task = await insertTask(user.id);
		await db().update(aiTasks).set({ processedBy: 'claude' }).where(eq(aiTasks.id, task.id));
		for (const legacy of ['assistant', 'on_device', 'private_cloud']) {
			await db().update(aiTasks).set({ processedBy: legacy }).where(eq(aiTasks.id, task.id));
		}
		await expectConstraint(
			db().update(aiTasks).set({ processedBy: 'gpt' }).where(eq(aiTasks.id, task.id)),
			'ai_tasks_processed_by_valid'
		);
	});
});

describe('claude_access', () => {
	it('is unique per user and range-checks the budget', async () => {
		const user = await insertUser('access@example.com');
		const [row] = await db().insert(claudeAccess).values({ userId: user.id }).returning();
		expect(row.enabled).toBe(false);
		expect(row.monthlyBudgetUsd).toBeNull();

		await expect(db().insert(claudeAccess).values({ userId: user.id })).rejects.toThrow();

		await db()
			.update(claudeAccess)
			.set({ monthlyBudgetUsd: 1000 })
			.where(eq(claudeAccess.id, row.id));
		await db().update(claudeAccess).set({ monthlyBudgetUsd: 0 }).where(eq(claudeAccess.id, row.id));
		await expectConstraint(
			db()
				.update(claudeAccess)
				.set({ monthlyBudgetUsd: 1000.01 })
				.where(eq(claudeAccess.id, row.id)),
			'claude_access_budget_range'
		);
		await expectConstraint(
			db().update(claudeAccess).set({ monthlyBudgetUsd: -1 }).where(eq(claudeAccess.id, row.id)),
			'claude_access_budget_range'
		);
	});

	it('is removed with the user', async () => {
		const user = await insertUser('cascade@example.com');
		await db().insert(claudeAccess).values({ userId: user.id });
		await db().delete(users).where(eq(users.id, user.id));
		expect(await db().select().from(claudeAccess)).toHaveLength(0);
	});
});

describe('claude_usage', () => {
	it('validates the status and anonymizes rows when the user is deleted', async () => {
		const user = await insertUser('usage@example.com');
		const task = await insertTask(user.id);
		const [row] = await db()
			.insert(claudeUsage)
			.values({ userId: user.id, feature: 'ai_task', model: 'claude-opus-5-5', aiTaskId: task.id })
			.returning();
		expect(row.status).toBe('reserved');

		await expectConstraint(
			db().update(claudeUsage).set({ status: 'bogus' }).where(eq(claudeUsage.id, row.id)),
			'claude_usage_status_valid'
		);

		await db().delete(users).where(eq(users.id, user.id));
		const [kept] = await db().select().from(claudeUsage).where(eq(claudeUsage.id, row.id));
		expect(kept.userId).toBeNull();
		expect(kept.aiTaskId).toBeNull();
	});

	it('computes month spend: reservations at estimate, settled at cost, last month ignored', async () => {
		const alice = await insertUser('alice@example.com');
		const bob = await insertUser('bob@example.com');
		const base = { feature: 'ai_task', model: 'claude-opus-5-5' };
		await db()
			.insert(claudeUsage)
			.values([
				{ ...base, userId: alice.id, status: 'reserved', reservedUsd: 0.4, costUsd: 0 },
				{ ...base, userId: alice.id, status: 'succeeded', reservedUsd: 0.4, costUsd: 0.123456 },
				{ ...base, userId: alice.id, status: 'failed', reservedUsd: 0.4, costUsd: 0 },
				{ ...base, userId: bob.id, status: 'abandoned', reservedUsd: 0.5, costUsd: 0.5 }
			]);
		await db()
			.insert(claudeUsage)
			.values({
				...base,
				userId: alice.id,
				status: 'succeeded',
				costUsd: 9,
				createdAt: sql`${MONTH_START_SQL} - interval '1 second'` as never
			});

		const aliceSpend = await getMonthSpend(db(), { userId: alice.id });
		expect(aliceSpend.calls).toBe(3);
		expect(aliceSpend.spendUsd).toBeCloseTo(0.523456, 6);
		expect(await getMonthSpend(db(), { userId: bob.id })).toEqual({ spendUsd: 0.5, calls: 1 });
		const all = await getMonthSpend(db());
		expect(all.calls).toBe(4);
		expect(all.spendUsd).toBeCloseTo(1.023456, 6);
		expect(await getMonthSpend(db(), { userId: crypto.randomUUID() })).toEqual({
			spendUsd: 0,
			calls: 0
		});

		const rows = await db()
			.select({ id: users.id, spend: monthSpendUsdSql(users.id), calls: monthCallsSql(users.id) })
			.from(users);
		const byId = new Map(rows.map((r) => [r.id, r]));
		expect(byId.get(alice.id)?.spend).toBeCloseTo(0.523456, 6);
		expect(byId.get(alice.id)?.calls).toBe(3);
		expect(byId.get(bob.id)?.spend).toBeCloseTo(0.5, 6);
	});
});

describe('claude_task_runs and ledger', () => {
	it('defaults a run to queued and validates state, mode and failure code', async () => {
		const user = await insertUser('run@example.com');
		const task = await insertTask(user.id);
		const [run] = await db()
			.insert(claudeTaskRuns)
			.values({ taskId: task.id, userId: user.id })
			.returning();
		expect(run).toMatchObject({ state: 'queued', attempt: 0, failures: 0, mode: null });

		const update = (set: Partial<typeof claudeTaskRuns.$inferInsert>) =>
			db().update(claudeTaskRuns).set(set).where(eq(claudeTaskRuns.taskId, task.id));
		await update({ state: 'retry_wait', mode: 'review', failureCode: 'user_budget_exhausted' });
		await expectConstraint(update({ state: 'bogus' }), 'claude_task_runs_state_valid');
		await expectConstraint(update({ mode: 'bogus' }), 'claude_task_runs_mode_valid');
		await expectConstraint(update({ failureCode: 'bogus' }), 'claude_task_runs_failure_code_valid');
		await expect(
			db().insert(claudeTaskRuns).values({ taskId: task.id, userId: user.id })
		).rejects.toThrow();
	});

	it('keys the ledger by task and key and cascades with the task', async () => {
		const user = await insertUser('ledger@example.com');
		const task = await insertTask(user.id);
		await db().insert(claudeTaskRuns).values({ taskId: task.id, userId: user.id });
		const entryId = crypto.randomUUID();
		await db()
			.insert(claudeTaskLedger)
			.values({ taskId: task.id, key: 'tool_1', entryId, summary: '2 servings Greek yogurt' });
		await expect(
			db()
				.insert(claudeTaskLedger)
				.values({ taskId: task.id, key: 'tool_1', entryId: crypto.randomUUID(), summary: 'dup' })
		).rejects.toThrow();

		await db().delete(aiTasks).where(eq(aiTasks.id, task.id));
		expect(await db().select().from(claudeTaskLedger)).toHaveLength(0);
		expect(await db().select().from(claudeTaskRuns)).toHaveLength(0);
	});
});

describe('app settings', () => {
	it('treats a missing row as off and records every change in the audit log', async () => {
		const admin = await insertUser('boss@example.com');
		expect(await getClaudeEnabled(db())).toBe(false);

		const actor = { userId: admin.id, label: 'boss@example.com' };
		expect(await setClaudeEnabled(db(), actor, true)).toEqual({ changed: true });
		expect(await getClaudeEnabled(db())).toBe(true);
		expect(await setClaudeEnabled(db(), actor, false)).toEqual({ changed: true });
		expect(await getClaudeEnabled(db())).toBe(false);

		const [setting] = await db().select().from(appSettings);
		expect(setting).toMatchObject({ key: 'claude_enabled', value: false, updatedBy: admin.id });

		const audit = await db().select().from(adminAuditLog).orderBy(adminAuditLog.createdAt);
		expect(audit.map((a) => [a.action, a.before, a.after, a.targetUserId])).toEqual([
			['settings.claude_enabled', { enabled: false }, { enabled: true }, null],
			['settings.claude_enabled', { enabled: true }, { enabled: false }, null]
		]);
		expect(audit[0]).toMatchObject({ actorUserId: admin.id, actorLabel: 'boss@example.com' });
	});

	it('skips the audit row when the value does not change', async () => {
		const actor = { userId: null, label: 'cli' };
		expect(await setClaudeEnabled(db(), actor, false)).toEqual({ changed: false });
		expect(await setClaudeEnabled(db(), actor, true)).toEqual({ changed: true });
		expect(await setClaudeEnabled(db(), actor, true)).toEqual({ changed: false });
		expect(await db().select().from(adminAuditLog)).toHaveLength(1);
	});

	it('serializes concurrent toggles so every audit before matches the stored state', async () => {
		const actor = { userId: null, label: 'cli' };
		const results = await Promise.all(
			[true, true, false, true, false, false].map((enabled) =>
				setClaudeEnabled(db(), actor, enabled)
			)
		);
		const remaining = await db().select().from(adminAuditLog);
		expect(remaining).toHaveLength(results.filter((r) => r.changed).length);
		let state = false;
		while (remaining.length > 0) {
			const next = remaining.findIndex(
				(row) => (row.before as { enabled: boolean }).enabled === state
			);
			expect(next).toBeGreaterThanOrEqual(0);
			state = (remaining.splice(next, 1)[0].after as { enabled: boolean }).enabled;
		}
		expect(await getClaudeEnabled(db())).toBe(state);
	});

	it('stores a JSON boolean and only reads JSON true as enabled', async () => {
		await setClaudeEnabled(db(), CLI_ACTOR, true);
		const stored = await db().execute<{ type: string; text: string }>(
			sql`SELECT jsonb_typeof(value) AS type, value::text AS text FROM app_settings WHERE key = 'claude_enabled'`
		);
		expect(stored[0]).toEqual({ type: 'boolean', text: 'true' });

		await db().execute(
			sql`UPDATE app_settings SET value = '"true"'::jsonb WHERE key = 'claude_enabled'`
		);
		expect(await getClaudeEnabled(db())).toBe(false);
	});
});

describe('admin_audit_log', () => {
	it('validates the action and keeps rows (actor and target nulled) when users are deleted', async () => {
		const actor = await insertUser('actor@example.com');
		const target = await insertUser('target@example.com');
		await writeAudit(db(), {
			actorUserId: actor.id,
			actorLabel: actor.email!,
			action: 'claude_access.grant',
			targetUserId: target.id,
			before: null,
			after: { enabled: true }
		});
		await expectConstraint(
			db().insert(adminAuditLog).values({ actorLabel: 'cli', action: 'bogus' }),
			'admin_audit_log_action_valid'
		);

		await db().delete(users).where(eq(users.id, actor.id));
		await db().delete(users).where(eq(users.id, target.id));
		const [row] = await db().select().from(adminAuditLog);
		expect(row).toMatchObject({
			actorUserId: null,
			targetUserId: null,
			actorLabel: 'actor@example.com',
			before: null,
			after: { enabled: true }
		});
	});
});

describe('admin flag', () => {
	it('grants by email case-insensitively, writes one audit row and lists the admin', async () => {
		const user = await insertUser('Ada@Example.com', { name: 'Ada' });
		await insertUser('other@example.com');

		const result = await setAdminFlag(db(), '  ada@example.COM ', true);
		expect(result).toEqual({
			user: { id: user.id, email: 'Ada@Example.com', name: 'Ada' },
			changed: true
		});

		const [reloaded] = await db().select().from(users).where(eq(users.id, user.id));
		expect(reloaded.isAdmin).toBe(true);
		expect(await listAdmins(db())).toEqual([
			{ id: user.id, email: 'Ada@Example.com', name: 'Ada' }
		]);

		const audit = await db().select().from(adminAuditLog);
		expect(audit).toHaveLength(1);
		expect(audit[0]).toMatchObject({
			actorUserId: CLI_ACTOR.userId,
			actorLabel: 'cli',
			action: 'admin.grant',
			targetUserId: user.id,
			before: { isAdmin: false },
			after: { isAdmin: true }
		});
	});

	it('revokes by id and audits it', async () => {
		const user = await insertUser('grace@example.com', { isAdmin: true });

		const result = await setAdminFlag(db(), user.id, false);
		expect(result.changed).toBe(true);
		expect(await listAdmins(db())).toEqual([]);

		const audit = await db().select().from(adminAuditLog);
		expect(audit).toHaveLength(1);
		expect(audit[0]).toMatchObject({
			action: 'admin.revoke',
			targetUserId: user.id,
			before: { isAdmin: true },
			after: { isAdmin: false }
		});
	});

	it('is a no-op without an audit row when nothing changes', async () => {
		const user = await insertUser('noop@example.com');
		expect((await setAdminFlag(db(), user.id, false)).changed).toBe(false);
		await setAdminFlag(db(), user.id, true);
		expect((await setAdminFlag(db(), user.id, true)).changed).toBe(false);
		expect(await db().select().from(adminAuditLog)).toHaveLength(1);
	});

	it('refuses an email shared by several users and lists them', async () => {
		const first = await insertUser('twin@example.com');
		const second = await insertUser('TWIN@example.com');

		await expect(setAdminFlag(db(), 'twin@example.com', true)).rejects.toThrow(
			/matches 2 users.*use the id instead/
		);
		await expect(resolveUser(db(), 'twin@example.com')).rejects.toThrow(
			new RegExp(`${first.id}|${second.id}`)
		);
		expect(await listAdmins(db())).toEqual([]);
		expect(await db().select().from(adminAuditLog)).toHaveLength(0);

		const byId = await setAdminFlag(db(), second.id, true);
		expect(byId.user.id).toBe(second.id);
	});

	it('refuses an unknown email or id and an empty argument', async () => {
		await expect(setAdminFlag(db(), 'nobody@example.com', true)).rejects.toThrow(
			'No user matching "nobody@example.com"'
		);
		const unknownId = crypto.randomUUID();
		await expect(setAdminFlag(db(), unknownId, true)).rejects.toThrow(
			`No user matching "${unknownId}"`
		);
		await expect(setAdminFlag(db(), '   ', true)).rejects.toThrow('A user email or id is required');
		expect(await db().select().from(adminAuditLog)).toHaveLength(0);
	});
});
