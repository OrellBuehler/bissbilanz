import * as Sentry from '@sentry/sveltekit';
import { and, asc, count, eq, gt, inArray, isNull, min, ne, sql } from 'drizzle-orm';
import { getDB } from '../../db';
import { ApiError } from '../../errors';
import type { TxOrDb } from '../../ownership';
import {
	aiTasks,
	claudeTaskCorrections,
	claudeTaskMessages,
	type ClaudeCorrectionState
} from '../../schema';
import { getClaudeGateState, type ClaudeGateState } from '../capability';
import { IN_FLIGHT_CORRECTION_STATES } from './corrections';
import { wakeClaudeCorrection } from './executor';
import type { CorrectionPublicState, ReplyBlockedReason } from './reply-codes';

export const MAX_REPLIES_PER_TASK = 5;
export const MAX_REPLIES_PER_DAY = 20;
// Failed corrections do not use up a task's replies, so a task that keeps
// failing is paused for the rest of the window instead.
export const MAX_FAILED_CORRECTIONS_PER_DAY = 3;
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

const PUBLIC_STATES: Record<ClaudeCorrectionState, CorrectionPublicState> = {
	queued: 'queued',
	running: 'running',
	retry_wait: 'retrying',
	succeeded: 'idle',
	failed: 'failed'
};

const REASON_STATUS: Record<ReplyBlockedReason, number> = {
	not_processed_by_server: 409,
	not_completed: 409,
	correction_in_flight: 409,
	reply_limit_reached: 409,
	failed_too_often: 429,
	processor_unavailable: 403,
	budget_exhausted: 403,
	rate_limited: 429
};

const REASON_MESSAGE: Record<ReplyBlockedReason, string> = {
	not_processed_by_server: 'Only tasks Claude processed on the server take replies',
	not_completed: 'Only completed tasks take replies',
	correction_in_flight: 'Claude is still working on the previous reply',
	reply_limit_reached: `A task takes at most ${MAX_REPLIES_PER_TASK} replies`,
	failed_too_often: `Corrections of this task failed ${MAX_FAILED_CORRECTIONS_PER_DAY} times in the last 24 hours`,
	processor_unavailable: 'Claude is not available for this account right now',
	budget_exhausted: "Claude's budget is used up for this month",
	rate_limited: `At most ${MAX_REPLIES_PER_DAY} replies per day`
};

export class ReplyRejectedError extends ApiError {
	constructor(
		readonly code: ReplyBlockedReason | 'task_not_found',
		readonly retryAfterSeconds: number | null = null
	) {
		super(
			code === 'task_not_found' ? 404 : REASON_STATUS[code],
			code === 'task_not_found' ? 'AI task not found' : REASON_MESSAGE[code]
		);
		this.name = 'ReplyRejectedError';
	}
}

const gateReason = (gate: ClaudeGateState): ReplyBlockedReason | null => {
	if (gate.available) return null;
	return gate.blockedBy === 'user_budget_exhausted' || gate.blockedBy === 'global_budget_exhausted'
		? 'budget_exhausted'
		: 'processor_unavailable';
};

type ReplyWindow = { count: number; oldest: Date | null };

const windowStart = () => new Date(Date.now() - REPLY_WINDOW_MS);

async function replyWindow(db: TxOrDb, userId: string): Promise<ReplyWindow> {
	const [row] = await db
		.select({ count: count(), oldest: min(claudeTaskMessages.createdAt) })
		.from(claudeTaskMessages)
		.where(
			and(
				eq(claudeTaskMessages.userId, userId),
				eq(claudeTaskMessages.role, 'user'),
				gt(claudeTaskMessages.createdAt, windowStart())
			)
		);
	return { count: Number(row?.count ?? 0), oldest: row?.oldest ?? null };
}

async function failureWindow(db: TxOrDb, taskId: string): Promise<ReplyWindow> {
	const [row] = await db
		.select({ count: count(), oldest: min(claudeTaskMessages.createdAt) })
		.from(claudeTaskMessages)
		.where(
			and(
				eq(claudeTaskMessages.taskId, taskId),
				eq(claudeTaskMessages.role, 'assistant'),
				eq(claudeTaskMessages.outcome, 'failed'),
				gt(claudeTaskMessages.createdAt, windowStart())
			)
		);
	return { count: Number(row?.count ?? 0), oldest: row?.oldest ?? null };
}

const retryAfter = (window: ReplyWindow) =>
	window.oldest
		? Math.max(1, Math.ceil((window.oldest.getTime() + REPLY_WINDOW_MS - Date.now()) / 1000))
		: 60;

type ReplyFacts = {
	processedBy: string | null;
	status: string;
	correctionState: ClaudeCorrectionState | null;
	// Replies Claude answered; a reply whose correction failed does not count.
	answeredReplies: number;
	// The task's failed corrections within the window.
	failures: ReplyWindow;
	gate: ReplyBlockedReason | null;
	window: ReplyWindow;
};

/** Why the user cannot reply right now, in the order the endpoint checks it; null when they can. */
export function replyBlockedReason(facts: ReplyFacts): ReplyBlockedReason | null {
	if (facts.processedBy !== 'claude') return 'not_processed_by_server';
	if (facts.status !== 'completed') return 'not_completed';
	if (facts.correctionState && IN_FLIGHT_CORRECTION_STATES.includes(facts.correctionState)) {
		return 'correction_in_flight';
	}
	if (facts.answeredReplies >= MAX_REPLIES_PER_TASK) return 'reply_limit_reached';
	if (facts.failures.count >= MAX_FAILED_CORRECTIONS_PER_DAY) return 'failed_too_often';
	if (facts.gate) return facts.gate;
	if (facts.window.count >= MAX_REPLIES_PER_DAY) return 'rate_limited';
	return null;
}

async function gateFor(userId: string): Promise<ReplyBlockedReason | null> {
	try {
		return gateReason(await getClaudeGateState(userId));
	} catch (error) {
		Sentry.captureException(error, { tags: { job: 'claude-reply-gate' } });
		return 'processor_unavailable';
	}
}

/**
 * Adds the user's reply to the thread and queues the correction that answers
 * it. The task row is locked first, like a correction's own writes, so two
 * replies at once cannot both find the task idle.
 */
export async function postTaskReply(userId: string, taskId: string, text: string) {
	const gate = gateReason(await getClaudeGateState(userId));
	const task = await getDB().transaction(async (tx) => {
		const [task] = await tx
			.select()
			.from(aiTasks)
			.where(and(eq(aiTasks.id, taskId), eq(aiTasks.userId, userId)))
			.for('update');
		if (!task) throw new ReplyRejectedError('task_not_found');
		const [correction] = await tx
			.select({ state: claudeTaskCorrections.state })
			.from(claudeTaskCorrections)
			.where(eq(claudeTaskCorrections.taskId, taskId))
			.for('update');
		const [answered] = await tx
			.select({ count: count() })
			.from(claudeTaskMessages)
			.where(
				and(
					eq(claudeTaskMessages.taskId, taskId),
					eq(claudeTaskMessages.role, 'assistant'),
					ne(claudeTaskMessages.outcome, 'failed')
				)
			);
		const window = await replyWindow(tx, userId);
		const failures = await failureWindow(tx, taskId);
		const reason = replyBlockedReason({
			processedBy: task.processedBy,
			status: task.status,
			correctionState: (correction?.state as ClaudeCorrectionState | undefined) ?? null,
			answeredReplies: Number(answered?.count ?? 0),
			failures,
			gate,
			window
		});
		if (reason) {
			throw new ReplyRejectedError(
				reason,
				reason === 'rate_limited'
					? retryAfter(window)
					: reason === 'failed_too_often'
						? retryAfter(failures)
						: null
			);
		}

		const [message] = await tx
			.insert(claudeTaskMessages)
			.values({ taskId, userId, role: 'user', text })
			.returning({ id: claudeTaskMessages.id });
		const reset = {
			messageId: message!.id,
			state: 'queued',
			failures: 0,
			nextAttemptAt: null,
			failureCode: null,
			failureDetail: null,
			leaseOwner: null,
			leaseExpiresAt: null,
			updatedAt: sql`now()`
		};
		await tx
			.insert(claudeTaskCorrections)
			.values({ taskId, userId, ...reset })
			.onConflictDoUpdate({ target: claudeTaskCorrections.taskId, set: reset });
		return task;
	});
	wakeClaudeCorrection(taskId, userId);
	return task;
}

export type ClaudeThreadMessage = {
	id: string;
	role: string;
	text: string;
	outcome: string | null;
	createdAt: string;
	unread: boolean;
};

export type ClaudeThread = {
	messages: ClaudeThreadMessage[];
	correctionState: CorrectionPublicState;
	canReply: boolean;
	replyBlockedReason: ReplyBlockedReason | null;
	repliesRemaining: number;
	unreadReplies: number;
};

type ThreadTask = { id: string; userId: string; status: string; processedBy: string | null };

/**
 * The thread of every task Claude resolved, keyed by task id. A completed task
 * always has one (it can take a reply); another status only when a
 * conversation exists already.
 */
export async function loadClaudeThreads(tasks: ThreadTask[]): Promise<Map<string, ClaudeThread>> {
	const threads = new Map<string, ClaudeThread>();
	const claudeTasks = tasks.filter((task) => task.processedBy === 'claude');
	if (claudeTasks.length === 0) return threads;
	const db = getDB();
	const ids = claudeTasks.map((task) => task.id);
	const [messages, corrections] = await Promise.all([
		db
			.select()
			.from(claudeTaskMessages)
			.where(inArray(claudeTaskMessages.taskId, ids))
			.orderBy(asc(claudeTaskMessages.createdAt), asc(claudeTaskMessages.id)),
		db
			.select({ taskId: claudeTaskCorrections.taskId, state: claudeTaskCorrections.state })
			.from(claudeTaskCorrections)
			.where(inArray(claudeTaskCorrections.taskId, ids))
	]);
	const states = new Map(
		corrections.map((row) => [row.taskId, row.state as ClaudeCorrectionState])
	);
	const userIds = [...new Set(claudeTasks.map((task) => task.userId))];
	const userFacts = new Map(
		await Promise.all(
			userIds.map(
				async (userId) =>
					[userId, { gate: await gateFor(userId), window: await replyWindow(db, userId) }] as const
			)
		)
	);

	for (const task of claudeTasks) {
		const own = messages.filter((message) => message.taskId === task.id);
		if (task.status !== 'completed' && own.length === 0) continue;
		const facts = userFacts.get(task.userId)!;
		const state = states.get(task.id) ?? null;
		const answeredReplies = own.filter(
			(message) => message.role === 'assistant' && message.outcome !== 'failed'
		).length;
		const inFlight = state !== null && IN_FLIGHT_CORRECTION_STATES.includes(state) ? 1 : 0;
		const since = windowStart();
		const recentFailures = own.filter(
			(message) => message.outcome === 'failed' && message.createdAt > since
		);
		const reason = replyBlockedReason({
			processedBy: task.processedBy,
			status: task.status,
			correctionState: state,
			answeredReplies,
			failures: {
				count: recentFailures.length,
				oldest: recentFailures[0]?.createdAt ?? null
			},
			gate: facts.gate,
			window: facts.window
		});
		const unread = (message: (typeof own)[number]) =>
			message.role === 'assistant' && message.readAt === null;
		threads.set(task.id, {
			messages: own.map((message) => ({
				id: message.id,
				role: message.role,
				text: message.text,
				outcome: message.outcome,
				createdAt: message.createdAt.toISOString(),
				unread: unread(message)
			})),
			correctionState: state ? PUBLIC_STATES[state] : 'idle',
			canReply: reason === null,
			replyBlockedReason: reason,
			repliesRemaining: Math.max(0, MAX_REPLIES_PER_TASK - answeredReplies - inFlight),
			unreadReplies: own.filter(unread).length
		});
	}
	return threads;
}

/**
 * Marks the answers the client names as seen. By id, never by task: an answer
 * that arrived after the client's last read stays unread until it is shown.
 */
export async function markRepliesRead(userId: string, messageIds: string[]): Promise<number> {
	if (messageIds.length === 0) return 0;
	const rows = await getDB()
		.update(claudeTaskMessages)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(claudeTaskMessages.userId, userId),
				eq(claudeTaskMessages.role, 'assistant'),
				isNull(claudeTaskMessages.readAt),
				inArray(claudeTaskMessages.id, messageIds)
			)
		)
		.returning({ id: claudeTaskMessages.id });
	return rows.length;
}
