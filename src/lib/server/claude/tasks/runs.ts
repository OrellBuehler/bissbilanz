import { and, eq, exists, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { getDB } from '../../db';
import {
	claudeTaskLedger,
	claudeTaskRuns,
	foodEntries,
	userPreferences,
	type ClaudeRunState
} from '../../schema';
import type { TxOrDb } from '../../ownership';
import { LeaseLostError } from '../errors';
import type { ClaudeRun, Fence } from './types';

export type RunTx = Parameters<Parameters<ReturnType<typeof getDB>['transaction']>[0]>[0];

export const MAX_FAILURES = 3;

const leaseUntil = () => sql`now() + interval '3 minutes'`;

export async function ensureRun(userId: string, taskId: string): Promise<void> {
	await getDB().insert(claudeTaskRuns).values({ taskId, userId }).onConflictDoNothing();
}

export async function loadRun(
	taskId: string,
	db: TxOrDb = getDB()
): Promise<ClaudeRun | undefined> {
	const [run] = await db.select().from(claudeTaskRuns).where(eq(claudeTaskRuns.taskId, taskId));
	return run;
}

export async function listRunsByTaskIds(taskIds: string[]): Promise<ClaudeRun[]> {
	if (taskIds.length === 0) return [];
	return getDB().select().from(claudeTaskRuns).where(inArray(claudeTaskRuns.taskId, taskIds));
}

export async function claimRun(taskId: string, instance: string): Promise<ClaudeRun | undefined> {
	const db = getDB();
	const [claimed] = await db
		.update(claudeTaskRuns)
		.set({
			state: 'running',
			attempt: sql`${claudeTaskRuns.attempt} + 1`,
			leaseOwner: instance,
			leaseExpiresAt: leaseUntil(),
			nextAttemptAt: null,
			mode: sql`(SELECT CASE WHEN p.ai_task_auto_log THEN 'auto_log' ELSE 'review' END FROM user_preferences p WHERE p.user_id = ${claudeTaskRuns.userId})`,
			failures: sql`${claudeTaskRuns.failures} + CASE WHEN ${claudeTaskRuns.state} = 'running' THEN 1 ELSE 0 END`,
			proposal: null,
			updatedAt: sql`now()`
		})
		.where(
			and(
				eq(claudeTaskRuns.taskId, taskId),
				or(
					inArray(claudeTaskRuns.state, ['queued', 'blocked', 'superseded']),
					and(
						eq(claudeTaskRuns.state, 'retry_wait'),
						lte(claudeTaskRuns.nextAttemptAt, sql`now()`)
					),
					and(eq(claudeTaskRuns.state, 'running'), lt(claudeTaskRuns.leaseExpiresAt, sql`now()`))
				),
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
			)
		)
		.returning();
	return claimed;
}

export async function supersedeUnclaimedRun(taskId: string): Promise<void> {
	await getDB()
		.update(claudeTaskRuns)
		.set({ state: 'superseded', leaseOwner: null, leaseExpiresAt: null, updatedAt: sql`now()` })
		.where(
			and(
				eq(claudeTaskRuns.taskId, taskId),
				or(
					inArray(claudeTaskRuns.state, ['queued', 'blocked', 'retry_wait', 'proposed']),
					and(eq(claudeTaskRuns.state, 'running'), lt(claudeTaskRuns.leaseExpiresAt, sql`now()`))
				)
			)
		);
}

export async function supersedeIfProcessorChanged(taskId: string): Promise<void> {
	const [row] = await getDB()
		.select({ processor: userPreferences.aiTaskProcessor })
		.from(claudeTaskRuns)
		.leftJoin(userPreferences, eq(userPreferences.userId, claudeTaskRuns.userId))
		.where(eq(claudeTaskRuns.taskId, taskId));
	if (row && row.processor !== 'claude') await supersedeUnclaimedRun(taskId);
}

const fenceWhere = (fence: Fence) =>
	and(
		eq(claudeTaskRuns.taskId, fence.taskId),
		eq(claudeTaskRuns.leaseOwner, fence.instance),
		eq(claudeTaskRuns.attempt, fence.attempt)
	);

export async function heartbeat(fence: Fence): Promise<boolean> {
	const rows = await getDB()
		.update(claudeTaskRuns)
		.set({ leaseExpiresAt: leaseUntil(), updatedAt: sql`now()` })
		.where(fenceWhere(fence))
		.returning({ taskId: claudeTaskRuns.taskId });
	return rows.length > 0;
}

export async function withFence<T>(fence: Fence, fn: (tx: RunTx) => Promise<T>): Promise<T> {
	return getDB().transaction(async (tx) => {
		const held = await tx
			.select({ one: sql`1` })
			.from(claudeTaskRuns)
			.where(fenceWhere(fence))
			.for('update');
		if (held.length === 0) throw new LeaseLostError();
		return fn(tx);
	});
}

export type RunPatch = Partial<{
	state: ClaudeRunState;
	failures: number;
	nextAttemptAt: Date | null;
	proposal: unknown;
	failureCode: ClaudeRun['failureCode'];
	failureDetail: string | null;
}>;

export async function transitionFenced(tx: RunTx, fence: Fence, patch: RunPatch): Promise<void> {
	const leaving = patch.state !== undefined && patch.state !== 'running';
	const rows = await tx
		.update(claudeTaskRuns)
		.set({
			...patch,
			...(leaving ? { leaseOwner: null, leaseExpiresAt: null } : {}),
			updatedAt: sql`now()`
		})
		.where(fenceWhere(fence))
		.returning({ taskId: claudeTaskRuns.taskId });
	if (rows.length === 0) throw new LeaseLostError();
}

export async function ledgerGetOrCreate(
	tx: RunTx,
	fence: Fence,
	key: string,
	summary: string
): Promise<{ entryId: string; created: boolean }> {
	const held = await tx
		.select({ one: sql`1` })
		.from(claudeTaskRuns)
		.where(fenceWhere(fence));
	if (held.length === 0) throw new LeaseLostError();
	const [inserted] = await tx
		.insert(claudeTaskLedger)
		.values({ taskId: fence.taskId, key, entryId: crypto.randomUUID(), summary })
		.onConflictDoNothing()
		.returning({ entryId: claudeTaskLedger.entryId });
	if (inserted) return { entryId: inserted.entryId, created: true };
	const [existing] = await tx
		.select({ entryId: claudeTaskLedger.entryId })
		.from(claudeTaskLedger)
		.where(and(eq(claudeTaskLedger.taskId, fence.taskId), eq(claudeTaskLedger.key, key)));
	if (!existing) throw new Error('Ledger row vanished');
	return { entryId: existing.entryId, created: false };
}

export async function listLoggedLedger(
	db: TxOrDb,
	taskId: string,
	userId: string
): Promise<{ entryId: string; summary: string }[]> {
	return db
		.select({ entryId: claudeTaskLedger.entryId, summary: claudeTaskLedger.summary })
		.from(claudeTaskLedger)
		.innerJoin(
			foodEntries,
			and(eq(foodEntries.id, claudeTaskLedger.entryId), eq(foodEntries.userId, userId))
		)
		.where(eq(claudeTaskLedger.taskId, taskId))
		.orderBy(claudeTaskLedger.createdAt);
}
