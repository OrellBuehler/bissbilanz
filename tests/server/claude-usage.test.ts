import { describe, expect, test, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { effectiveUserBudgetUsd, MONTH_START_SQL, SPENT_USD_SQL } from '$lib/server/claude/usage';
import { monthCallsSql, monthSpendUsdSql } from '$lib/server/claude/usage';
import { users } from '$lib/server/schema';

vi.mock('$lib/server/claude/config', () => ({
	claudeConfig: () => ({ defaultUserBudgetUsd: 10 })
}));

const dialect = new PgDialect();
const render = (fragment: Parameters<PgDialect['sqlToQuery']>[0]) =>
	dialect.sqlToQuery(fragment).sql.replace(/\s+/g, ' ');

describe('effectiveUserBudgetUsd', () => {
	test('falls back to the default without an access row or a budget', () => {
		expect(effectiveUserBudgetUsd(null)).toBe(10);
		expect(effectiveUserBudgetUsd(undefined)).toBe(10);
		expect(effectiveUserBudgetUsd({ monthlyBudgetUsd: null })).toBe(10);
	});

	test('uses the per-user budget, including zero', () => {
		expect(effectiveUserBudgetUsd({ monthlyBudgetUsd: 25.5 })).toBe(25.5);
		expect(effectiveUserBudgetUsd({ monthlyBudgetUsd: 0 })).toBe(0);
	});
});

describe('usage SQL fragments', () => {
	test('month start is the UTC calendar month', () => {
		expect(render(MONTH_START_SQL)).toBe(
			"(date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')"
		);
	});

	test('open reservations count at their estimate, the rest at settled cost', () => {
		const text = render(SPENT_USD_SQL);
		expect(text).toContain('"claude_usage"."reserved_usd"');
		expect(text).toContain('"claude_usage"."cost_usd"');
		expect(text).toContain("= 'reserved'");
	});

	test('per-user month subqueries correlate on the given column and filter by month', () => {
		const spend = render(monthSpendUsdSql(users.id));
		const calls = render(monthCallsSql(users.id));
		for (const text of [spend, calls]) {
			expect(text).toContain('"claude_usage"."user_id" = "users"."id"');
			expect(text).toContain('"claude_usage"."created_at" >= (date_trunc(');
		}
		expect(calls).toContain('count(*)');
	});
});
