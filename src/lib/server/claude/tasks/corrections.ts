import { and, eq, lt, lte, or, sql } from 'drizzle-orm';
import * as m from '$lib/paraglide/messages';
import { isLocale } from '$lib/paraglide/runtime';
import { getDB } from '../../db';
import type { TxOrDb } from '../../ownership';
import {
	aiTasks,
	claudeTaskCorrections,
	claudeTaskMessages,
	type ClaudeCorrectionState,
	type ClaudeTaskCorrection,
	type ClaudeTaskMessageOutcome
} from '../../schema';
import { LeaseLostError } from '../errors';
import { MAX_FAILURES, correctionFenceWhere, leaseUntil, withFence, type RunTx } from './runs';
import type { Fence } from './types';

const RETRY_DELAYS_MINUTES = [1, 5];

export const IN_FLIGHT_CORRECTION_STATES: readonly ClaudeCorrectionState[] = [
	'queued',
	'running',
	'retry_wait'
];

export type CorrectionFailureCode =
	| 'not_configured'
	| 'disabled'
	| 'no_access'
	| 'user_budget_exhausted'
	| 'global_budget_exhausted'
	| 'claude_error'
	| 'claude_refused'
	| 'claude_incomplete'
	| 'task_changed';

export type CorrectionContext = {
	fence: Fence;
	userId: string;
	taskId: string;
	locale: string | null;
};

const toLocale = (locale: string | null): 'en' | 'de' =>
	locale && isLocale(locale) ? locale : 'en';

export const correctionFailureText = (code: CorrectionFailureCode, locale: string | null) => {
	const options = { locale: toLocale(locale) };
	switch (code) {
		case 'not_configured':
		case 'disabled':
		case 'no_access':
			return m.claude_reply_failed_unavailable({}, options);
		case 'user_budget_exhausted':
		case 'global_budget_exhausted':
			return m.claude_reply_failed_budget({}, options);
		case 'claude_refused':
			return m.claude_reply_failed_refused({}, options);
		case 'claude_incomplete':
			return m.claude_reply_failed_incomplete({}, options);
		case 'task_changed':
			return m.claude_reply_failed_task_changed({}, options);
		case 'claude_error':
			return m.claude_reply_failed({}, options);
	}
};

export async function claimCorrection(
	taskId: string,
	instance: string
): Promise<ClaudeTaskCorrection | undefined> {
	const [claimed] = await getDB()
		.update(claudeTaskCorrections)
		.set({
			state: 'running',
			attempt: sql`${claudeTaskCorrections.attempt} + 1`,
			leaseOwner: instance,
			leaseExpiresAt: leaseUntil(),
			nextAttemptAt: null,
			failures: sql`${claudeTaskCorrections.failures} + CASE WHEN ${claudeTaskCorrections.state} = 'running' THEN 1 ELSE 0 END`,
			updatedAt: sql`now()`
		})
		.where(
			and(
				eq(claudeTaskCorrections.taskId, taskId),
				or(
					eq(claudeTaskCorrections.state, 'queued'),
					and(
						eq(claudeTaskCorrections.state, 'retry_wait'),
						lte(claudeTaskCorrections.nextAttemptAt, sql`now()`)
					),
					and(
						eq(claudeTaskCorrections.state, 'running'),
						lt(claudeTaskCorrections.leaseExpiresAt, sql`now()`)
					)
				)
			)
		)
		.returning();
	return claimed;
}

type CorrectionPatch = Partial<{
	state: ClaudeCorrectionState;
	failures: number;
	nextAttemptAt: Date | null;
	failureCode: CorrectionFailureCode | null;
	failureDetail: string | null;
}>;

export async function transitionCorrection(
	tx: RunTx,
	fence: Fence,
	patch: CorrectionPatch
): Promise<void> {
	const leaving = patch.state !== undefined && patch.state !== 'running';
	const rows = await tx
		.update(claudeTaskCorrections)
		.set({
			...patch,
			...(leaving ? { leaseOwner: null, leaseExpiresAt: null } : {}),
			updatedAt: sql`now()`
		})
		.where(correctionFenceWhere(fence))
		.returning({ taskId: claudeTaskCorrections.taskId });
	if (rows.length === 0) throw new LeaseLostError();
}

/**
 * Claude's answer in the thread. The task's updatedAt moves too, so the
 * conversation keeps the task out of the 30-day cleanup while it is active.
 */
export async function addAssistantMessage(
	tx: TxOrDb,
	input: { taskId: string; userId: string; text: string; outcome: ClaudeTaskMessageOutcome }
): Promise<void> {
	await tx.insert(claudeTaskMessages).values({
		taskId: input.taskId,
		userId: input.userId,
		role: 'assistant',
		text: input.text,
		outcome: input.outcome
	});
	await tx
		.update(aiTasks)
		.set({ updatedAt: new Date() })
		.where(and(eq(aiTasks.id, input.taskId), eq(aiTasks.userId, input.userId)));
}

/**
 * Ends a correction that did not work. Its changes were only staged, so the
 * diary is as the user left it; the thread says so and a new reply is possible.
 */
export function failCorrection(
	ctx: CorrectionContext,
	code: CorrectionFailureCode,
	detail: string | null = null
): Promise<void> {
	return withFence(ctx.fence, async (tx) => {
		await addAssistantMessage(tx, {
			taskId: ctx.taskId,
			userId: ctx.userId,
			text: correctionFailureText(code, ctx.locale),
			outcome: 'failed'
		});
		await transitionCorrection(tx, ctx.fence, {
			state: 'failed',
			failureCode: code,
			failureDetail: detail
		});
	});
}

export async function retryOrFailCorrection(
	ctx: CorrectionContext,
	failures: number,
	detail: string
): Promise<'retry_wait' | 'failed'> {
	if (failures + 1 >= MAX_FAILURES) {
		await failCorrection(ctx, 'claude_error', detail);
		return 'failed';
	}
	const delayMinutes = RETRY_DELAYS_MINUTES[failures] ?? RETRY_DELAYS_MINUTES.at(-1)!;
	await withFence(ctx.fence, (tx) =>
		transitionCorrection(tx, ctx.fence, {
			state: 'retry_wait',
			failures: failures + 1,
			nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
			failureDetail: detail
		})
	);
	return 'retry_wait';
}

export async function requeueCorrection(ctx: CorrectionContext): Promise<void> {
	await withFence(ctx.fence, (tx) => transitionCorrection(tx, ctx.fence, { state: 'queued' }));
}
