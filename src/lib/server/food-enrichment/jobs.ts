import { and, asc, eq, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { getDB } from '$lib/server/db';
import {
	foodEnrichmentJobs as jobs,
	type FoodEnrichmentJob,
	type FoodEnrichmentJobState
} from '$lib/server/schema';
import { countEnrichmentCandidates } from './candidates';

const ACTIVE_STATES: FoodEnrichmentJobState[] = ['queued', 'running'];
const RESUME_LIMIT = 50;

const leaseUntil = () => sql`now() + interval '3 minutes'`;
const leaseExpired = or(isNull(jobs.leaseExpiresAt), lt(jobs.leaseExpiresAt, sql`now()`));
const claimable = or(eq(jobs.state, 'queued'), and(eq(jobs.state, 'running'), leaseExpired));

export type EnrichmentJobView = {
	state: string;
	total: number;
	processed: number;
	updated: number;
	notFound: number;
	failed: number;
	startedAt: string | null;
	finishedAt: string | null;
};

export type EnrichmentStatus = { candidates: number; job: EnrichmentJobView | null };

export type ItemOutcome = 'updated' | 'unchanged' | 'not_found' | 'failed' | 'skipped';

export const toJobView = (job: FoodEnrichmentJob): EnrichmentJobView => ({
	state: job.state,
	total: job.total,
	processed: job.processed,
	updated: job.updated,
	notFound: job.notFound,
	failed: job.failed,
	startedAt: job.startedAt?.toISOString() ?? null,
	finishedAt: job.finishedAt?.toISOString() ?? null
});

async function loadJob(userId: string): Promise<FoodEnrichmentJob | undefined> {
	const [job] = await getDB().select().from(jobs).where(eq(jobs.userId, userId));
	return job;
}

export async function getEnrichmentStatus(userId: string): Promise<EnrichmentStatus> {
	const [candidates, job] = await Promise.all([countEnrichmentCandidates(userId), loadJob(userId)]);
	return { candidates, job: job ? toJobView(job) : null };
}

export async function startEnrichmentJob(
	userId: string
): Promise<{ status: EnrichmentStatus; queued: boolean }> {
	const candidates = await countEnrichmentCandidates(userId);
	const fresh = {
		state: 'queued' as const,
		total: candidates,
		processed: 0,
		updated: 0,
		notFound: 0,
		failed: 0,
		cursor: null,
		leaseOwner: null,
		leaseExpiresAt: null,
		startedAt: null,
		finishedAt: null,
		updatedAt: sql`now()`
	};
	const [started] = await getDB()
		.insert(jobs)
		.values({ userId, ...fresh })
		.onConflictDoUpdate({
			target: jobs.userId,
			set: fresh,
			setWhere: notInArray(jobs.state, ACTIVE_STATES)
		})
		.returning();
	const job = started ?? (await loadJob(userId));
	return { status: { candidates, job: job ? toJobView(job) : null }, queued: Boolean(started) };
}

export async function cancelEnrichmentJob(userId: string): Promise<EnrichmentStatus> {
	await getDB()
		.update(jobs)
		.set({ state: 'cancelled', finishedAt: sql`now()`, updatedAt: sql`now()` })
		.where(and(eq(jobs.userId, userId), inArray(jobs.state, ACTIVE_STATES)));
	return getEnrichmentStatus(userId);
}

export async function claimEnrichmentJob(
	userId: string,
	instance: string
): Promise<FoodEnrichmentJob | undefined> {
	const [job] = await getDB()
		.update(jobs)
		.set({
			state: 'running',
			leaseOwner: instance,
			leaseExpiresAt: leaseUntil(),
			startedAt: sql`COALESCE(${jobs.startedAt}, now())`,
			updatedAt: sql`now()`
		})
		.where(and(eq(jobs.userId, userId), claimable))
		.returning();
	return job;
}

const heldBy = (userId: string, instance: string) =>
	and(eq(jobs.userId, userId), eq(jobs.leaseOwner, instance));

export async function renewEnrichmentLease(userId: string, instance: string): Promise<boolean> {
	const rows = await getDB()
		.update(jobs)
		.set({ leaseExpiresAt: leaseUntil(), updatedAt: sql`now()` })
		.where(and(heldBy(userId, instance), eq(jobs.state, 'running')))
		.returning({ userId: jobs.userId });
	return rows.length > 0;
}

const countOutcome = (outcome: ItemOutcome) => {
	if (outcome === 'updated') return { updated: sql`${jobs.updated} + 1` };
	if (outcome === 'not_found') return { notFound: sql`${jobs.notFound} + 1` };
	if (outcome === 'failed') return { failed: sql`${jobs.failed} + 1` };
	return {};
};

export async function recordEnrichmentProgress(
	userId: string,
	instance: string,
	foodId: string,
	outcome: ItemOutcome
): Promise<string | null> {
	const [row] = await getDB()
		.update(jobs)
		.set({
			...countOutcome(outcome),
			processed: sql`${jobs.processed} + 1`,
			total: sql`GREATEST(${jobs.total}, ${jobs.processed} + 1)`,
			cursor: foodId,
			leaseExpiresAt: leaseUntil(),
			updatedAt: sql`now()`
		})
		.where(heldBy(userId, instance))
		.returning({ state: jobs.state });
	return row?.state ?? null;
}

export async function finishEnrichmentJob(
	userId: string,
	instance: string,
	state: 'completed' | 'failed'
): Promise<void> {
	await getDB()
		.update(jobs)
		.set({
			state,
			total: state === 'completed' ? jobs.processed : jobs.total,
			finishedAt: sql`now()`,
			leaseOwner: null,
			leaseExpiresAt: null,
			updatedAt: sql`now()`
		})
		.where(and(heldBy(userId, instance), eq(jobs.state, 'running')));
}

export async function releaseEnrichmentLease(userId: string, instance: string): Promise<void> {
	await getDB()
		.update(jobs)
		.set({ leaseOwner: null, leaseExpiresAt: null, updatedAt: sql`now()` })
		.where(heldBy(userId, instance));
}

export async function listResumableEnrichmentJobs(): Promise<string[]> {
	const rows = await getDB()
		.select({ userId: jobs.userId })
		.from(jobs)
		.where(claimable)
		.orderBy(asc(jobs.updatedAt))
		.limit(RESUME_LIMIT);
	return rows.map((row) => row.userId);
}
