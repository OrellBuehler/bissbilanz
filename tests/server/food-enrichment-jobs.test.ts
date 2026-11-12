import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { is, SQL } from 'drizzle-orm';
import { createMockDB } from '../helpers/mock-db';
import { foodEnrichmentJobs, type FoodEnrichmentJob } from '$lib/server/schema';

const { db, queueResults, reset, getCalls } = createMockDB();
const countCandidates = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/db', () => ({ getDB: () => db }));
vi.mock('$lib/server/food-enrichment/candidates', () => ({
	countEnrichmentCandidates: countCandidates
}));

const jobs = await import('$lib/server/food-enrichment/jobs');

const render = (value: SQL) => new PgDialect().sqlToQuery(value);
const callsOf = (method: string) => getCalls().filter((call) => call.method === method);
const lastSet = () => callsOf('set').at(-1)!.args[0];
const lastWhere = () => render(callsOf('where').at(-1)!.args[0]);

const row = (overrides: Partial<FoodEnrichmentJob> = {}): FoodEnrichmentJob => ({
	userId: 'user-1',
	state: 'running',
	total: 10,
	processed: 4,
	updated: 2,
	notFound: 1,
	failed: 1,
	cursor: null,
	leaseOwner: 'instance-a',
	leaseExpiresAt: new Date('2026-11-11T10:03:00Z'),
	startedAt: new Date('2026-11-11T10:00:00Z'),
	finishedAt: null,
	createdAt: new Date('2026-11-11T10:00:00Z'),
	updatedAt: new Date('2026-11-11T10:01:00Z'),
	...overrides
});

beforeEach(() => {
	reset();
	countCandidates.mockReset();
	countCandidates.mockResolvedValue(6);
});

describe('toJobView', () => {
	test('exposes counters and ISO timestamps only', () => {
		expect(jobs.toJobView(row({ finishedAt: new Date('2026-11-11T10:05:00Z') }))).toEqual({
			state: 'running',
			total: 10,
			processed: 4,
			updated: 2,
			notFound: 1,
			failed: 1,
			startedAt: '2026-11-11T10:00:00.000Z',
			finishedAt: '2026-11-11T10:05:00.000Z'
		});
		expect(jobs.toJobView(row({ startedAt: null })).startedAt).toBeNull();
	});
});

describe('getEnrichmentStatus', () => {
	test('combines the candidate count with the latest job', async () => {
		queueResults([[row()]]);
		const status = await jobs.getEnrichmentStatus('user-1');
		expect(status.candidates).toBe(6);
		expect(status.job?.processed).toBe(4);
	});

	test('job is null before the first run', async () => {
		queueResults([[]]);
		expect(await jobs.getEnrichmentStatus('user-1')).toEqual({ candidates: 6, job: null });
	});
});

describe('startEnrichmentJob', () => {
	test('queues a fresh run with the candidate count as total', async () => {
		queueResults([[row({ state: 'queued', total: 6, processed: 0, startedAt: null })]]);
		const { status, queued } = await jobs.startEnrichmentJob('user-1');

		expect(queued).toBe(true);
		expect(status.job).toMatchObject({ state: 'queued', total: 6, processed: 0 });
		const [values] = callsOf('values')[0].args;
		expect(values).toMatchObject({ userId: 'user-1', state: 'queued', total: 6, cursor: null });
		const [conflict] = callsOf('onConflictDoUpdate')[0].args;
		expect(conflict.target).toBe(foodEnrichmentJobs.userId);
		expect(conflict.set).toMatchObject({ state: 'queued', processed: 0, leaseOwner: null });
		expect(render(conflict.setWhere).sql).toBe('"food_enrichment_jobs"."state" not in ($1, $2)');
	});

	test('returns the active run unchanged', async () => {
		queueResults([[], [row()]]);
		const { status, queued } = await jobs.startEnrichmentJob('user-1');
		expect(queued).toBe(false);
		expect(status.job?.state).toBe('running');
	});
});

describe('cancelEnrichmentJob', () => {
	test('cancels only an active run and keeps the lease for the last write', async () => {
		queueResults([[], [row({ state: 'cancelled' })]]);
		const status = await jobs.cancelEnrichmentJob('user-1');

		expect(status.job?.state).toBe('cancelled');
		const values = callsOf('set')[0].args[0];
		expect(values.state).toBe('cancelled');
		expect(values).not.toHaveProperty('leaseOwner');
		expect(render(callsOf('where')[0].args[0]).sql).toContain(
			'"food_enrichment_jobs"."state" in ($2, $3)'
		);
	});
});

describe('claimEnrichmentJob', () => {
	test('claims a queued run or one whose lease expired', async () => {
		queueResults([[row()]]);
		expect(await jobs.claimEnrichmentJob('user-1', 'instance-a')).toMatchObject({
			state: 'running'
		});
		expect(lastSet()).toMatchObject({ state: 'running', leaseOwner: 'instance-a' });
		expect(lastWhere().sql).toBe(
			'("food_enrichment_jobs"."user_id" = $1 and ("food_enrichment_jobs"."state" = $2' +
				' or ("food_enrichment_jobs"."state" = $3 and ("food_enrichment_jobs"."lease_expires_at" is null' +
				' or "food_enrichment_jobs"."lease_expires_at" < now()))))'
		);
	});

	test('returns nothing when another instance holds it', async () => {
		queueResults([[]]);
		expect(await jobs.claimEnrichmentJob('user-1', 'instance-a')).toBeUndefined();
	});
});

describe('renewEnrichmentLease', () => {
	test('is true while this instance holds a running job', async () => {
		queueResults([[{ userId: 'user-1' }], []]);
		expect(await jobs.renewEnrichmentLease('user-1', 'instance-a')).toBe(true);
		expect(lastWhere().params).toEqual(['user-1', 'instance-a', 'running']);
		expect(await jobs.renewEnrichmentLease('user-1', 'instance-a')).toBe(false);
	});
});

describe('recordEnrichmentProgress', () => {
	test.each([
		['updated', 'updated'],
		['not_found', 'notFound'],
		['failed', 'failed']
	] as const)('%s bumps its counter', async (outcome, key) => {
		queueResults([[{ state: 'running' }]]);
		expect(await jobs.recordEnrichmentProgress('user-1', 'instance-a', 'food-1', outcome)).toBe(
			'running'
		);
		const values = lastSet();
		expect(is(values[key], SQL)).toBe(true);
		expect(values.cursor).toBe('food-1');
		expect(is(values.processed, SQL)).toBe(true);
	});

	test.each(['unchanged', 'skipped'] as const)('%s only counts as processed', async (outcome) => {
		queueResults([[{ state: 'running' }]]);
		await jobs.recordEnrichmentProgress('user-1', 'instance-a', 'food-1', outcome);
		const values = lastSet();
		expect(values).not.toHaveProperty('updated');
		expect(values).not.toHaveProperty('notFound');
		expect(values).not.toHaveProperty('failed');
	});

	test('reports a cancel and a lost lease', async () => {
		queueResults([[{ state: 'cancelled' }], []]);
		expect(await jobs.recordEnrichmentProgress('user-1', 'instance-a', 'food-1', 'updated')).toBe(
			'cancelled'
		);
		expect(
			await jobs.recordEnrichmentProgress('user-1', 'instance-a', 'food-1', 'updated')
		).toBeNull();
	});
});

describe('finishEnrichmentJob', () => {
	test('completion settles the total on what was processed', async () => {
		queueResults([[]]);
		await jobs.finishEnrichmentJob('user-1', 'instance-a', 'completed');
		expect(lastSet()).toMatchObject({
			state: 'completed',
			total: foodEnrichmentJobs.processed,
			leaseOwner: null
		});
		expect(lastWhere().params).toEqual(['user-1', 'instance-a', 'running']);
	});

	test('a failure keeps the total', async () => {
		queueResults([[]]);
		await jobs.finishEnrichmentJob('user-1', 'instance-a', 'failed');
		expect(lastSet()).toMatchObject({ state: 'failed', total: foodEnrichmentJobs.total });
	});
});

describe('releaseEnrichmentLease', () => {
	test('drops the lease this instance holds', async () => {
		queueResults([[]]);
		await jobs.releaseEnrichmentLease('user-1', 'instance-a');
		expect(lastSet()).toMatchObject({ leaseOwner: null, leaseExpiresAt: null });
		expect(lastWhere().params).toEqual(['user-1', 'instance-a']);
	});
});

describe('listResumableEnrichmentJobs', () => {
	test('lists queued runs and runs with an expired lease', async () => {
		queueResults([[{ userId: 'user-1' }, { userId: 'user-2' }]]);
		expect(await jobs.listResumableEnrichmentJobs()).toEqual(['user-1', 'user-2']);
		expect(lastWhere().sql).toContain('"food_enrichment_jobs"."lease_expires_at" < now()');
	});
});
