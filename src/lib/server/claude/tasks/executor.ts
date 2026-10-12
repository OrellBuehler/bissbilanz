import * as Sentry from '@sentry/sveltekit';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDB } from '../../db';
import { claudeTaskRuns, userPreferences } from '../../schema';
import { abandonStaleReservations } from '../budget';
import { assertClaudeAllowed, getClaudeCapability } from '../capability';
import { ClaudeGateError, ClaudeProcessorChangedError } from '../errors';
import { isClaudeConfigured } from '../config';
import { onClaudeAccessChanged } from '../events';
import { processTask } from './processor';
import { ensureRun } from './runs';

const MAX_CONCURRENCY = 2;
const SWEEP_INTERVAL_MS = 2 * 60_000;
const SWEEP_LIMIT = 50;

const instanceId = crypto.randomUUID();

type Job = { taskId: string; userId: string };

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

async function runJob(job: Job): Promise<void> {
	const controller = new AbortController();
	controllers.set(job.taskId, { userId: job.userId, controller });
	activeUsers.add(job.userId);
	let again = false;
	try {
		again =
			(await processTask(job.taskId, { signal: controller.signal, instanceId })) === 'requeued';
	} catch (error) {
		Sentry.captureException(error, { tags: { job: 'claude-task' }, extra: { taskId: job.taskId } });
	} finally {
		controllers.delete(job.taskId);
		activeUsers.delete(job.userId);
		queuedIds.delete(job.taskId);
		if (again) push(job);
		else pump();
	}
}

function push(job: Job): void {
	if (queuedIds.has(job.taskId)) return;
	queuedIds.add(job.taskId);
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

export async function requeueRunForEditedTask(taskId: string): Promise<void> {
	const [run] = await getDB()
		.update(claudeTaskRuns)
		.set({ state: 'queued', proposal: null, nextAttemptAt: null, updatedAt: sql`now()` })
		.where(
			and(
				eq(claudeTaskRuns.taskId, taskId),
				inArray(claudeTaskRuns.state, ['queued', 'retry_wait', 'blocked', 'proposed'])
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

type Candidate = { id: string; user_id: string };

export async function sweepClaudeTasks(): Promise<void> {
	await abandonStaleReservations();
	const candidates = (await getDB().execute(sql`
		SELECT t.id, t.user_id FROM ai_tasks t
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

	const available = new Map<string, boolean>();
	for (const candidate of candidates) {
		if (!available.has(candidate.user_id)) {
			available.set(candidate.user_id, (await getClaudeCapability(candidate.user_id)).available);
		}
		if (!available.get(candidate.user_id)) continue;
		await ensureRun(candidate.user_id, candidate.id);
		push({ taskId: candidate.id, userId: candidate.user_id });
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
