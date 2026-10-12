import { and, count, desc, eq, gte, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { ApiError } from '../errors';
import {
	adminAuditLog,
	aiTasks,
	claudeAccess,
	claudeTaskRuns,
	claudeUsage,
	identities,
	users
} from '../schema';
import { claudeConfig } from '../claude/config';
import { getClaudeEnabled } from '../claude/settings';
import {
	effectiveUserBudgetUsd,
	getMonthSpend,
	MONTH_START_SQL,
	monthCallsSql,
	monthSpendUsdSql,
	SPENT_USD_SQL
} from '../claude/usage';
import type { AdminDb } from './audit';
import type { AdminUserSort } from '../validation/admin';

export type AdminUserListOptions = {
	q?: string;
	access: 'all' | 'enabled' | 'disabled';
	sort: AdminUserSort;
	order: 'asc' | 'desc';
	limit: number;
	offset: number;
};

export type AdminUserRowData = {
	id: string;
	name: string | null;
	email: string | null;
	avatarUrl: string | null;
	isAdmin: boolean;
	providers: string[];
	createdAt: string | null;
	lastActiveAt: string | null;
	entryCount: number;
	openAiTaskCount: number;
	claude: {
		enabled: boolean;
		monthlyBudgetUsd: number | null;
		effectiveBudgetUsd: number;
		monthSpendUsd: number;
		monthCalls: number;
		note: string | null;
	};
};

const toDate = (value: unknown) =>
	value === null || value === undefined ? null : new Date(Number(value));

// Correlated subqueries are written with explicit table names: Drizzle strips
// the prefix from column references in single-table selects.
const entryCountSql =
	sql<number>`(SELECT count(*) FROM "food_entries" WHERE "food_entries"."user_id" = "users"."id")`.mapWith(
		Number
	);

const openAiTaskCountSql =
	sql<number>`(SELECT count(*) FROM "ai_tasks" WHERE "ai_tasks"."user_id" = "users"."id" AND "ai_tasks"."status" = 'pending')`.mapWith(
		Number
	);

const lastActiveMsSql = sql<
	number | null
>`(extract(epoch FROM greatest((SELECT max("sessions"."created_at") FROM "sessions" WHERE "sessions"."user_id" = "users"."id"), (SELECT max("food_entries"."created_at") FROM "food_entries" WHERE "food_entries"."user_id" = "users"."id"), (SELECT max("ai_tasks"."created_at") FROM "ai_tasks" WHERE "ai_tasks"."user_id" = "users"."id"))) * 1000)`.mapWith(
	(value) => (value === null ? null : Number(value))
);

const monthSpend = monthSpendUsdSql(users.id);
const monthCalls = monthCallsSql(users.id);

const rowSelect = {
	id: users.id,
	name: users.name,
	email: users.email,
	avatarUrl: users.avatarUrl,
	isAdmin: users.isAdmin,
	infomaniakSub: users.infomaniakSub,
	createdAt: users.createdAt,
	lastActiveMs: lastActiveMsSql,
	entryCount: entryCountSql,
	openAiTaskCount: openAiTaskCountSql,
	accessEnabled: claudeAccess.enabled,
	accessBudget: claudeAccess.monthlyBudgetUsd,
	accessNote: claudeAccess.note,
	monthSpendUsd: monthSpend,
	monthCalls
};

const sortExpressions: Record<AdminUserSort, SQL> = {
	createdAt: sql`${users.createdAt}`,
	lastActiveAt: sql`${lastActiveMsSql}`,
	name: sql`lower(${users.name})`,
	email: sql`lower(${users.email})`,
	monthSpendUsd: sql`${monthSpend}`,
	entryCount: sql`${entryCountSql}`
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

function listFilters({ q, access }: Pick<AdminUserListOptions, 'q' | 'access'>) {
	const needle = q?.trim();
	return and(
		needle
			? or(
					ilike(users.name, `%${escapeLike(needle)}%`),
					ilike(users.email, `%${escapeLike(needle)}%`)
				)
			: undefined,
		access === 'enabled' ? eq(claudeAccess.enabled, true) : undefined,
		access === 'disabled' ? sql`coalesce(${claudeAccess.enabled}, false) = false` : undefined
	);
}

type RowSelection = {
	id: string;
	name: string | null;
	email: string | null;
	avatarUrl: string | null;
	isAdmin: boolean;
	infomaniakSub: string | null;
	createdAt: Date | null;
	lastActiveMs: number | null;
	entryCount: number;
	openAiTaskCount: number;
	accessEnabled: boolean | null;
	accessBudget: number | null;
	accessNote: string | null;
	monthSpendUsd: number;
	monthCalls: number;
};

async function providersByUser(db: AdminDb, rows: RowSelection[]) {
	const ids = rows.map((row) => row.id);
	const found = ids.length
		? await db
				.select({ userId: identities.userId, provider: identities.provider })
				.from(identities)
				.where(inArray(identities.userId, ids))
		: [];
	const byUser = new Map<string, Set<string>>();
	for (const { userId, provider } of found) {
		const set = byUser.get(userId) ?? new Set<string>();
		set.add(provider);
		byUser.set(userId, set);
	}
	for (const row of rows) {
		if (!row.infomaniakSub) continue;
		const set = byUser.get(row.id) ?? new Set<string>();
		set.add('infomaniak');
		byUser.set(row.id, set);
	}
	return byUser;
}

function toRow(row: RowSelection, providers: Set<string> | undefined): AdminUserRowData {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		avatarUrl: row.avatarUrl,
		isAdmin: row.isAdmin,
		providers: [...(providers ?? [])].sort(),
		createdAt: row.createdAt ? row.createdAt.toISOString() : null,
		lastActiveAt: toDate(row.lastActiveMs)?.toISOString() ?? null,
		entryCount: row.entryCount,
		openAiTaskCount: row.openAiTaskCount,
		claude: {
			enabled: row.accessEnabled ?? false,
			monthlyBudgetUsd: row.accessBudget,
			effectiveBudgetUsd: effectiveUserBudgetUsd({ monthlyBudgetUsd: row.accessBudget }),
			monthSpendUsd: row.monthSpendUsd,
			monthCalls: row.monthCalls,
			note: row.accessNote
		}
	};
}

export async function listAdminUsers(
	db: AdminDb,
	options: AdminUserListOptions
): Promise<{ users: AdminUserRowData[]; total: number }> {
	const where = listFilters(options);
	const direction = options.order === 'asc' ? sql`ASC` : sql`DESC`;

	const [rows, [totalRow]] = await Promise.all([
		db
			.select(rowSelect)
			.from(users)
			.leftJoin(claudeAccess, eq(claudeAccess.userId, users.id))
			.where(where)
			.orderBy(sql`${sortExpressions[options.sort]} ${direction} NULLS LAST`, users.id)
			.limit(options.limit)
			.offset(options.offset),
		db
			.select({ total: count() })
			.from(users)
			.leftJoin(claudeAccess, eq(claudeAccess.userId, users.id))
			.where(where)
	]);

	const providers = await providersByUser(db, rows);
	return {
		users: rows.map((row) => toRow(row, providers.get(row.id))),
		total: totalRow?.total ?? 0
	};
}

export async function getAdminUser(db: AdminDb, id: string): Promise<AdminUserRowData | null> {
	const [row] = await db
		.select(rowSelect)
		.from(users)
		.leftJoin(claudeAccess, eq(claudeAccess.userId, users.id))
		.where(eq(users.id, id));
	if (!row) return null;
	const providers = await providersByUser(db, [row]);
	return toRow(row, providers.get(row.id));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDay = (date: Date) => date.toISOString().slice(0, 10);

export async function getAdminUserDetail(db: AdminDb, id: string, days: number) {
	const user = await getAdminUser(db, id);
	if (!user) throw new ApiError(404, 'Not found');

	const today = new Date();
	const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
	const rangeStart = new Date(startOfToday - (days - 1) * DAY_MS);

	const dayCol = sql<string>`to_char(${claudeUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
	const [usageRows, calls, audit] = await Promise.all([
		db
			.select({
				date: dayCol,
				costUsd: sql<number>`${SPENT_USD_SQL}`.mapWith(Number),
				calls: sql<number>`count(*)`.mapWith(Number)
			})
			.from(claudeUsage)
			.where(and(eq(claudeUsage.userId, id), gte(claudeUsage.createdAt, rangeStart)))
			.groupBy(dayCol),
		db
			.select({
				id: claudeUsage.id,
				createdAt: claudeUsage.createdAt,
				feature: claudeUsage.feature,
				model: claudeUsage.model,
				status: claudeUsage.status,
				inputTokens: claudeUsage.inputTokens,
				outputTokens: claudeUsage.outputTokens,
				cacheReadInputTokens: claudeUsage.cacheReadInputTokens,
				cacheCreationInputTokens: claudeUsage.cacheCreationInputTokens,
				costUsd:
					sql<number>`CASE WHEN ${claudeUsage.status} = 'reserved' THEN ${claudeUsage.reservedUsd} ELSE ${claudeUsage.costUsd} END`.mapWith(
						Number
					),
				errorCode: claudeUsage.errorCode,
				aiTaskId: claudeUsage.aiTaskId,
				aiTaskStatus: aiTasks.status
			})
			.from(claudeUsage)
			.leftJoin(aiTasks, eq(aiTasks.id, claudeUsage.aiTaskId))
			.where(eq(claudeUsage.userId, id))
			.orderBy(desc(claudeUsage.createdAt), desc(claudeUsage.id))
			.limit(50),
		db
			.select({
				id: adminAuditLog.id,
				createdAt: adminAuditLog.createdAt,
				action: adminAuditLog.action,
				actorLabel: adminAuditLog.actorLabel,
				before: adminAuditLog.before,
				after: adminAuditLog.after
			})
			.from(adminAuditLog)
			.where(eq(adminAuditLog.targetUserId, id))
			.orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
			.limit(50)
	]);

	const usageByDay = new Map(usageRows.map((row) => [row.date, row]));
	const dailyUsage = Array.from({ length: days }, (_, index) => {
		const date = utcDay(new Date(rangeStart.getTime() + index * DAY_MS));
		const row = usageByDay.get(date);
		return { date, costUsd: row?.costUsd ?? 0, calls: row?.calls ?? 0 };
	});

	return {
		user,
		dailyUsage,
		recentCalls: calls.map((call) => ({
			id: call.id,
			createdAt: call.createdAt.toISOString(),
			feature: call.feature,
			model: call.model,
			status: call.status,
			inputTokens: call.inputTokens,
			outputTokens: call.outputTokens,
			cacheReadInputTokens: call.cacheReadInputTokens,
			cacheCreationInputTokens: call.cacheCreationInputTokens,
			costUsd: call.costUsd,
			errorCode: call.errorCode,
			aiTaskId: call.aiTaskId,
			aiTaskStatus: call.aiTaskStatus
		})),
		auditLog: audit.map((entry) => ({
			id: entry.id,
			createdAt: entry.createdAt.toISOString(),
			action: entry.action,
			actorLabel: entry.actorLabel,
			before: asPayload(entry.before),
			after: asPayload(entry.after)
		}))
	};
}

function asPayload(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export async function getClaudeOverview(db: AdminDb) {
	const config = claudeConfig();

	const [enabled, spend, [monthRow], [reservations], topRows, [runs]] = await Promise.all([
		getClaudeEnabled(db),
		getMonthSpend(db),
		db.execute<{ ms: string }>(sql`SELECT extract(epoch FROM ${MONTH_START_SQL}) * 1000 AS ms`),
		db.select({ open: count() }).from(claudeUsage).where(eq(claudeUsage.status, 'reserved')),
		db
			.select({
				userId: claudeUsage.userId,
				name: users.name,
				email: users.email,
				spendUsd: sql<number>`${SPENT_USD_SQL}`.mapWith(Number),
				calls: sql<number>`count(*)`.mapWith(Number)
			})
			.from(claudeUsage)
			.leftJoin(users, eq(users.id, claudeUsage.userId))
			.where(sql`${claudeUsage.createdAt} >= ${MONTH_START_SQL}`)
			.groupBy(claudeUsage.userId, users.name, users.email)
			.orderBy(sql`${SPENT_USD_SQL} DESC`, claudeUsage.userId)
			.limit(5),
		db
			.select({
				queued: sql<number>`count(*) FILTER (WHERE ${claudeTaskRuns.state} = 'queued')`.mapWith(
					Number
				),
				running: sql<number>`count(*) FILTER (WHERE ${claudeTaskRuns.state} = 'running')`.mapWith(
					Number
				),
				retryWait:
					sql<number>`count(*) FILTER (WHERE ${claudeTaskRuns.state} = 'retry_wait')`.mapWith(
						Number
					),
				blocked: sql<number>`count(*) FILTER (WHERE ${claudeTaskRuns.state} = 'blocked')`.mapWith(
					Number
				),
				proposed: sql<number>`count(*) FILTER (WHERE ${claudeTaskRuns.state} = 'proposed')`.mapWith(
					Number
				),
				dismissedThisMonth:
					sql<number>`count(*) FILTER (WHERE ${claudeTaskRuns.state} = 'dismissed' AND ${claudeTaskRuns.updatedAt} >= ${MONTH_START_SQL})`.mapWith(
						Number
					)
			})
			.from(claudeTaskRuns)
	]);

	return {
		configured: config.configured,
		enabled,
		model: config.model,
		monthStart: new Date(Number(monthRow.ms)).toISOString(),
		globalBudgetUsd: config.globalMonthlyBudgetUsd,
		defaultUserBudgetUsd: config.defaultUserBudgetUsd,
		monthSpendUsd: spend.spendUsd,
		monthCalls: spend.calls,
		openReservations: reservations?.open ?? 0,
		topUsers: topRows
			.filter((row) => row.spendUsd > 0)
			.map((row) => ({
				userId: row.userId,
				name: row.name,
				email: row.email,
				spendUsd: row.spendUsd,
				calls: row.calls
			})),
		runs: {
			queued: runs?.queued ?? 0,
			running: runs?.running ?? 0,
			retryWait: runs?.retryWait ?? 0,
			blocked: runs?.blocked ?? 0,
			proposed: runs?.proposed ?? 0,
			dismissedThisMonth: runs?.dismissedThisMonth ?? 0
		}
	};
}
