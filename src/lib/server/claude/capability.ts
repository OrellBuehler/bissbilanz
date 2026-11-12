import * as Sentry from '@sentry/sveltekit';
import { eq } from 'drizzle-orm';
import { getDB } from '../db';
import { claudeAccess, userPreferences } from '../schema';
import { serverToolAllowanceOf } from './call';
import { claudeConfig } from './config';
import { TASK_MAX_TOKENS } from './constants';
import { ClaudeGateError, ClaudeProcessorChangedError, type ClaudeGateCode } from './errors';
import { resolveClaudeModel, taskServerTools } from './models';
import { maxCallCostUsd } from './pricing';
import { getClaudeEnabled } from './settings';
import { effectiveUserBudgetUsd, getMonthSpend } from './usage';

export const FIRST_CALL_INPUT_TOKENS = 21_000;

const round2 = (value: number) => Math.round(value * 100) / 100;

export const minTaskCallUsd = (model: string) =>
	maxCallCostUsd(
		model,
		FIRST_CALL_INPUT_TOKENS,
		TASK_MAX_TOKENS,
		serverToolAllowanceOf(taskServerTools(model))
	);

export type ClaudeCapability = { available: boolean; remainingBudgetUsd?: number };

async function checkAccessGates(userId: string) {
	const config = claudeConfig();
	if (!config.configured) throw new ClaudeGateError('not_configured');
	const db = getDB();
	if (!(await getClaudeEnabled(db))) throw new ClaudeGateError('disabled');
	const [access] = await db
		.select({
			enabled: claudeAccess.enabled,
			monthlyBudgetUsd: claudeAccess.monthlyBudgetUsd,
			model: claudeAccess.model
		})
		.from(claudeAccess)
		.where(eq(claudeAccess.userId, userId));
	if (!access?.enabled) throw new ClaudeGateError('no_access');
	return { db, config, access };
}

// The access gates without the processor preference: a reply to a task Claude
// already handled does not depend on where new tasks are routed.
export async function assertClaudeGates(userId: string): Promise<void> {
	await checkAccessGates(userId);
}

export async function assertClaudeAllowed(userId: string): Promise<void> {
	const { db } = await checkAccessGates(userId);
	const [prefs] = await db
		.select({ processor: userPreferences.aiTaskProcessor })
		.from(userPreferences)
		.where(eq(userPreferences.userId, userId));
	if (prefs?.processor !== 'claude') throw new ClaudeProcessorChangedError();
}

export type ClaudeHeadroom = { available: boolean; remainingUsd: number };

export async function getClaudeHeadroom(userId: string): Promise<ClaudeHeadroom> {
	const { available, remainingUsd } = await getClaudeGateState(userId);
	return { available, remainingUsd };
}

export type ClaudeGateState = ClaudeHeadroom & { blockedBy: ClaudeGateCode | null };

/** Headroom plus which gate is closed, when one is. */
export async function getClaudeGateState(userId: string): Promise<ClaudeGateState> {
	let gates: Awaited<ReturnType<typeof checkAccessGates>>;
	try {
		gates = await checkAccessGates(userId);
	} catch (error) {
		if (error instanceof ClaudeGateError) {
			return { available: false, remainingUsd: 0, blockedBy: error.code };
		}
		throw error;
	}
	const { db, config, access } = gates;
	const [user, global] = await Promise.all([getMonthSpend(db, { userId }), getMonthSpend(db)]);
	const userRemaining = effectiveUserBudgetUsd(access) - user.spendUsd;
	const globalRemaining = config.globalMonthlyBudgetUsd - global.spendUsd;
	const remainingUsd = Math.min(userRemaining, globalRemaining);
	const available = remainingUsd >= minTaskCallUsd(resolveClaudeModel(access.model));
	return {
		available,
		remainingUsd,
		blockedBy: available
			? null
			: userRemaining <= globalRemaining
				? 'user_budget_exhausted'
				: 'global_budget_exhausted'
	};
}

export async function getClaudeCapability(userId: string): Promise<ClaudeCapability> {
	const { available, remainingUsd } = await getClaudeHeadroom(userId);
	if (!available) return { available: false };
	return { available: true, remainingBudgetUsd: round2(Math.max(0, remainingUsd)) };
}

export async function getClaudeCapabilitySafe(userId: string): Promise<ClaudeCapability> {
	try {
		return await getClaudeCapability(userId);
	} catch (error) {
		Sentry.captureException(error, { tags: { job: 'claude-capability' } });
		return { available: false };
	}
}
