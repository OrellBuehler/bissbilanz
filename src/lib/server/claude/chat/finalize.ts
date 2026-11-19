import type Anthropic from '@anthropic-ai/sdk';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDB } from '../../db';
import {
	chatConversations,
	chatMessages,
	chatRuns,
	chatToolCalls,
	type ChatActionStatus,
	type ChatRun,
	type ChatRunStatus
} from '../../schema';
import { getChatCapabilitySafe } from './capability';
import { mergeChanges, type ChatChange } from './changes';
import { STALE_RUN_MS } from './constants';
import {
	appendEvents,
	foldParts,
	listRunEvents,
	notifyConversation,
	type ChatEvent
} from './events';
import { serializeMessage, serializeRun } from './store';
import { appendRaw, danglingToolUses, loadRaw } from './transcript';

export type RunEnding = {
	status: Extract<ChatRunStatus, 'completed' | 'failed' | 'cancelled' | 'interrupted'>;
	reason: string | null;
	error?: { code: string; message: string };
};

export type FinalizeOptions = RunEnding & {
	// The process that must still own a running run; omitted by request handlers and sweeps.
	instanceId?: string;
	// Statuses the run must be in; anything else is left alone.
	onlyIf?: ChatRunStatus[];
	// Only a running run whose heartbeat went stale (the restart sweep).
	requireStale?: boolean;
	// What a pending confirmation becomes.
	actionStatus?: Extract<ChatActionStatus, 'cancelled' | 'expired'>;
};

const TERMINAL: ChatRunStatus[] = ['completed', 'failed', 'cancelled', 'interrupted'];

const ERROR_MESSAGES: Record<string, string> = {
	not_configured: 'The assistant is not available right now.',
	disabled: 'The assistant is not available right now.',
	no_access: 'The assistant is not available for this account.',
	user_budget_exhausted: "This month's assistant budget is used up.",
	global_budget_exhausted: "The assistant's budget for this month is used up.",
	refusal: 'The assistant declined to answer this request.',
	api_error: 'The assistant service returned an error. Try again.',
	internal_error: 'The assistant stopped because of an internal error.'
};

export function notExecutedText(ending: RunEnding): string {
	if (ending.status === 'interrupted') {
		return 'Not executed: the server restarted before this call ran. Nothing was changed.';
	}
	switch (ending.reason) {
		case 'user_cancelled':
			return 'Not executed: the user stopped the assistant before this call ran. Nothing was changed.';
		case 'superseded':
			return 'Not executed: the user sent a new message instead of confirming. Nothing was changed.';
		case 'action_expired':
			return 'Not executed: the user did not confirm in time. Nothing was changed.';
		default:
			return `Not executed: the assistant stopped (${ending.reason ?? ending.status}) before this call ran. Nothing was changed.`;
	}
}

const UNKNOWN_OUTCOME =
	'Outcome unknown: the assistant stopped while this call ran. Check the data before retrying.';

export function changesOfParts(parts: ReturnType<typeof foldParts>): ChatChange[] {
	return mergeChanges(parts.flatMap((part) => (part.type === 'tool' ? part.changes : [])));
}

/**
 * Ends a run exactly once: resolves its pending confirmation, answers tool
 * calls the transcript still owes a result (so the next turn is a valid
 * request), stores the assistant message folded from the run's events, and
 * emits message_completed and run_finished. Returns null when the run was
 * already finished or the conditions do not hold.
 */
export async function finalizeRun(
	runId: string,
	options: FinalizeOptions
): Promise<ChatRun | null> {
	const db = getDB();
	const [current] = await db.select().from(chatRuns).where(eq(chatRuns.id, runId));
	if (!current || TERMINAL.includes(current.status as ChatRunStatus)) return null;
	const capability = await getChatCapabilitySafe(current.userId);

	const finished = await db.transaction(async (tx) => {
		const [conversation] = await tx
			.select({ id: chatConversations.id })
			.from(chatConversations)
			.where(eq(chatConversations.id, current.conversationId))
			.for('update');
		if (!conversation) return null;
		const [run] = await tx.select().from(chatRuns).where(eq(chatRuns.id, runId)).for('update');
		if (!run || TERMINAL.includes(run.status as ChatRunStatus)) return null;
		if (options.onlyIf && !options.onlyIf.includes(run.status as ChatRunStatus)) return null;
		if (options.instanceId && run.status === 'running' && run.leaseOwner !== options.instanceId) {
			return null;
		}
		if (options.requireStale) {
			const stale =
				run.status === 'running' &&
				(!run.heartbeatAt || run.heartbeatAt.getTime() < Date.now() - STALE_RUN_MS);
			if (!stale) return null;
		}

		const before: ChatEvent[] = [];
		const pending = await tx
			.update(chatToolCalls)
			.set({ actionStatus: options.actionStatus ?? 'cancelled', decidedAt: sql`now()` })
			.where(and(eq(chatToolCalls.runId, run.id), eq(chatToolCalls.actionStatus, 'pending')))
			.returning();
		for (const action of pending) {
			if (action.partIndex === null || !run.assistantMessageId) continue;
			before.push({
				type: 'action_resolved',
				runId: run.id,
				messageId: run.assistantMessageId,
				partIndex: action.partIndex,
				actionId: action.id,
				status: options.actionStatus ?? 'cancelled'
			});
		}

		const raw = await loadRaw(tx, run.conversationId);
		const dangling = danglingToolUses(raw);
		if (dangling.length > 0) {
			const calls = await tx
				.select()
				.from(chatToolCalls)
				.where(
					and(
						eq(chatToolCalls.conversationId, run.conversationId),
						inArray(
							chatToolCalls.toolUseId,
							dangling.map((block) => block.id)
						)
					)
				);
			const byToolUse = new Map(calls.map((call) => [call.toolUseId, call]));
			const results = dangling.map((block): Anthropic.ToolResultBlockParam => {
				const call = byToolUse.get(block.id);
				const text =
					call?.resultText ??
					(call?.execution === 'started' ? UNKNOWN_OUTCOME : notExecutedText(options));
				const isError = call?.resultText != null ? call.isError : true;
				return {
					type: 'tool_result',
					tool_use_id: block.id,
					content: text,
					...(isError ? { is_error: true } : {})
				};
			});
			await appendRaw(tx, run.conversationId, run.id, [{ role: 'user', content: results }]);
		}
		await tx
			.update(chatToolCalls)
			.set({
				execution: 'unknown',
				resultText: UNKNOWN_OUTCOME,
				isError: true,
				finishedAt: sql`now()`
			})
			.where(and(eq(chatToolCalls.runId, run.id), eq(chatToolCalls.execution, 'started')));

		if (options.status === 'failed' || options.status === 'interrupted') {
			const code = options.error?.code ?? options.reason ?? options.status;
			before.push({
				type: 'error',
				runId: run.id,
				code,
				error: options.error?.message || ERROR_MESSAGES[code] || 'The assistant stopped.'
			});
		}
		await appendEvents(tx, run.conversationId, before);

		let message = null;
		let changes: ChatChange[] = [];
		if (run.assistantMessageId) {
			const parts = foldParts(await listRunEvents(tx, run.conversationId, run.id));
			changes = changesOfParts(parts);
			[message] = await tx
				.update(chatMessages)
				.set({
					parts,
					status: options.status,
					reason: options.reason,
					updatedAt: sql`now()`
				})
				.where(eq(chatMessages.id, run.assistantMessageId))
				.returning();
		}
		const [updated] = await tx
			.update(chatRuns)
			.set({
				status: options.status,
				reason: options.reason,
				changes,
				leaseOwner: null,
				heartbeatAt: null,
				finishedAt: sql`now()`,
				updatedAt: sql`now()`
			})
			.where(eq(chatRuns.id, run.id))
			.returning();
		const view = serializeRun(updated!);
		await appendEvents(tx, run.conversationId, [
			...(message
				? [
						{
							type: 'message_completed' as const,
							runId: run.id,
							messageId: message.id,
							message: serializeMessage(message)
						}
					]
				: []),
			{
				type: 'run_finished',
				runId: run.id,
				messageId: run.assistantMessageId,
				status: view.status,
				reason: view.reason,
				changed: view.changed,
				changes: view.changes,
				run: view,
				capability
			}
		]);
		return updated!;
	});
	if (finished) notifyConversation(finished.conversationId);
	return finished;
}
