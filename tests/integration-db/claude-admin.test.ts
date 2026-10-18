import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
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
	claudeTaskRuns,
	claudeUsage,
	foodEntries,
	identities,
	sessions,
	users
} from '$lib/server/schema';
import { getAdminUserDetail, getClaudeOverview, listAdminUsers } from '$lib/server/admin/users';
import { updateClaudeAccess } from '$lib/server/admin/claude-access';
import { setClaudeEnabled } from '$lib/server/claude/settings';
import { onClaudeAccessChanged } from '$lib/server/claude/events';
import { ApiError } from '$lib/server/errors';

vi.hoisted(() => {
	process.env.ANTHROPIC_API_KEY = 'sk-ant-secret-for-admin-test';
});

const DB_NAME = 'test_claude_admin';
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

const defaults = {
	access: 'all',
	sort: 'createdAt',
	order: 'desc',
	limit: 25,
	offset: 0
} as const;

const ago = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

async function insertUser(email: string | null, extra: Partial<typeof users.$inferInsert> = {}) {
	const [user] = await db()
		.insert(users)
		.values({ infomaniakSub: null, email, name: email?.split('@')[0] ?? null, ...extra })
		.returning();
	return user;
}

const usageBase = { feature: 'ai_task', model: 'claude-opus-5-5' };

beforeEach(async () => {
	await db().delete(adminAuditLog);
	await db().delete(appSettings);
	await db().delete(claudeUsage);
	await db().delete(users);
});

describe('listAdminUsers', () => {
	it('returns the row shape with providers, counts and access', async () => {
		const ada = await insertUser('ada@example.com', {
			infomaniakSub: 'ik-1',
			createdAt: ago(10)
		});
		await db()
			.insert(identities)
			.values([
				{ userId: ada.id, provider: 'google', subject: 'g-1' },
				{ userId: ada.id, provider: 'infomaniak', subject: 'ik-1' }
			]);
		await db()
			.insert(foodEntries)
			.values([
				{ userId: ada.id, date: '2026-10-01', mealType: 'Lunch', servings: 1, quickCalories: 100 },
				{ userId: ada.id, date: '2026-10-02', mealType: 'Lunch', servings: 1, quickCalories: 100 }
			]);
		await db()
			.insert(aiTasks)
			.values([
				{ userId: ada.id, description: 'Salad', date: '2026-10-02' },
				{ userId: ada.id, description: 'Soup', date: '2026-10-02', status: 'completed' }
			]);
		await db()
			.insert(sessions)
			.values({
				userId: ada.id,
				expiresAt: ago(-1),
				createdAt: ago(5)
			});
		await db().insert(claudeAccess).values({
			userId: ada.id,
			enabled: true,
			monthlyBudgetUsd: 25,
			note: 'friend'
		});
		await db()
			.insert(claudeUsage)
			.values([
				{ ...usageBase, userId: ada.id, status: 'succeeded', costUsd: 0.25 },
				{ ...usageBase, userId: ada.id, status: 'reserved', reservedUsd: 0.5 }
			]);

		const { users: rows, total } = await listAdminUsers(db(), defaults);

		expect(total).toBe(1);
		const [row] = rows;
		expect(row).toMatchObject({
			id: ada.id,
			email: 'ada@example.com',
			isAdmin: false,
			providers: ['google', 'infomaniak'],
			entryCount: 2,
			openAiTaskCount: 1,
			claude: {
				enabled: true,
				monthlyBudgetUsd: 25,
				effectiveBudgetUsd: 25,
				monthSpendUsd: 0.75,
				monthCalls: 2,
				note: 'friend'
			}
		});
		expect(row.createdAt).toBe(ada.createdAt!.toISOString());
		const newestActivity = Math.max(
			...(await db().select({ at: foodEntries.createdAt }).from(foodEntries)).map((r) =>
				r.at!.getTime()
			)
		);
		expect(new Date(row.lastActiveAt!).getTime()).toBeGreaterThanOrEqual(newestActivity - 1000);
	});

	it('falls back to the default budget and null last activity for a bare user', async () => {
		await insertUser(null);
		const {
			users: [row]
		} = await listAdminUsers(db(), defaults);
		expect(row.email).toBeNull();
		expect(row.providers).toEqual([]);
		expect(row.lastActiveAt).toBeNull();
		expect(row.claude).toEqual({
			enabled: false,
			monthlyBudgetUsd: null,
			effectiveBudgetUsd: 10,
			monthSpendUsd: 0,
			monthCalls: 0,
			note: null
		});
	});

	it('ignores spend from previous months', async () => {
		const ada = await insertUser('ada@example.com');
		await db()
			.insert(claudeUsage)
			.values([
				{ ...usageBase, userId: ada.id, status: 'succeeded', costUsd: 1 },
				{ ...usageBase, userId: ada.id, status: 'succeeded', costUsd: 50, createdAt: ago(40) }
			]);
		const {
			users: [row]
		} = await listAdminUsers(db(), defaults);
		expect(row.claude.monthSpendUsd).toBe(1);
		expect(row.claude.monthCalls).toBe(1);
	});

	describe('sorting', () => {
		let a: typeof users.$inferSelect;
		let b: typeof users.$inferSelect;
		let c: typeof users.$inferSelect;

		beforeEach(async () => {
			a = await insertUser('amy@example.com', { name: 'Amy', createdAt: ago(3) });
			b = await insertUser('Bob@example.com', { name: 'bob', createdAt: ago(2) });
			c = await insertUser('cy@example.com', { name: 'Cy', createdAt: ago(1) });
			await db()
				.insert(claudeUsage)
				.values([
					{ ...usageBase, userId: a.id, status: 'succeeded', costUsd: 3 },
					{ ...usageBase, userId: b.id, status: 'succeeded', costUsd: 1 }
				]);
			await db()
				.insert(foodEntries)
				.values([
					{ userId: b.id, date: '2026-10-01', mealType: 'Lunch', servings: 1, quickCalories: 1 },
					{ userId: b.id, date: '2026-10-01', mealType: 'Lunch', servings: 1, quickCalories: 1 },
					{ userId: a.id, date: '2026-10-01', mealType: 'Lunch', servings: 1, quickCalories: 1 }
				]);
			await db()
				.insert(sessions)
				.values([
					{ userId: c.id, expiresAt: ago(-1), createdAt: ago(0.5) },
					{ userId: a.id, expiresAt: ago(-1), createdAt: ago(2.5) }
				]);
			await db()
				.update(foodEntries)
				.set({ createdAt: ago(20) });
		});

		const ids = async (sort: (typeof defaults)['sort'] | string, order: 'asc' | 'desc') =>
			(await listAdminUsers(db(), { ...defaults, sort: sort as never, order })).users.map(
				(u) => u.id
			);

		it('by createdAt', async () => {
			expect(await ids('createdAt', 'desc')).toEqual([c.id, b.id, a.id]);
			expect(await ids('createdAt', 'asc')).toEqual([a.id, b.id, c.id]);
		});

		it('by name case-insensitively', async () => {
			expect(await ids('name', 'asc')).toEqual([a.id, b.id, c.id]);
			expect(await ids('name', 'desc')).toEqual([c.id, b.id, a.id]);
		});

		it('by email case-insensitively', async () => {
			expect(await ids('email', 'asc')).toEqual([a.id, b.id, c.id]);
		});

		it('by month spend', async () => {
			expect(await ids('monthSpendUsd', 'desc')).toEqual([a.id, b.id, c.id]);
			expect(await ids('monthSpendUsd', 'asc')).toEqual([c.id, b.id, a.id]);
		});

		it('by entry count', async () => {
			expect(await ids('entryCount', 'desc')).toEqual([b.id, a.id, c.id]);
		});

		it('by last activity, with users that never did anything last', async () => {
			await db().delete(sessions);
			await db()
				.insert(sessions)
				.values({ userId: a.id, expiresAt: ago(-1), createdAt: ago(1) });
			expect(await ids('lastActiveAt', 'desc')).toEqual([a.id, b.id, c.id]);
			expect(await ids('lastActiveAt', 'asc')).toEqual([b.id, a.id, c.id]);
		});
	});

	describe('filtering', () => {
		beforeEach(async () => {
			const on = await insertUser('on@example.com', { name: 'On' });
			const off = await insertUser('off@example.com', { name: 'Off' });
			await insertUser('none@example.com', { name: 'None' });
			await db()
				.insert(claudeAccess)
				.values([
					{ userId: on.id, enabled: true },
					{ userId: off.id, enabled: false }
				]);
		});

		it('by access', async () => {
			const names = async (access: 'all' | 'enabled' | 'disabled') =>
				(await listAdminUsers(db(), { ...defaults, access, sort: 'name', order: 'asc' })).users.map(
					(u) => u.name
				);
			expect(await names('all')).toEqual(['None', 'Off', 'On']);
			expect(await names('enabled')).toEqual(['On']);
			expect(await names('disabled')).toEqual(['None', 'Off']);
		});

		it('by name or email, case-insensitively, with total of the filtered set', async () => {
			const result = await listAdminUsers(db(), { ...defaults, q: 'OF' });
			expect(result.users.map((u) => u.name)).toEqual(['Off']);
			expect(result.total).toBe(1);
			expect((await listAdminUsers(db(), { ...defaults, q: 'none@' })).total).toBe(1);
		});

		it('treats LIKE wildcards in the search as literals', async () => {
			expect((await listAdminUsers(db(), { ...defaults, q: '%' })).total).toBe(0);
			expect((await listAdminUsers(db(), { ...defaults, q: '_n' })).total).toBe(0);
		});

		it('combines the access filter with the search', async () => {
			const result = await listAdminUsers(db(), { ...defaults, q: 'o', access: 'enabled' });
			expect(result.users.map((u) => u.name)).toEqual(['On']);
		});
	});

	it('paginates with a stable order and reports the unpaged total', async () => {
		for (let i = 0; i < 5; i++) await insertUser(`u${i}@example.com`, { name: `U${i}` });
		const options = { ...defaults, sort: 'name', order: 'asc', limit: 2 } as const;
		const first = await listAdminUsers(db(), options);
		const second = await listAdminUsers(db(), { ...options, offset: 2 });
		const third = await listAdminUsers(db(), { ...options, offset: 4 });
		expect(first.total).toBe(5);
		expect([...first.users, ...second.users, ...third.users].map((u) => u.name)).toEqual([
			'U0',
			'U1',
			'U2',
			'U3',
			'U4'
		]);
	});
});

describe('getAdminUserDetail', () => {
	it('zero-fills the daily usage, lists recent calls with the task status and the audit log', async () => {
		const ada = await insertUser('ada@example.com');
		const other = await insertUser('other@example.com');
		const [task] = await db()
			.insert(aiTasks)
			.values({ userId: ada.id, description: 'Secret meal', date: '2026-10-01' })
			.returning();
		await db()
			.insert(claudeUsage)
			.values([
				{
					...usageBase,
					userId: ada.id,
					status: 'succeeded',
					costUsd: 0.2,
					inputTokens: 100,
					outputTokens: 10,
					cacheReadInputTokens: 5,
					cacheCreationInputTokens: 7,
					aiTaskId: task.id,
					createdAt: ago(1)
				},
				{ ...usageBase, userId: ada.id, status: 'succeeded', costUsd: 0.3, createdAt: ago(1) },
				{ ...usageBase, userId: ada.id, status: 'reserved', reservedUsd: 0.4, createdAt: ago(0) },
				{ ...usageBase, userId: ada.id, status: 'succeeded', costUsd: 9, createdAt: ago(20) },
				{ ...usageBase, userId: other.id, status: 'succeeded', costUsd: 99 }
			]);
		await db()
			.insert(adminAuditLog)
			.values([
				{
					actorLabel: 'root@example.com',
					action: 'claude_access.grant',
					targetUserId: ada.id,
					before: { enabled: false },
					after: { enabled: true }
				},
				{ actorLabel: 'root@example.com', action: 'claude_access.grant', targetUserId: other.id }
			]);

		const detail = await getAdminUserDetail(db(), ada.id, 7);

		expect(detail.user.id).toBe(ada.id);
		expect(detail.dailyUsage).toHaveLength(7);
		const dates = detail.dailyUsage.map((d) => d.date);
		expect(dates).toEqual([...dates].sort());
		expect(dates.at(-1)).toBe(new Date().toISOString().slice(0, 10));
		expect(detail.dailyUsage.reduce((sum, d) => sum + d.costUsd, 0)).toBeCloseTo(0.9, 6);
		expect(detail.dailyUsage.reduce((sum, d) => sum + d.calls, 0)).toBe(3);
		expect(detail.dailyUsage.filter((d) => d.calls === 0).length).toBeGreaterThanOrEqual(4);

		expect(detail.recentCalls).toHaveLength(4);
		expect(detail.recentCalls[0]).toMatchObject({ status: 'reserved', costUsd: 0.4 });
		const withTask = detail.recentCalls.find((c) => c.aiTaskId === task.id)!;
		expect(withTask).toMatchObject({
			aiTaskStatus: 'pending',
			inputTokens: 100,
			cacheCreationInputTokens: 7,
			costUsd: 0.2
		});
		expect(JSON.stringify(detail)).not.toContain('Secret meal');

		expect(detail.auditLog).toHaveLength(1);
		expect(detail.auditLog[0]).toMatchObject({
			action: 'claude_access.grant',
			actorLabel: 'root@example.com',
			before: { enabled: false },
			after: { enabled: true }
		});
	});

	it('wider windows include older days', async () => {
		const ada = await insertUser('ada@example.com');
		await db()
			.insert(claudeUsage)
			.values({
				...usageBase,
				userId: ada.id,
				status: 'succeeded',
				costUsd: 9,
				createdAt: ago(20)
			});
		expect((await getAdminUserDetail(db(), ada.id, 7)).dailyUsage.some((d) => d.costUsd > 0)).toBe(
			false
		);
		const wide = await getAdminUserDetail(db(), ada.id, 30);
		expect(wide.dailyUsage).toHaveLength(30);
		expect(wide.dailyUsage.some((d) => d.costUsd === 9)).toBe(true);
	});

	it('rejects an unknown user with a 404', async () => {
		await expect(
			getAdminUserDetail(db(), '10000000-0000-4000-8000-0000000000ff', 30)
		).rejects.toMatchObject({ status: 404 });
	});
});

describe('updateClaudeAccess', () => {
	const events: unknown[] = [];
	let unsubscribe: () => void;

	beforeEach(() => {
		events.length = 0;
		unsubscribe = onClaudeAccessChanged((change) => {
			events.push(change);
		});
	});
	afterEach(() => unsubscribe());

	async function actor() {
		const admin = await insertUser('root@example.com', { isAdmin: true });
		return { userId: admin.id, label: 'root@example.com' };
	}

	const audit = (targetUserId: string) =>
		db()
			.select()
			.from(adminAuditLog)
			.where(eq(adminAuditLog.targetUserId, targetUserId))
			.orderBy(adminAuditLog.createdAt);

	it('grants, adjusts and revokes with one audit row and one event each', async () => {
		const admin = await actor();
		const ada = await insertUser('ada@example.com');

		const granted = await updateClaudeAccess(db(), admin, ada.id, {
			enabled: true,
			monthlyBudgetUsd: 20,
			note: ' friend '
		});
		expect(granted).toMatchObject({
			enabled: true,
			monthlyBudgetUsd: 20,
			effectiveBudgetUsd: 20,
			note: 'friend'
		});
		expect(granted.grantedAt).not.toBeNull();
		const [row] = await db().select().from(claudeAccess).where(eq(claudeAccess.userId, ada.id));
		expect(row.grantedBy).toBe(admin.userId);

		const adjusted = await updateClaudeAccess(db(), admin, ada.id, { monthlyBudgetUsd: null });
		expect(adjusted).toMatchObject({
			enabled: true,
			monthlyBudgetUsd: null,
			effectiveBudgetUsd: 10
		});
		expect(adjusted.grantedAt).toBe(granted.grantedAt);

		const revoked = await updateClaudeAccess(db(), admin, ada.id, { enabled: false });
		expect(revoked.enabled).toBe(false);

		const rows = await audit(ada.id);
		expect(rows.map((r) => r.action)).toEqual([
			'claude_access.grant',
			'claude_access.update',
			'claude_access.revoke'
		]);
		expect(rows.every((r) => r.actorLabel === 'root@example.com')).toBe(true);
		expect(rows.every((r) => r.actorUserId === admin.userId)).toBe(true);
		expect(rows[0].before).toEqual({ enabled: false, monthlyBudgetUsd: null, note: null });
		expect(rows[0].after).toEqual({ enabled: true, monthlyBudgetUsd: 20, note: 'friend' });
		expect(rows[1].before).toMatchObject({ monthlyBudgetUsd: 20 });
		expect(rows[1].after).toMatchObject({ monthlyBudgetUsd: null });
		expect(rows[2].after).toMatchObject({ enabled: false });
		expect(events).toEqual([{ userId: ada.id }, { userId: ada.id }, { userId: ada.id }]);
	});

	it('records a note change as an update and clears it with an empty note', async () => {
		const admin = await actor();
		const ada = await insertUser('ada@example.com');
		await updateClaudeAccess(db(), admin, ada.id, { note: 'hello' });
		const cleared = await updateClaudeAccess(db(), admin, ada.id, { note: '   ' });
		expect(cleared.note).toBeNull();
		expect((await audit(ada.id)).map((r) => r.action)).toEqual([
			'claude_access.update',
			'claude_access.update'
		]);
	});

	it('is a no-op without audit row or event when nothing changes', async () => {
		const admin = await actor();
		const ada = await insertUser('ada@example.com');
		await updateClaudeAccess(db(), admin, ada.id, { enabled: true });
		events.length = 0;

		const again = await updateClaudeAccess(db(), admin, ada.id, { enabled: true });
		expect(again.enabled).toBe(true);
		const none = await updateClaudeAccess(db(), admin, ada.id, { enabled: false, note: null });
		expect(none.enabled).toBe(false);
		await updateClaudeAccess(db(), admin, ada.id, { enabled: false });

		expect(await audit(ada.id)).toHaveLength(2);
		expect(events).toHaveLength(1);
	});

	it('re-granting after a revoke refreshes grantedBy and grantedAt', async () => {
		const admin = await actor();
		const second = await insertUser('second@example.com', { isAdmin: true });
		const ada = await insertUser('ada@example.com');
		const first = await updateClaudeAccess(db(), admin, ada.id, { enabled: true });
		await updateClaudeAccess(db(), admin, ada.id, { enabled: false });
		await updateClaudeAccess(db(), { userId: second.id, label: 'second' }, ada.id, {
			enabled: true
		});
		const [row] = await db().select().from(claudeAccess).where(eq(claudeAccess.userId, ada.id));
		expect(row.grantedBy).toBe(second.id);
		expect(row.grantedAt!.getTime()).toBeGreaterThanOrEqual(new Date(first.grantedAt!).getTime());
	});

	it('serializes concurrent changes into consistent audit rows', async () => {
		const admin = await actor();
		const ada = await insertUser('ada@example.com');
		await Promise.all([
			updateClaudeAccess(db(), admin, ada.id, { enabled: true }),
			updateClaudeAccess(db(), admin, ada.id, { enabled: true }),
			updateClaudeAccess(db(), admin, ada.id, { enabled: true })
		]);
		expect((await audit(ada.id)).map((r) => r.action)).toEqual(['claude_access.grant']);
	});

	it('rejects an unknown user with a 404 and writes nothing', async () => {
		const admin = await actor();
		const error = await updateClaudeAccess(db(), admin, '10000000-0000-4000-8000-0000000000ff', {
			enabled: true
		}).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).status).toBe(404);
		expect(await db().select().from(claudeAccess)).toHaveLength(0);
		expect(await db().select().from(adminAuditLog)).toHaveLength(0);
		expect(events).toEqual([]);
	});

	it('accepts an admin without an email as actor', async () => {
		const admin = await insertUser(null, { isAdmin: true });
		const ada = await insertUser('ada@example.com');
		await updateClaudeAccess(db(), { userId: admin.id, label: admin.id }, ada.id, {
			enabled: true
		});
		expect((await audit(ada.id))[0].actorLabel).toBe(admin.id);
	});
});

describe('getClaudeOverview', () => {
	it('reports the global state without leaking the API key', async () => {
		const ada = await insertUser('ada@example.com', { name: 'Ada' });
		const bob = await insertUser('bob@example.com', { name: 'Bob' });
		const idle = await insertUser('idle@example.com');
		await db()
			.insert(claudeUsage)
			.values([
				{ ...usageBase, userId: ada.id, status: 'succeeded', costUsd: 1 },
				{ ...usageBase, userId: ada.id, status: 'reserved', reservedUsd: 0.5 },
				{ ...usageBase, userId: bob.id, status: 'succeeded', costUsd: 3 },
				{ ...usageBase, userId: idle.id, status: 'failed', costUsd: 0 },
				{ ...usageBase, userId: null, status: 'succeeded', costUsd: 0.25 },
				{ ...usageBase, userId: bob.id, status: 'succeeded', costUsd: 100, createdAt: ago(40) }
			]);

		const overview = await getClaudeOverview(db());

		expect(overview).toMatchObject({
			configured: true,
			enabled: false,
			model: 'claude-sonnet-5-5',
			globalBudgetUsd: 90,
			defaultUserBudgetUsd: 10,
			monthCalls: 5,
			openReservations: 1
		});
		expect(overview.monthSpendUsd).toBeCloseTo(4.75, 6);
		expect(overview.topUsers.map((u) => [u.name, u.spendUsd, u.calls])).toEqual([
			['Bob', 3, 1],
			['Ada', 1.5, 2],
			[null, 0.25, 1]
		]);
		expect(overview.topUsers[2].userId).toBeNull();
		expect(overview.runs).toEqual({
			queued: 0,
			running: 0,
			retryWait: 0,
			blocked: 0,
			proposed: 0,
			dismissedThisMonth: 0
		});
		const monthStart = new Date(overview.monthStart);
		expect(monthStart.getUTCDate()).toBe(1);
		expect(monthStart.getUTCHours()).toBe(0);
		expect(JSON.stringify(overview)).not.toMatch(/apiKey|sk-ant/i);
	});

	it('counts task runs by state, dismissals only from this month', async () => {
		const ada = await insertUser('ada@example.com');
		const states = [
			['queued', 0],
			['queued', 0],
			['running', 0],
			['retry_wait', 0],
			['blocked', 0],
			['blocked', 0],
			['blocked', 0],
			['proposed', 0],
			['dismissed', 0],
			['dismissed', 40],
			['succeeded', 0]
		] as const;
		for (const [state, daysAgo] of states) {
			const [task] = await db()
				.insert(aiTasks)
				.values({ userId: ada.id, description: 'Meal', date: '2026-10-01' })
				.returning();
			await db()
				.insert(claudeTaskRuns)
				.values({ taskId: task.id, userId: ada.id, state, updatedAt: ago(daysAgo) });
		}

		expect((await getClaudeOverview(db())).runs).toEqual({
			queued: 2,
			running: 1,
			retryWait: 1,
			blocked: 3,
			proposed: 1,
			dismissedThisMonth: 1
		});
	});

	it('follows the kill switch and writes an audit row per change', async () => {
		const admin = await insertUser('root@example.com', { isAdmin: true });
		const actor = { userId: admin.id, label: 'root@example.com' };
		expect((await getClaudeOverview(db())).enabled).toBe(false);

		expect(await setClaudeEnabled(db(), actor, true)).toEqual({ changed: true });
		expect((await getClaudeOverview(db())).enabled).toBe(true);
		expect(await setClaudeEnabled(db(), actor, true)).toEqual({ changed: false });
		await setClaudeEnabled(db(), actor, false);

		const rows = await db().select().from(adminAuditLog).orderBy(adminAuditLog.createdAt);
		expect(rows.map((r) => [r.action, r.after])).toEqual([
			['settings.claude_enabled', { enabled: true }],
			['settings.claude_enabled', { enabled: false }]
		]);
		expect(rows.every((r) => r.targetUserId === null && r.actorLabel === 'root@example.com')).toBe(
			true
		);
	});
});
