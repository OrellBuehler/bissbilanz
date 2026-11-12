import * as Sentry from '@sentry/sveltekit';
import { and, eq, exists, inArray, or, sql } from 'drizzle-orm';
import { getDB } from '../../db';
import { aiTasks, claudeTaskRuns, userPreferences } from '../../schema';
import { abandonStaleReservations } from '../budget';
import { assertClaudeAllowed, getClaudeHeadroom, type ClaudeHeadroom } from '../capability';
import { ClaudeGateError, ClaudeProcessorChangedError } from '../errors';
import { isClaudeConfigured } from '../config';
import { onClaudeAccessChanged } from '../events';
import { processCorrection } from './correction';
import { processTask, type ProcessOptions, type ProcessResult } from './processor';
import { ensureRun } from './runs';

const MAX_CONCURRENCY = 2;
const SWEEP_INTERVAL_MS = 2 * 60_000;
const SWEEP_LIMIT = 50;

const instanceId = crypto.randomUUID();

// A task's first run, or a correction a reply on the completed task started.
type Job = { taskId: string; userId: string; kind?: 'correction' };

const jobKey = (job: Job) => `${job.kind ?? 'run'}:${job.taskId}`;

const queue: Job[] = [];
const queuedIds = new Set<string>();
const activeUsers = new Set<string>();
const controllers = new Map<string, { userId: string; controller: AbortController }>();
let started = false;

function pump(): void {
	while (controllers.size < MAX_CONCURRENCY) {
		const index = queue.findIndex((job) => !activeUsers.has(job.userId));
		if (index === -1) return;
		const [job] = queue.splice(index, 1);
		if (!job) return;
		void runJob(job);
	}
}

const runProcessor = (job: Job, options: ProcessOptions): Promise<ProcessResult> =>
	job.kind === 'correction'
		? processCorrection(job.taskId, options)
		: processTask(job.taskId, options);

async function runJob(job: Job): Promise<void> {
	const key = jobKey(job);
	const controller = new AbortController();
	controllers.set(key, { userId: job.userId, controller });
	activeUsers.add(job.userId);
	let again = false;
	try {
		again = (await runProcessor(job, { signal: controller.signal, instanceId })) === 'requeued';
	} catch (error) {
		Sentry.captureException(error, {
			tags: { job: job.kind === 'correction' ? 'claude-correction' : 'claude-task' },
			extra: { taskId: job.taskId }
		});
	} finally {
		controllers.delete(key);
		activeUsers.delete(job.userId);
		queuedIds.delete(key);
		if (again) push(job);
		else pump();
	}
}

function push(job: Job): void {
	const key = jobKey(job);
	if (queuedIds.has(key)) return;
	queuedIds.add(key);
	queue.push(job);
	pump();
}

export async function enqueueClaudeTaskIfEligible(userId: string, taskId: string): Promise<void> {
	try {
		if (!isClaudeConfigured()) return;
		const [prefs] = await getDB()
			.select({ processor: userPreferences.aiTaskProcessor })
			.from(userPreferences)
			.where(eq(userPreferences.userId, userId));
		if (prefs?.processor !== 'claude') return;
		await ensureRun(userId, taskId);
		push({ taskId, userId });
	} catch (error) {
		Sentry.captureException(error, { tags: { job: 'claude-enqueue' }, extra: { taskId } });
	}
}

const RESOLVED_RUN_STATES = ['succeeded', 'dismissed', 'superseded'];
const OPEN_RUN_STATES = ['queued', 'retry_wait', 'blocked', 'proposed'];

export function wakeClaudeRun(taskId: string, userId: string): void {
	push({ taskId, userId });
}

export function wakeClaudeCorrection(taskId: string, userId: string): void {
	push({ taskId, userId, kind: 'correction' });
}

export async function requeueRunForEditedTask(
	taskId: string,
	options: { contentEdited?: boolean } = {}
): Promise<void> {
	const db = getDB();
	const resolved = inArray(claudeTaskRuns.state, RESOLVED_RUN_STATES);
	const [run] = await db
		.update(claudeTaskRuns)
		.set({
			state: 'queued',
			proposal: null,
			nextAttemptAt: null,
			failures: sql`CASE WHEN ${resolved} THEN 0 ELSE ${claudeTaskRuns.failures} END`,
			failureCode: sql`CASE WHEN ${resolved} THEN NULL ELSE ${claudeTaskRuns.failureCode} END`,
			failureDetail: sql`CASE WHEN ${resolved} THEN NULL ELSE ${claudeTaskRuns.failureDetail} END`,
			updatedAt: sql`now()`
		})
		.where(
			and(
				eq(claudeTaskRuns.taskId, taskId),
				exists(
					db
						.select({ one: sql`1` })
						.from(aiTasks)
						.where(and(eq(aiTasks.id, claudeTaskRuns.taskId), eq(aiTasks.status, 'pending')))
				),
				or(
					and(
						resolved,
						exists(
							db
								.select({ one: sql`1` })
								.from(userPreferences)
								.where(
									and(
										eq(userPreferences.userId, claudeTaskRuns.userId),
										eq(userPreferences.aiTaskProcessor, 'claude')
									)
								)
						)
					),
					options.contentEdited ? inArray(claudeTaskRuns.state, OPEN_RUN_STATES) : undefined
				)
			)
		)
		.returning({ userId: claudeTaskRuns.userId });
	if (run) push({ taskId, userId: run.userId });
}

export function abortClaudeRuns(userId?: string): void {
	for (const { userId: owner, controller } of controllers.values()) {
		if (!userId || owner === userId) controller.abort();
	}
}

export async function abortClaudeRunsWhereGated(userId?: string): Promise<void> {
	const owners = new Set(
		[...controllers.values()]
			.map((run) => run.userId)
			.filter((owner) => !userId || owner === userId)
	);
	for (const owner of owners) {
		try {
			await assertClaudeAllowed(owner);
		} catch (error) {
			if (error instanceof ClaudeGateError) abortClaudeRuns(owner);
			else if (!(error instanceof ClaudeProcessorChangedError)) throw error;
		}
	}
}

type Candidate = {
	id: string;
	user_id: string;
	state?: string | null;
	failure_code?: string | null;
	failure_detail?: string | null;
};

const BUDGET_GATES = new Set(['user_budget_exhausted', 'global_budget_exhausted']);

const blockedNeedUsd = (candidate: Candidate): number | null => {
	if (candidate.state !== 'blocked' || !BUDGET_GATES.has(candidate.failure_code ?? '')) return null;
	const need = Number(candidate.failure_detail);
	return candidate.failure_detail && Number.isFinite(need) ? need : null;
};

export async function sweepClaudeTasks(): Promise<void> {
	await abandonStaleReservations();
	const candidates = (await getDB().execute(sql`
		SELECT t.id, t.user_id, r.state, r.failure_code, r.failure_detail FROM ai_tasks t
		JOIN user_preferences p ON p.user_id = t.user_id AND p.ai_task_processor = 'claude'
		LEFT JOIN claude_task_runs r ON r.task_id = t.id
		WHERE t.status = 'pending'
			AND ((r.task_id IS NULL AND t.created_at > now() - interval '7 days')
				OR r.state IN ('queued', 'blocked')
				OR (r.state = 'superseded' AND t.created_at > now() - interval '7 days')
				OR (r.state = 'retry_wait' AND r.next_attempt_at <= now())
				OR (r.state = 'running' AND r.lease_expires_at < now()))
		ORDER BY t.created_at
		LIMIT ${SWEEP_LIMIT}
	`)) as unknown as Candidate[];

	const headrooms = new Map<string, ClaudeHeadroom>();
	for (const candidate of candidates) {
		let headroom = headrooms.get(candidate.user_id);
		if (!headroom) {
			headroom = await getClaudeHeadroom(candidate.user_id);
			headrooms.set(candidate.user_id, headroom);
		}
		if (!headroom.available) continue;
		const need = blockedNeedUsd(candidate);
		if (need !== null && headroom.remainingUsd + 1e-9 < need) continue;
		await ensureRun(candidate.user_id, candidate.id);
		push({ taskId: candidate.id, userId: candidate.user_id });
	}

	// Corrections need no headroom check here: a reply was only accepted while
	// Claude was available, and a run that finds a gate closed tells the user
	// in the thread instead of waiting silently.
	const corrections = (await getDB().execute(sql`
		SELECT c.task_id AS id, c.user_id FROM claude_task_corrections c
		WHERE c.state = 'queued'
			OR (c.state = 'retry_wait' AND c.next_attempt_at <= now())
			OR (c.state = 'running' AND c.lease_expires_at < now())
		ORDER BY c.updated_at
		LIMIT ${SWEEP_LIMIT}
	`)) as unknown as Candidate[];
	for (const candidate of corrections) {
		push({ taskId: candidate.id, userId: candidate.user_id, kind: 'correction' });
	}
}

export function startClaudeWorker(): void {
	if (started || !isClaudeConfigured()) return;
	started = true;
	onClaudeAccessChanged(({ userId }) => abortClaudeRunsWhereGated(userId));
	const sweep = () => {
		sweepClaudeTasks().catch((error) => {
			console.error('[claude-sweep] Error:', error);
			Sentry.captureException(error, { tags: { job: 'claude-sweep' } });
		});
	};
	sweep();
	setInterval(sweep, SWEEP_INTERVAL_MS).unref?.();
}
