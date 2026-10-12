import { and, eq, lt, sql } from 'drizzle-orm';
import { getDB } from '../db';
import { claudeAccess, claudeUsage, userPreferences, type ClaudeUsageStatus } from '../schema';
import { getClaudeEnabled } from './settings';
import { effectiveUserBudgetUsd, getMonthSpend } from './usage';
import { claudeConfig } from './config';
import { BUDGET_LOCK_KEY, STALE_RESERVATION_MINUTES } from './constants';
import { ClaudeGateError, ClaudeProcessorChangedError } from './errors';

const EPSILON = 1e-9;

export type ReserveInput = {
	userId: string;
	feature: string;
	model: string;
	aiTaskId?: string;
	reservedUsd: number;
	requireClaudeProcessor: boolean;
};

export async function reserveCall(input: ReserveInput): Promise<string> {
	return getDB().transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(${BUDGET_LOCK_KEY})`);

		if (!(await getClaudeEnabled(tx))) throw new ClaudeGateError('disabled');

		const [access] = await tx
			.select({ enabled: claudeAccess.enabled, monthlyBudgetUsd: claudeAccess.monthlyBudgetUsd })
			.from(claudeAccess)
			.where(eq(claudeAccess.userId, input.userId));
		if (!access?.enabled) throw new ClaudeGateError('no_access');

		if (input.requireClaudeProcessor) {
			const [prefs] = await tx
				.select({ processor: userPreferences.aiTaskProcessor })
				.from(userPreferences)
				.where(eq(userPreferences.userId, input.userId));
			if (prefs?.processor !== 'claude') throw new ClaudeProcessorChangedError();
		}

		const user = await getMonthSpend(tx, { userId: input.userId });
		if (user.spendUsd + input.reservedUsd > effectiveUserBudgetUsd(access) + EPSILON) {
			throw new ClaudeGateError('user_budget_exhausted');
		}
		const global = await getMonthSpend(tx);
		if (global.spendUsd + input.reservedUsd > claudeConfig().globalMonthlyBudgetUsd + EPSILON) {
			throw new ClaudeGateError('global_budget_exhausted');
		}

		const [row] = await tx
			.insert(claudeUsage)
			.values({
				userId: input.userId,
				feature: input.feature,
				model: input.model,
				status: 'reserved',
				reservedUsd: input.reservedUsd,
				aiTaskId: input.aiTaskId ?? null
			})
			.returning({ id: claudeUsage.id });
		if (!row) throw new Error('Failed to reserve Claude usage');
		return row.id;
	});
}

export type Settlement = {
	status: Extract<ClaudeUsageStatus, 'succeeded' | 'failed'>;
	costUsd: number;
	model?: string;
	inputTokens?: number;
	outputTokens?: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	errorCode?: string | null;
	requestId?: string | null;
};

export async function settleCall(usageId: string, settlement: Settlement): Promise<void> {
	await getDB()
		.update(claudeUsage)
		.set({
			status: settlement.status,
			costUsd: settlement.costUsd,
			...(settlement.model ? { model: settlement.model } : {}),
			inputTokens: settlement.inputTokens ?? 0,
			outputTokens: settlement.outputTokens ?? 0,
			cacheReadInputTokens: settlement.cacheReadInputTokens ?? 0,
			cacheCreationInputTokens: settlement.cacheCreationInputTokens ?? 0,
			errorCode: settlement.errorCode ?? null,
			requestId: settlement.requestId ?? null,
			settledAt: sql`now()`
		})
		.where(eq(claudeUsage.id, usageId));
}

export async function abandonStaleReservations(): Promise<number> {
	const rows = await getDB()
		.update(claudeUsage)
		.set({ status: 'abandoned', costUsd: sql`${claudeUsage.reservedUsd}`, settledAt: sql`now()` })
		.where(
			and(
				eq(claudeUsage.status, 'reserved'),
				lt(claudeUsage.createdAt, sql`now() - make_interval(mins => ${STALE_RESERVATION_MINUTES})`)
			)
		)
		.returning({ id: claudeUsage.id });
	return rows.length;
}
