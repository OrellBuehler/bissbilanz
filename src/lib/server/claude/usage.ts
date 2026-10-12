import { and, eq, getTableName, gte, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { claudeUsage } from '../schema';
import type { AdminDbOrTx } from '../admin/audit';
import { claudeConfig } from './config';

// Drizzle drops the table prefix of columns in single-table selects, which would
// silently break correlated subqueries; these fragments always qualify explicitly.
const usageCol = (name: string) => sql.raw(`"claude_usage"."${name}"`);
const qualified = (col: AnyPgColumn) => sql.raw(`"${getTableName(col.table)}"."${col.name}"`);

// UTC calendar month, computed by Postgres; a call belongs to the month of its created_at.
export const MONTH_START_SQL = sql`(date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`;

// Open reservations count at their estimate, everything else at its settled cost.
export const SPENT_USD_SQL = sql`coalesce(sum(CASE WHEN ${usageCol('status')} = 'reserved' THEN ${usageCol('reserved_usd')} ELSE ${usageCol('cost_usd')} END), 0)`;

export function monthSpendUsdSql(userIdCol: AnyPgColumn) {
	return sql<number>`(SELECT ${SPENT_USD_SQL} FROM ${claudeUsage} WHERE ${usageCol('user_id')} = ${qualified(userIdCol)} AND ${usageCol('created_at')} >= ${MONTH_START_SQL})`.mapWith(
		Number
	);
}

export function monthCallsSql(userIdCol: AnyPgColumn) {
	return sql<number>`(SELECT count(*) FROM ${claudeUsage} WHERE ${usageCol('user_id')} = ${qualified(userIdCol)} AND ${usageCol('created_at')} >= ${MONTH_START_SQL})`.mapWith(
		Number
	);
}

export async function getMonthSpend(
	db: AdminDbOrTx,
	{ userId }: { userId?: string } = {}
): Promise<{ spendUsd: number; calls: number }> {
	const [row] = await db
		.select({
			spendUsd: sql<number>`${SPENT_USD_SQL}`.mapWith(Number),
			calls: sql<number>`count(*)`.mapWith(Number)
		})
		.from(claudeUsage)
		.where(
			and(
				gte(claudeUsage.createdAt, MONTH_START_SQL),
				userId ? eq(claudeUsage.userId, userId) : undefined
			)
		);
	return { spendUsd: row?.spendUsd ?? 0, calls: row?.calls ?? 0 };
}

export function effectiveUserBudgetUsd(
	access: { monthlyBudgetUsd: number | null } | null | undefined
): number {
	return access?.monthlyBudgetUsd ?? claudeConfig().defaultUserBudgetUsd;
}
