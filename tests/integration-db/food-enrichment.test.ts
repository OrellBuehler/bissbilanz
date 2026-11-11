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
import { CLIENT_EDITED_AT_HEADER } from '$lib/sync/contract';

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
	it('merges a found product but moves only server_modified_at, not the edit clock', async () => {
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
		expect(after.food.updatedAt!.getTime()).toBe(before.food.updatedAt!.getTime());
		expect(after.serverModifiedAt).not.toBe(before.serverModifiedAt);
		if (outcome.status === 'updated') expect(outcome.food.labels).toContain('breakfast cereal');
	});

	it('never replaces what the user entered, but takes over the scores', async () => {
		const { applyLookup } = await import('$lib/server/food-enrichment/enrich');
		const food = await addFood({
			barcode: '4000000000017',
			servingSize: 30,
			nutriScore: 'a',
			novaGroup: 1,
			additives: ['en:e300'],
			ingredientsText: 'My own list',
			sugar: 2,
			sodium: 0
		});

		await applyLookup(userId, food.id, '4000000000017', {
			status: 'found',
			product: product({ sugar: 0, potassium: 500 }) as never
		});

		expect((await readFood(food.id)).food).toMatchObject({
			nutriScore: 'b',
			novaGroup: 2,
			additives: ['en:e300'],
			ingredientsText: 'My own list',
			sugar: 2,
			sodium: 0,
			potassium: 150
		});
	});

	it('works with whitespace around the stored barcode', async () => {
		const { applyLookup, enrichFood } = await import('$lib/server/food-enrichment/enrich');
		const tab = await addFood({ barcode: '4000000000017\t' });
		const nbsp = await addFood({ barcode: '4000000000024\u00a0' });
		lookupProduct.mockResolvedValue({ status: 'not_found' });

		expect((await enrichFood(userId, tab.id, '4000000000017\t')).status).toBe('not_found');
		expect(lookupProduct).toHaveBeenCalledWith('4000000000017');
		expect((await readFood(tab.id)).food.offCheckedAt).toBeInstanceOf(Date);

		const outcome = await applyLookup(userId, nbsp.id, '4000000000024\u00a0', {
			status: 'found',
			product: product() as never
		});
		expect(outcome.status).toBe('updated');
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

describe('offline replays after an enrichment', () => {
	const event = (method: 'PATCH' | 'DELETE', id: string, editedAt: Date, body?: unknown) =>
		({
			request: new Request(`http://localhost/api/foods/${id}`, {
				method,
				headers: {
					'content-type': 'application/json',
					[CLIENT_EDITED_AT_HEADER]: editedAt.toISOString()
				},
				body: body === undefined ? undefined : JSON.stringify(body)
			}),
			url: new URL(`http://localhost/api/foods/${id}`),
			params: { id },
			locals: { user: { id: userId } }
		}) as never;

	it('an edit and a delete queued before the job still land', async () => {
		const { applyLookup } = await import('$lib/server/food-enrichment/enrich');
		const { PATCH, DELETE } = await import('../../src/routes/api/foods/[id]/+server');
		const edited = await addFood({ barcode: '4000000000017', updatedAt: daysAgo(3) });
		const deleted = await addFood({ barcode: '4000000000024', updatedAt: daysAgo(3) });
		const queuedAt = daysAgo(2);

		await applyLookup(userId, edited.id, '4000000000017', {
			status: 'found',
			product: product() as never
		});
		await applyLookup(userId, deleted.id, '4000000000024', {
			status: 'found',
			product: product({ barcode: '4000000000024' }) as never
		});

		const patch = await PATCH(event('PATCH', edited.id, queuedAt, { name: 'Renamed offline' }));
		expect(patch.status).toBe(200);
		const after = (await readFood(edited.id)).food;
		expect(after.name).toBe('Renamed offline');
		expect(after.nutriScore).toBe('b');
		expect(after.updatedAt!.getTime()).toBe(queuedAt.getTime());

		const removal = await DELETE(event('DELETE', deleted.id, queuedAt));
		expect(removal.status).toBe(204);
		expect(await readFood(deleted.id)).toBeUndefined();
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

	it('enriches a real-shaped product that Open Food Facts gives no Nutri-Score', async () => {
		const jobs = await import('$lib/server/food-enrichment/jobs');
		const { runEnrichmentJob } = await import('$lib/server/food-enrichment/worker');
		const actual = await vi.importActual<typeof import('$lib/server/openfoodfacts')>(
			'$lib/server/openfoodfacts'
		);
		lookupProduct.mockImplementation(actual.lookupProduct);
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					code: '6111180000231',
					status: 1,
					product: {
						product_name: 'Lait demi-écrémé',
						nutriscore_grade: 'not-applicable',
						nova_group: '',
						additives_tags: [],
						ingredients_text: 'Lait demi-écrémé pasteurisé',
						image_front_url: 'https://images.openfoodfacts.org/images/products/milk.jpg',
						categories_tags: ['en:milks'],
						nutriments: { sugars_100g: 4.8, fiber_100g: null, calcium_100g: 0.12 }
					}
				})
			)
		);
		const food = await addFood({ barcode: '6111180000231', servingSize: 250, servingUnit: 'ml' });

		await jobs.startEnrichmentJob(userId);
		await runEnrichmentJob(userId, new AbortController().signal);
		fetchSpy.mockRestore();

		expect((await jobs.getEnrichmentStatus(userId)).job).toMatchObject({
			state: 'completed',
			updated: 1,
			notFound: 0
		});
		expect((await readFood(food.id)).food).toMatchObject({
			nutriScore: null,
			novaGroup: null,
			ingredientsText: 'Lait demi-écrémé pasteurisé',
			imageUrl: 'https://images.openfoodfacts.org/images/products/milk.jpg',
			sugar: 12,
			calcium: 300
		});
	});

	it('does not mark a food checked when the product cannot be read', async () => {
		const jobs = await import('$lib/server/food-enrichment/jobs');
		const { runEnrichmentJob } = await import('$lib/server/food-enrichment/worker');
		lookupProduct.mockResolvedValue({ status: 'invalid', issues: ['(root): invalid_type'] });
		const food = await addFood({ barcode: '4000000000017' });

		await jobs.startEnrichmentJob(userId);
		await runEnrichmentJob(userId, new AbortController().signal);

		expect((await jobs.getEnrichmentStatus(userId)).job).toMatchObject({
			state: 'completed',
			failed: 1,
			notFound: 0
		});
		expect((await readFood(food.id)).food.offCheckedAt).toBeNull();
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
