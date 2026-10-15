import { and, eq } from 'drizzle-orm';
import * as m from '$lib/paraglide/messages';
import { isLocale } from '$lib/paraglide/runtime';
import { aiTasks, type ClaudeFailureCode } from '../../schema';
import { completeAiTaskBy, dismissAiTaskByAgent } from '../../ai-tasks';
import type { ClaudeGateCode } from '../errors';
import {
	listLoggedLedger,
	loadRun,
	transitionFenced,
	withFence,
	type RunTx,
	MAX_FAILURES
} from './runs';
import type { Fence, Proposal, TaskMode, TaskOutcome } from './types';

type ServerDismissCode = Extract<
	ClaudeFailureCode,
	'claude_error' | 'claude_refused' | 'claude_incomplete' | 'claude_stopped'
>;

const RETRY_DELAYS_MINUTES = [1, 5];

const toLocale = (locale: string | null): 'en' | 'de' =>
	locale && isLocale(locale) ? locale : 'en';

const reasonFor = (code: ServerDismissCode, locale: 'en' | 'de'): string => {
	switch (code) {
		case 'claude_error':
			return m.claude_task_reason_failed({}, { locale });
		case 'claude_refused':
			return m.claude_task_reason_refused({}, { locale });
		case 'claude_incomplete':
			return m.claude_task_reason_incomplete({}, { locale });
		case 'claude_stopped':
			return m.claude_task_reason_stopped({}, { locale });
	}
};

export type OutcomeContext = {
	fence: Fence;
	userId: string;
	taskId: string;
	locale: string | null;
};

async function dismissInTx(
	tx: RunTx,
	ctx: OutcomeContext,
	reason: string,
	failureCode: ClaudeFailureCode | null,
	failureDetail: string | null
): Promise<TaskOutcome> {
	const logged = await listLoggedLedger(tx, ctx.taskId, ctx.userId);
	const text =
		logged.length > 0
			? `${reason} ${m.claude_task_partial_suffix(
					{ items: logged.map((row) => row.summary).join(', ') },
					{ locale: toLocale(ctx.locale) }
				)}`
			: reason;
	const result = await dismissAiTaskByAgent(ctx.userId, ctx.taskId, text, 'claude', {
		onlyIfPending: true,
		tx,
		createdEntryIds: logged.map((row) => row.entryId)
	});
	if (!result.success) throw result.error;
	if (!result.data) {
		await transitionFenced(tx, ctx.fence, { state: 'superseded', proposal: null });
		return 'superseded';
	}
	await transitionFenced(tx, ctx.fence, {
		state: 'dismissed',
		proposal: null,
		failureCode,
		failureDetail
	});
	return 'dismissed';
}

async function taskIsPending(tx: RunTx, ctx: OutcomeContext): Promise<boolean> {
	const [row] = await tx
		.select({ id: aiTasks.id })
		.from(aiTasks)
		.where(
			and(eq(aiTasks.id, ctx.taskId), eq(aiTasks.userId, ctx.userId), eq(aiTasks.status, 'pending'))
		);
	return !!row;
}

export function dismissRun(
	ctx: OutcomeContext,
	code: ServerDismissCode,
	detail: string | null = null
): Promise<TaskOutcome> {
	return withFence(ctx.fence, (tx) =>
		dismissInTx(tx, ctx, reasonFor(code, toLocale(ctx.locale)), code, detail)
	);
}

export function dismissByModel(ctx: OutcomeContext, reason: string): Promise<TaskOutcome> {
	return withFence(ctx.fence, (tx) => dismissInTx(tx, ctx, reason, null, null));
}

export function completeByModel(
	ctx: OutcomeContext,
	mode: TaskMode,
	summary: string
): Promise<TaskOutcome> {
	return withFence(ctx.fence, async (tx) => {
		if (mode === 'auto_log') {
			const logged = await listLoggedLedger(tx, ctx.taskId, ctx.userId);
			if (logged.length === 0) return dismissInTx(tx, ctx, summary, null, null);
			const done = await completeAiTaskBy(tx, ctx.userId, ctx.taskId, {
				resultSummary: summary,
				entryIds: logged.map((row) => row.entryId),
				processedBy: 'claude'
			});
			if (!done) {
				await transitionFenced(tx, ctx.fence, { state: 'superseded', proposal: null });
				return 'superseded';
			}
			await transitionFenced(tx, ctx.fence, { state: 'succeeded' });
			return 'completed';
		}

		const run = await loadRun(ctx.taskId, tx);
		const proposal = (run?.proposal as Proposal | null) ?? { summary: null, items: [] };
		if (proposal.items.length === 0) return dismissInTx(tx, ctx, summary, null, null);
		if (!(await taskIsPending(tx, ctx))) {
			await transitionFenced(tx, ctx.fence, { state: 'superseded', proposal: null });
			return 'superseded';
		}
		await transitionFenced(tx, ctx.fence, {
			state: 'proposed',
			proposal: { ...proposal, summary }
		});
		return 'proposed';
	});
}

export async function blockRun(ctx: OutcomeContext, code: ClaudeGateCode): Promise<void> {
	await withFence(ctx.fence, (tx) =>
		transitionFenced(tx, ctx.fence, { state: 'blocked', failureCode: code, proposal: null })
	);
}

export async function supersedeRun(ctx: OutcomeContext): Promise<void> {
	await withFence(ctx.fence, (tx) =>
		transitionFenced(tx, ctx.fence, { state: 'superseded', proposal: null })
	);
}

export async function retryOrDismissRun(
	ctx: OutcomeContext,
	failures: number,
	detail: string
): Promise<'retry_wait' | TaskOutcome> {
	if (failures + 1 >= MAX_FAILURES) {
		await dismissRun(ctx, 'claude_error', detail);
		return 'dismissed';
	}
	const delayMinutes = RETRY_DELAYS_MINUTES[failures] ?? RETRY_DELAYS_MINUTES.at(-1)!;
	await withFence(ctx.fence, (tx) =>
		transitionFenced(tx, ctx.fence, {
			state: 'retry_wait',
			failures: failures + 1,
			nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
			failureDetail: detail,
			proposal: null
		})
	);
	return 'retry_wait';
}

async function hasLoggedEntries(ctx: OutcomeContext, mode: TaskMode): Promise<boolean> {
	if (mode !== 'auto_log') return false;
	const logged = await withFence(ctx.fence, (tx) => listLoggedLedger(tx, ctx.taskId, ctx.userId));
	return logged.length > 0;
}

export async function stopOrBlockRun(
	ctx: OutcomeContext,
	mode: TaskMode,
	code: ClaudeGateCode
): Promise<'blocked' | TaskOutcome> {
	if (await hasLoggedEntries(ctx, mode)) {
		await dismissRun(ctx, 'claude_stopped', code);
		return 'dismissed';
	}
	await blockRun(ctx, code);
	return 'blocked';
}

export async function supersedeOrStopRun(
	ctx: OutcomeContext,
	mode: TaskMode
): Promise<TaskOutcome> {
	if (await hasLoggedEntries(ctx, mode)) {
		await dismissRun(ctx, 'claude_stopped', 'processor_changed');
		return 'dismissed';
	}
	await supersedeRun(ctx);
	return 'superseded';
}

export async function requeueRun(ctx: OutcomeContext): Promise<void> {
	await withFence(ctx.fence, (tx) =>
		transitionFenced(tx, ctx.fence, { state: 'queued', proposal: null })
	);
}
