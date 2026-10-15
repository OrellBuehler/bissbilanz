import * as Sentry from '@sentry/sveltekit';
import { eq } from 'drizzle-orm';
import { getDB } from '../db';
import { claudeAccess, userPreferences } from '../schema';
import { claudeConfig } from './config';
import { TASK_MAX_TOKENS } from './constants';
import { ClaudeGateError, ClaudeProcessorChangedError } from './errors';
import { maxCallCostUsd } from './pricing';
import { getClaudeEnabled } from './settings';
import { effectiveUserBudgetUsd, getMonthSpend } from './usage';

const MIN_TASK_INPUT_TOKENS = 20_000;

const round2 = (value: number) => Math.round(value * 100) / 100;

export const minTaskCallUsd = () =>
	maxCallCostUsd(claudeConfig().model, MIN_TASK_INPUT_TOKENS, TASK_MAX_TOKENS);

export type ClaudeCapability = { available: boolean; remainingBudgetUsd?: number };

async function checkAccessGates(userId: string) {
	const config = claudeConfig();
	if (!config.configured) throw new ClaudeGateError('not_configured');
	const db = getDB();
	if (!(await getClaudeEnabled(db))) throw new ClaudeGateError('disabled');
	const [access] = await db
		.select({ enabled: claudeAccess.enabled, monthlyBudgetUsd: claudeAccess.monthlyBudgetUsd })
		.from(claudeAccess)
		.where(eq(claudeAccess.userId, userId));
	if (!access?.enabled) throw new ClaudeGateError('no_access');
	return { db, config, access };
}

export async function assertClaudeAllowed(userId: string): Promise<void> {
	const { db } = await checkAccessGates(userId);
	const [prefs] = await db
		.select({ processor: userPreferences.aiTaskProcessor })
		.from(userPreferences)
		.where(eq(userPreferences.userId, userId));
	if (prefs?.processor !== 'claude') throw new ClaudeProcessorChangedError();
}

export async function getClaudeCapability(userId: string): Promise<ClaudeCapability> {
	let gates: Awaited<ReturnType<typeof checkAccessGates>>;
	try {
		gates = await checkAccessGates(userId);
	} catch (error) {
		if (error instanceof ClaudeGateError) return { available: false };
		throw error;
	}
	const { db, config, access } = gates;
	const [user, global] = await Promise.all([getMonthSpend(db, { userId }), getMonthSpend(db)]);
	const remainingUsd = Math.min(
		effectiveUserBudgetUsd(access) - user.spendUsd,
		config.globalMonthlyBudgetUsd - global.spendUsd
	);
	if (remainingUsd < minTaskCallUsd()) return { available: false };
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
