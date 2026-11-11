import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
	closeTestDB,
	createTestDatabase,
	dropTestDatabase,
	getTestDB,
	runTestMigrations
} from './helpers';
import { foodEnrichmentJobs, foodLabels, foods, users } from '$lib/server/schema';

const DB_NAME = 'test_food_enrichment';
let dbUrl: string;

const lookupProduct = vi.fn();

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	const db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
	vi.doMock('$lib/server/openfoodfacts', () => ({ lookupProduct }));
	vi.doMock('node:timers/promises', () => ({ setTimeout: async () => undefined }));
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

let userId: string;
let otherUserId: string;

const base = {
	servingSize: 100,
	servingUnit: 'g' as const,
	calories: 380,
	protein: 13,
	carbs: 60,
	fat: 7,
	fiber: 10
};

const addFood = async (values: Partial<typeof foods.$inferInsert> = {}) => {
	const [row] = await getTestDB(dbUrl)
		.insert(foods)
		.values({ userId, name: 'Food', ...base, ...values })
		.returning();
	return row;
};

const readFood = async (id: string) => {
	const [row] = await getTestDB(dbUrl)
		.select({
			food: foods,
			serverModifiedAt: sql<string>`${foods.serverModifiedAt}::text`
		})
		.from(foods)
		.where(eq(foods.id, id));
	return row;
};

const product = (overrides: Record<string, unknown> = {}) => ({
	name: 'OFF Name',
	brand: 'OFF Brand',
	servingSize: 100,
	servingUnit: 'g',
	calories: 999,
	protein: 99,
	carbs: 99,
	fat: 99,
	fiber: 99,
	nutriScore: 'b',
	novaGroup: 2,
	additives: ['en:e330'],
	ingredientsText: 'Oats, salt',
	imageUrl: 'https://images.openfoodfacts.org/front.jpg',
	categoriesTags: ['en:breakfast-cereals'],
	barcode: '4000000000017',
	sugar: 20,
	sodium: 400,
	...overrides
});

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(foodEnrichmentJobs);
	await db.delete(foodLabels);
	await db.delete(foods);
	await db.delete(users);
	lookupProduct.mockReset();
	const [user] = await db
		.insert(users)
		.values({ infomaniakSub: `enrich-${Date.now()}` })
		.returning();
	userId = user.id;
	const [other] = await db
		.insert(users)
		.values({ infomaniakSub: `enrich-other-${Date.now()}` })
		.returning();
	otherUserId = other.id;
});

describe('candidate rule', () => {
	it('counts barcode foods missing quality data that were not checked in 30 days', async () => {
		const { countEnrichmentCandidates, nextEnrichmentCandidates } =
			await import('$lib/server/food-enrichment/candidates');
		const complete = { nutriScore: 'a', novaGroup: 1, ingredientsText: 'Oats' };
		const expected = [
			await addFood({ barcode: '4000000000017' }),
			await addFood({ barcode: '4000000000024', ...complete, ingredientsText: ' \n ' }),
			await addFood({ barcode: '4000000000031', ...complete, novaGroup: null }),
			await addFood({ barcode: '4000000000048', offCheckedAt: daysAgo(31) })
		];
		await addFood({ barcode: null });
		await addFood({ barcode: '   ' });
		await addFood({ barcode: '4000000000055', ...complete });
		await addFood({ barcode: '4000000000062', offCheckedAt: daysAgo(5) });
		await addFood({ barcode: '4000000000079', kind: 'supplement' });
		await getTestDB(dbUrl)
			.insert(foods)
			.values({ userId: otherUserId, name: 'Other', ...base, barcode: '4000000000086' });

		expect(await countEnrichmentCandidates(userId)).toBe(4);
		const ids = (await nextEnrichmentCandidates(userId, null, 10)).map((row) => row.id);
		expect(ids).toEqual(expected.map((row) => row.id).sort());
		const afterFirst = await nextEnrichmentCandidates(userId, ids[0], 10);
		expect(afterFirst.map((row) => row.id)).toEqual(ids.slice(1));
	});
});

describe('applyLookup', () => {
	it('merges a found product through the update path and bumps both clocks', async () => {
		const { applyLookup } = await import('$lib/server/food-enrichment/enrich');
		const food = await addFood({
			barcode: '4000000000017',
			servingSize: 30,
			updatedAt: daysAgo(2)
		});
		const before = await readFood(food.id);

		const outcome = await applyLookup(userId, food.id, '4000000000017', {
			status: 'found',
			product: product() as never
		});

		expect(outcome.status).toBe('updated');
		const after = await readFood(food.id);
		expect(after.food).toMatchObject({
			name: 'Food',
			brand: null,
			servingSize: 30,
			calories: 380,
			protein: 13,
			nutriScore: 'b',
			novaGroup: 2,
			additives: ['en:e330'],
			ingredientsText: 'Oats, salt',
			imageUrl: 'https://images.openfoodfacts.org/front.jpg',
			sugar: 6,
			sodium: 120
		});
		expect(after.food.offCheckedAt).toBeInstanceOf(Date);
		expect(after.food.updatedAt!.getTime()).toBeGreaterThan(before.food.updatedAt!.getTime());
		expect(after.serverModifiedAt).not.toBe(before.serverModifiedAt);
		if (outcome.status === 'updated') expect(outcome.food.labels).toContain('breakfast cereal');
	});

	it('keeps an existing photo', async () => {
		const { applyLookup } = await import('$lib/server/food-enrichment/enrich');
		const food = await addFood({ barcode: '4000000000017', imageUrl: '/uploads/me/photo.webp' });

		await applyLookup(userId, food.id, '4000000000017', {
			status: 'found',
			product: product() as never
		});

		expect((await readFood(food.id)).food.imageUrl).toBe('/uploads/me/photo.webp');
	});

	it('not found stamps the marker without moving the edit clock', async () => {
		const { applyLookup } = await import('$lib/server/food-enrichment/enrich');
		const food = await addFood({ barcode: '4000000000017', updatedAt: daysAgo(2) });
		const before = await readFood(food.id);

		const outcome = await applyLookup(userId, food.id, '4000000000017', { status: 'not_found' });

		expect(outcome.status).toBe('not_found');
		const after = await readFood(food.id);
		expect(after.food.offCheckedAt).toBeInstanceOf(Date);
		expect(after.food.updatedAt!.getTime()).toBe(before.food.updatedAt!.getTime());
		expect(after.serverModifiedAt).not.toBe(before.serverModifiedAt);
		expect(after.food.nutriScore).toBeNull();
	});

	it('leaves another user’s food alone', async () => {
		const { applyLookup } = await import('$lib/server/food-enrichment/enrich');
		const [theirs] = await getTestDB(dbUrl)
			.insert(foods)
			.values({ userId: otherUserId, name: 'Theirs', ...base, barcode: '4000000000017' })
			.returning();

		expect(await applyLookup(userId, theirs.id, '4000000000017', { status: 'not_found' })).toEqual({
			status: 'skipped'
		});
		expect((await readFood(theirs.id)).food.offCheckedAt).toBeNull();
	});
});

describe('barcode edits', () => {
	it('clear the marker only when the barcode really changes', async () => {
		const { updateFood } = await import('$lib/server/foods');
		const food = await addFood({ barcode: '4000000000017', offCheckedAt: daysAgo(1) });

		await updateFood(userId, food.id, { barcode: '4000000000017', name: 'Renamed' });
		expect((await readFood(food.id)).food.offCheckedAt).toBeInstanceOf(Date);

		await updateFood(userId, food.id, { barcode: '4000000000024' });
		expect((await readFood(food.id)).food.offCheckedAt).toBeNull();
	});
});

describe('job store', () => {
	it('starts idempotently, fences the lease, resumes a stale one and restarts after a cancel', async () => {
		const jobs = await import('$lib/server/food-enrichment/jobs');
		const food = await addFood({ barcode: '4000000000017' });
		await addFood({ barcode: '4000000000024' });

		const first = await jobs.startEnrichmentJob(userId);
		expect(first.queued).toBe(true);
		expect(first.status).toMatchObject({ candidates: 2, job: { state: 'queued', total: 2 } });
		expect((await jobs.startEnrichmentJob(userId)).queued).toBe(false);

		expect(await jobs.claimEnrichmentJob(userId, 'instance-a')).toMatchObject({
			state: 'running'
		});
		expect(await jobs.claimEnrichmentJob(userId, 'instance-b')).toBeUndefined();
		expect(await jobs.recordEnrichmentProgress(userId, 'instance-a', food.id, 'updated')).toBe(
			'running'
		);
		expect(
			await jobs.recordEnrichmentProgress(userId, 'instance-b', food.id, 'updated')
		).toBeNull();

		await getTestDB(dbUrl)
			.update(foodEnrichmentJobs)
			.set({ leaseExpiresAt: daysAgo(1) })
			.where(eq(foodEnrichmentJobs.userId, userId));
		expect(await jobs.listResumableEnrichmentJobs()).toEqual([userId]);
		const resumed = await jobs.claimEnrichmentJob(userId, 'instance-b');
		expect(resumed).toMatchObject({ leaseOwner: 'instance-b', cursor: food.id, processed: 1 });
		expect(await jobs.renewEnrichmentLease(userId, 'instance-a')).toBe(false);
		expect(await jobs.renewEnrichmentLease(userId, 'instance-b')).toBe(true);

		const cancelled = await jobs.cancelEnrichmentJob(userId);
		expect(cancelled.job).toMatchObject({ state: 'cancelled', processed: 1, updated: 1 });
		expect(cancelled.job?.finishedAt).not.toBeNull();
		expect(await jobs.renewEnrichmentLease(userId, 'instance-b')).toBe(false);
		expect(await jobs.recordEnrichmentProgress(userId, 'instance-b', food.id, 'failed')).toBe(
			'cancelled'
		);
		await jobs.releaseEnrichmentLease(userId, 'instance-b');
		expect(await jobs.listResumableEnrichmentJobs()).toEqual([]);

		const restarted = await jobs.startEnrichmentJob(userId);
		expect(restarted.queued).toBe(true);
		expect(restarted.status.job).toMatchObject({
			state: 'queued',
			processed: 0,
			updated: 0,
			failed: 0,
			startedAt: null,
			finishedAt: null
		});
	});

	it('is removed with the user', async () => {
		const jobs = await import('$lib/server/food-enrichment/jobs');
		await jobs.startEnrichmentJob(userId);
		await getTestDB(dbUrl).delete(users).where(eq(users.id, userId));
		expect(await getTestDB(dbUrl).select().from(foodEnrichmentJobs)).toEqual([]);
	});
});

describe('worker', () => {
	it('stamps not-found, leaves transient failures unchecked and completes', async () => {
		const jobs = await import('$lib/server/food-enrichment/jobs');
		const { runEnrichmentJob } = await import('$lib/server/food-enrichment/worker');
		const found = await addFood({ barcode: '4000000000017' });
		const unknown = await addFood({ barcode: '4000000000024' });
		const flaky = await addFood({ barcode: '4000000000031' });
		lookupProduct.mockImplementation(async (barcode: string) => {
			if (barcode === '4000000000017') return { status: 'found', product: product() };
			if (barcode === '4000000000024') return { status: 'not_found' };
			return { status: 'unavailable', httpStatus: 503, retryAfterSeconds: null, error: null };
		});

		await jobs.startEnrichmentJob(userId);
		await runEnrichmentJob(userId, new AbortController().signal);

		const status = await jobs.getEnrichmentStatus(userId);
		expect(status.job).toMatchObject({
			state: 'completed',
			total: 3,
			processed: 3,
			updated: 1,
			notFound: 1,
			failed: 1
		});
		expect(status.candidates).toBe(1);
		expect((await readFood(found.id)).food.offCheckedAt).toBeInstanceOf(Date);
		expect((await readFood(unknown.id)).food.offCheckedAt).toBeInstanceOf(Date);
		expect((await readFood(flaky.id)).food.offCheckedAt).toBeNull();
		expect(
			lookupProduct.mock.calls.filter(([barcode]) => barcode === '4000000000031')
		).toHaveLength(4);
		const [row] = await getTestDB(dbUrl).select().from(foodEnrichmentJobs);
		expect(row.leaseOwner).toBeNull();
	});

	it('resumes a job whose lease went stale after a restart', async () => {
		const jobs = await import('$lib/server/food-enrichment/jobs');
		const { runEnrichmentJob } = await import('$lib/server/food-enrichment/worker');
		const ids = [
			(await addFood({ barcode: '4000000000017' })).id,
			(await addFood({ barcode: '4000000000024' })).id,
			(await addFood({ barcode: '4000000000031' })).id
		].sort();
		lookupProduct.mockResolvedValue({ status: 'not_found' });
		await getTestDB(dbUrl)
			.insert(foodEnrichmentJobs)
			.values({
				userId,
				state: 'running',
				total: 3,
				processed: 1,
				notFound: 1,
				cursor: ids[0],
				leaseOwner: 'crashed-instance',
				leaseExpiresAt: daysAgo(1),
				startedAt: daysAgo(1)
			});

		await runEnrichmentJob(userId, new AbortController().signal);

		expect(lookupProduct).toHaveBeenCalledTimes(2);
		expect((await jobs.getEnrichmentStatus(userId)).job).toMatchObject({
			state: 'completed',
			processed: 3,
			notFound: 3
		});
	});

	it('stops between items once the job is cancelled', async () => {
		const jobs = await import('$lib/server/food-enrichment/jobs');
		const { runEnrichmentJob } = await import('$lib/server/food-enrichment/worker');
		await addFood({ barcode: '4000000000017' });
		await addFood({ barcode: '4000000000024' });
		await addFood({ barcode: '4000000000031' });
		lookupProduct.mockImplementation(async () => {
			await jobs.cancelEnrichmentJob(userId);
			return { status: 'not_found' };
		});

		await jobs.startEnrichmentJob(userId);
		await runEnrichmentJob(userId, new AbortController().signal);

		expect(lookupProduct).toHaveBeenCalledTimes(1);
		const status = await jobs.getEnrichmentStatus(userId);
		expect(status.job).toMatchObject({ state: 'cancelled', processed: 1, notFound: 1 });
		expect(status.candidates).toBe(2);
		const [row] = await getTestDB(dbUrl).select().from(foodEnrichmentJobs);
		expect(row.leaseOwner).toBeNull();
	});
});
