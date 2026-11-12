import * as Sentry from '@sentry/sveltekit';
import { setTimeout as delay } from 'node:timers/promises';
import type { OFFLookup } from '$lib/server/openfoodfacts';
import { nextEnrichmentCandidates, type EnrichmentCandidate } from './candidates';
import { applyLookup, lookupBarcode } from './enrich';
import {
	claimEnrichmentJob,
	finishEnrichmentJob,
	listResumableEnrichmentJobs,
	recordEnrichmentProgress,
	releaseEnrichmentLease,
	renewEnrichmentLease,
	type ItemOutcome
} from './jobs';

const MAX_CONCURRENCY = 2;
const REQUEST_SPACING_MS = 1000;
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 120_000;
const MAX_CONSECUTIVE_FAILURES = 5;
const BATCH_SIZE = 25;
const SWEEP_INTERVAL_MS = 2 * 60_000;

const instanceId = crypto.randomUUID();
const queue: string[] = [];
const controllers = new Map<string, AbortController>();
let nextRequestAt = 0;
let started = false;

export function backoffMs(attempt: number, retryAfterSeconds: number | null): number {
	const ms =
		retryAfterSeconds !== null
			? Math.max(retryAfterSeconds * 1000, BASE_BACKOFF_MS)
			: BASE_BACKOFF_MS * 3 ** (attempt - 1);
	return Math.min(ms, MAX_BACKOFF_MS);
}

async function waitForSlot(signal: AbortSignal): Promise<boolean> {
	if (signal.aborted) return false;
	const now = Date.now();
	const previous = nextRequestAt;
	const at = Math.max(now, previous);
	nextRequestAt = at + REQUEST_SPACING_MS;
	if (at <= now) return true;
	try {
		await delay(at - now, undefined, { signal });
		return true;
	} catch (error) {
		if (!signal.aborted) throw error;
		if (nextRequestAt === at + REQUEST_SPACING_MS) nextRequestAt = previous;
		return false;
	}
}

async function lookupWithRetry(
	userId: string,
	barcode: string,
	signal: AbortSignal
): Promise<OFFLookup | null> {
	for (let attempt = 1; ; attempt++) {
		if (!(await waitForSlot(signal))) return null;
		if (!(await renewEnrichmentLease(userId, instanceId))) return null;
		const lookup = await lookupBarcode(barcode);
		if (lookup.status !== 'unavailable') return lookup;
		Sentry.addBreadcrumb({
			category: 'food-enrichment',
			level: 'warning',
			message: 'Open Food Facts unavailable',
			data: { attempt, httpStatus: lookup.httpStatus, retryAfterSeconds: lookup.retryAfterSeconds }
		});
		nextRequestAt = Math.max(
			nextRequestAt,
			Date.now() + backoffMs(attempt, lookup.retryAfterSeconds)
		);
		if (attempt >= MAX_ATTEMPTS) return lookup;
	}
}

const describeError = (error: unknown) =>
	error instanceof Error ? `${error.name}: ${error.message}` : error == null ? null : String(error);

type FailureCause = Record<string, unknown> & { reason: string };

type ProcessedFood = { outcome: ItemOutcome; cause?: FailureCause };

async function processFood(
	userId: string,
	food: EnrichmentCandidate,
	signal: AbortSignal
): Promise<ProcessedFood | null> {
	const lookup = await lookupWithRetry(userId, food.barcode, signal);
	if (!lookup) return null;
	if (lookup.status === 'unavailable') {
		return {
			outcome: 'failed',
			cause: {
				reason: 'off_unavailable',
				httpStatus: lookup.httpStatus,
				error: describeError(lookup.error)
			}
		};
	}
	if (lookup.status === 'invalid') {
		return {
			outcome: 'failed',
			cause: { reason: 'off_invalid_response', issues: lookup.issues }
		};
	}
	try {
		const { status } = await applyLookup(userId, food.id, food.barcode, lookup);
		return { outcome: status === 'gone' ? 'skipped' : status };
	} catch (error) {
		Sentry.captureException(error, {
			tags: { job: 'food-enrichment' },
			extra: { foodId: food.id }
		});
		return { outcome: 'failed', cause: { reason: 'error', error: describeError(error) } };
	}
}

export async function runEnrichmentJob(userId: string, signal: AbortSignal): Promise<void> {
	const job = await claimEnrichmentJob(userId, instanceId);
	if (!job) return;
	let cursor = job.cursor;
	let consecutiveFailures = 0;
	for (;;) {
		const batch = await nextEnrichmentCandidates(userId, cursor, BATCH_SIZE);
		if (batch.length === 0) {
			await finishEnrichmentJob(userId, instanceId, 'completed');
			return;
		}
		for (const food of batch) {
			const processed = await processFood(userId, food, signal);
			if (!processed) {
				await releaseEnrichmentLease(userId, instanceId);
				return;
			}
			const { outcome, cause } = processed;
			const state = await recordEnrichmentProgress(userId, instanceId, food.id, outcome);
			if (state !== 'running') {
				if (state) await releaseEnrichmentLease(userId, instanceId);
				return;
			}
			cursor = food.id;
			consecutiveFailures = outcome === 'failed' ? consecutiveFailures + 1 : 0;
			if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
				Sentry.captureMessage('Food enrichment run failed', {
					level: 'warning',
					tags: { job: 'food-enrichment' },
					extra: { consecutiveFailures, foodId: food.id, ...cause }
				});
				await finishEnrichmentJob(userId, instanceId, 'failed');
				return;
			}
		}
	}
}

async function runQueued(userId: string): Promise<void> {
	const controller = new AbortController();
	controllers.set(userId, controller);
	try {
		await runEnrichmentJob(userId, controller.signal);
	} catch (error) {
		Sentry.captureException(error, { tags: { job: 'food-enrichment' } });
		await finishEnrichmentJob(userId, instanceId, 'failed').catch((finishError) =>
			Sentry.captureException(finishError, { tags: { job: 'food-enrichment' } })
		);
	} finally {
		controllers.delete(userId);
		pump();
	}
}

function pump(): void {
	while (controllers.size < MAX_CONCURRENCY) {
		const index = queue.findIndex((userId) => !controllers.has(userId));
		if (index === -1) return;
		const [userId] = queue.splice(index, 1);
		void runQueued(userId);
	}
}

export function wakeEnrichmentJob(userId: string): void {
	if (!queue.includes(userId)) queue.push(userId);
	pump();
}

export function abortEnrichmentJob(userId: string): void {
	controllers.get(userId)?.abort();
}

export async function sweepEnrichmentJobs(): Promise<void> {
	for (const userId of await listResumableEnrichmentJobs()) wakeEnrichmentJob(userId);
}

export function startFoodEnrichmentWorker(): void {
	if (started) return;
	started = true;
	const sweep = () => {
		sweepEnrichmentJobs().catch((error) => {
			console.error('[food-enrichment-sweep] Error:', error);
			Sentry.captureException(error, { tags: { job: 'food-enrichment-sweep' } });
		});
	};
	sweep();
	setInterval(sweep, SWEEP_INTERVAL_MS).unref?.();
}
