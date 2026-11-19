import * as Sentry from '@sentry/sveltekit';
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { getDB } from '../../db';
import { chatMessageLog, chatRuns, chatToolCalls } from '../../schema';
import { assertClaudeGates } from '../capability';
import { ClaudeGateError } from '../errors';
import { onClaudeAccessChanged } from '../events';
import {
	CHAT_DAY_WINDOW_MS,
	MAX_CONCURRENT_CHAT_RUNS,
	MAX_CONCURRENT_CHAT_RUNS_PER_USER,
	STALE_RUN_MS,
	SWEEP_INTERVAL_MS
} from './constants';
import { pruneTextDeltas } from './events';
import { finalizeRun } from './finalize';
import { executeChatRun, type StopReason } from './runner';

const instanceId = crypto.randomUUID();

type Active = {
	userId: string;
	controller: AbortController;
	stop?: StopReason;
	done: Promise<void>;
	// Woken again while the job was still winding down (e.g. an approval that
	// arrived as the run paused): start it once more when the job ends.
	again?: boolean;
};

const queue: { runId: string; userId: string }[] = [];
const queued = new Set<string>();
const active = new Map<string, Active>();
let started = false;

const runningFor = (userId: string) =>
	[...active.values()].filter((entry) => entry.userId === userId).length;

function pump(): void {
	while (active.size < MAX_CONCURRENT_CHAT_RUNS) {
		const index = queue.findIndex(
			(job) => runningFor(job.userId) < MAX_CONCURRENT_CHAT_RUNS_PER_USER
		);
		if (index === -1) return;
		const [job] = queue.splice(index, 1);
		queued.delete(job!.runId);
		start(job!.runId, job!.userId);
	}
}

function start(runId: string, userId: string): void {
	const controller = new AbortController();
	const entry: Active = { userId, controller, done: Promise.resolve() };
	entry.done = executeChatRun(runId, {
		signal: controller.signal,
		instanceId,
		stopReason: () => entry.stop
	})
		.catch((error) => {
			Sentry.captureException(error, { tags: { job: 'chat-run' }, extra: { runId } });
		})
		.finally(() => {
			active.delete(runId);
			if (entry.again && !entry.stop) enqueueChatRun(runId, userId);
			else pump();
		});
	active.set(runId, entry);
}

/** Queues a run that is in status 'queued'; claiming it is atomic, so a duplicate wake-up is harmless. */
export function enqueueChatRun(runId: string, userId: string): void {
	const running = active.get(runId);
	if (running) {
		running.again = true;
		return;
	}
	if (queued.has(runId)) return;
	queued.add(runId);
	queue.push({ runId, userId });
	pump();
}

// A tool call in flight is not interrupted; after this the caller finishes the
// run itself and the fenced writes keep the old job from adding to it.
const STOP_WAIT_MS = 10_000;

/**
 * Stops a run this process is working on and waits until it has wound down.
 * Returns false when the run is not active here (it is queued, paused, or owned
 * by another process).
 */
export async function stopChatRun(runId: string, reason: StopReason): Promise<boolean> {
	const index = queue.findIndex((job) => job.runId === runId);
	if (index !== -1) {
		queue.splice(index, 1);
		queued.delete(runId);
	}
	const entry = active.get(runId);
	if (!entry) return false;
	entry.stop ??= reason;
	entry.controller.abort();
	let timer: ReturnType<typeof setTimeout> | undefined;
	await Promise.race([
		entry.done,
		new Promise<void>((resolve) => {
			timer = setTimeout(resolve, STOP_WAIT_MS);
		})
	]);
	clearTimeout(timer);
	return true;
}

export async function abortChatRunsWhereGated(userId?: string): Promise<void> {
	const owners = new Set(
		[...active.values()].map((entry) => entry.userId).filter((owner) => !userId || owner === userId)
	);
	for (const owner of owners) {
		try {
			await assertClaudeGates(owner);
		} catch (error) {
			if (!(error instanceof ClaudeGateError)) throw error;
			for (const entry of active.values()) {
				if (entry.userId !== owner) continue;
				entry.stop ??= 'gate';
				entry.controller.abort();
			}
		}
	}
}

/** Runs a restart left running, pending confirmations that expired, and queued runs nobody works on. */
export async function sweepChatRuns(): Promise<void> {
	const db = getDB();
	const staleBefore = new Date(Date.now() - STALE_RUN_MS);
	const stale = await db
		.select({ id: chatRuns.id })
		.from(chatRuns)
		.where(
			and(
				eq(chatRuns.status, 'running'),
				or(isNull(chatRuns.heartbeatAt), lt(chatRuns.heartbeatAt, staleBefore))
			)
		);
	for (const run of stale) {
		if (active.has(run.id)) continue;
		await finalizeRun(run.id, {
			status: 'interrupted',
			reason: 'server_restart',
			requireStale: true
		});
	}

	const expired = await db
		.selectDistinct({ runId: chatToolCalls.runId })
		.from(chatToolCalls)
		.where(and(eq(chatToolCalls.actionStatus, 'pending'), lt(chatToolCalls.expiresAt, sql`now()`)));
	for (const { runId } of expired) {
		await finalizeRun(runId, {
			status: 'cancelled',
			reason: 'action_expired',
			actionStatus: 'expired',
			onlyIf: ['awaiting_confirmation']
		});
	}

	const waiting = await db
		.select({ id: chatRuns.id, userId: chatRuns.userId })
		.from(chatRuns)
		.where(inArray(chatRuns.status, ['queued']));
	for (const run of waiting) enqueueChatRun(run.id, run.userId);

	await pruneTextDeltas();
	await db
		.delete(chatMessageLog)
		.where(lt(chatMessageLog.createdAt, new Date(Date.now() - 2 * CHAT_DAY_WINDOW_MS)));
}

/** Brings one conversation up to date before it is read: stale runs, expired confirmations. */
export async function reconcileConversation(conversationId: string): Promise<void> {
	const db = getDB();
	const [run] = await db
		.select()
		.from(chatRuns)
		.where(
			and(
				eq(chatRuns.conversationId, conversationId),
				inArray(chatRuns.status, ['running', 'awaiting_confirmation'])
			)
		);
	if (!run) return;
	if (run.status === 'running') {
		if (active.has(run.id)) return;
		if (run.heartbeatAt && run.heartbeatAt.getTime() >= Date.now() - STALE_RUN_MS) return;
		await finalizeRun(run.id, {
			status: 'interrupted',
			reason: 'server_restart',
			requireStale: true
		});
		return;
	}
	const [expired] = await db
		.select({ id: chatToolCalls.id })
		.from(chatToolCalls)
		.where(
			and(
				eq(chatToolCalls.runId, run.id),
				eq(chatToolCalls.actionStatus, 'pending'),
				lt(chatToolCalls.expiresAt, sql`now()`)
			)
		);
	if (expired) {
		await finalizeRun(run.id, {
			status: 'cancelled',
			reason: 'action_expired',
			actionStatus: 'expired',
			onlyIf: ['awaiting_confirmation']
		});
	}
}

export function isChatRunActiveHere(runId: string): boolean {
	return active.has(runId);
}

export async function settleChatRunsForTests(): Promise<void> {
	while (active.size > 0 || queue.length > 0) {
		await Promise.all([...active.values()].map((entry) => entry.done));
	}
}

export function startChatWorker(): void {
	if (started) return;
	started = true;
	onClaudeAccessChanged(({ userId }) => abortChatRunsWhereGated(userId));
	const sweep = () => {
		sweepChatRuns().catch((error) => {
			console.error('[chat-sweep] Error:', error);
			Sentry.captureException(error, { tags: { job: 'chat-sweep' } });
		});
	};
	sweep();
	setInterval(sweep, SWEEP_INTERVAL_MS).unref?.();
}
