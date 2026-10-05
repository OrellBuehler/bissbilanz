import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { foodLabels, foods, uploads, users } from '$lib/server/schema';
import {
	closeTestDB,
	createTestDatabase,
	dropTestDatabase,
	getTestDB,
	runTestMigrations
} from './helpers';

const DB_NAME = `test_foods_delta_bulk_${randomUUID().replaceAll('-', '')}`;
let dbUrl: string;
let uploadDir: string;
let db: ReturnType<typeof getTestDB>;
let foodsModule: typeof import('$lib/server/foods');
let bulk: typeof import('$lib/server/food-bulk');
let cursor: typeof import('$lib/server/food-cursor');
let alice: string;
let bob: string;

const EPOCH = '1970-01-01T00:00:00Z';
const macros = { calories: 100, protein: 1, carbs: 2, fat: 3, fiber: 4 };
const item = (overrides: Record<string, unknown> = {}) => ({
	id: randomUUID(),
	name: 'Food',
	servingSize: 100,
	servingUnit: 'g',
	...macros,
	...overrides
});

async function insertFood(userId: string, values: Partial<typeof foods.$inferInsert> = {}) {
	const [row] = await db
		.insert(foods)
		.values({ userId, name: 'Food', servingSize: 100, servingUnit: 'g', ...macros, ...values })
		.returning();
	return row;
}

async function image(bytes = 40) {
	const buffer = await sharp({
		create: { width: bytes, height: bytes, channels: 3, background: '#aa8800' }
	})
		.png()
		.toBuffer();
	return new File([new Uint8Array(buffer)], 'photo.png', { type: 'image/png' });
}

async function pageThrough(userId: string, limit: number, extra: Record<string, unknown> = {}) {
	const seen: string[] = [];
	const pages: number[] = [];
	let after: import('$lib/server/food-cursor').FoodCursor | undefined;
	for (let guard = 0; guard < 50; guard++) {
		const page = await foodsModule.listFoods(userId, {
			limit,
			after,
			modifiedSince: after ? undefined : EPOCH,
			...extra
		});
		pages.push(page.items.length);
		seen.push(...page.items.map((food) => food.id));
		if (!page.nextCursor) break;
		after = cursor.decodeFoodCursor(page.nextCursor)!;
	}
	return { seen, pages };
}

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
	uploadDir = await mkdtemp(join(tmpdir(), 'bissbilanz-bulk-'));
	vi.stubEnv('UPLOAD_DIR', uploadDir);
	foodsModule = await import('$lib/server/foods');
	bulk = await import('$lib/server/food-bulk');
	cursor = await import('$lib/server/food-cursor');
	const [a, b] = await db
		.insert(users)
		.values([{ infomaniakSub: 'delta-alice' }, { infomaniakSub: 'delta-bob' }])
		.returning();
	alice = a.id;
	bob = b.id;
});

afterAll(async () => {
	vi.unstubAllEnvs();
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
	await rm(uploadDir, { recursive: true, force: true });
});

describe('server_modified_at trigger', () => {
	it('is stamped on insert and restamped on update whatever updated_at says', async () => {
		const old = new Date('2020-01-01T00:00:00Z');
		const food = await insertFood(alice, { name: 'Trigger', updatedAt: old });
		expect(food.updatedAt?.toISOString()).toBe(old.toISOString());
		expect(food.serverModifiedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);

		await new Promise((resolve) => setTimeout(resolve, 5));
		const [updated] = await db
			.update(foods)
			.set({ name: 'Trigger 2', updatedAt: old })
			.where(eq(foods.id, food.id))
			.returning();
		expect(updated.updatedAt?.toISOString()).toBe(old.toISOString());
		expect(updated.serverModifiedAt.getTime()).toBeGreaterThan(food.serverModifiedAt.getTime());
	});

	it('cannot be forged by the writer', async () => {
		const forged = new Date('2001-01-01T00:00:00Z');
		const food = await insertFood(alice, { name: 'Forged', serverModifiedAt: forged });
		expect(food.serverModifiedAt.getTime()).toBeGreaterThan(forged.getTime());
	});

	it('is served by the (user_id, server_modified_at, id) index', async () => {
		await db.execute(sql`SET enable_seqscan = off`);
		const plan = await db.execute(
			sql`EXPLAIN SELECT id FROM foods WHERE user_id = ${alice} AND (server_modified_at, id) > ('2020-01-01T00:00:00Z'::timestamptz, ${randomUUID()}::uuid) ORDER BY server_modified_at, id LIMIT 10`
		);
		await db.execute(sql`RESET enable_seqscan`);
		expect(JSON.stringify(plan)).toContain('idx_foods_user_server_modified');
	});
});

describe('listFoods delta mode', () => {
	it('walks every food exactly once in write order and ends with a null cursor', async () => {
		const carol = (await db.insert(users).values({ infomaniakSub: 'delta-carol' }).returning())[0]
			.id;
		const created: string[] = [];
		for (let index = 0; index < 7; index++) {
			created.push((await insertFood(carol, { name: `Same name` })).id);
		}
		const { seen, pages } = await pageThrough(carol, 3);
		expect(seen).toEqual(created);
		expect(pages).toEqual([3, 3, 1]);

		const exact = await foodsModule.listFoods(carol, {
			limit: 7,
			modifiedSince: '2000-01-01T00:00:00Z'
		});
		expect(exact.items).toHaveLength(7);
		expect(exact.nextCursor).toBeNull();
		expect(exact.total).toBe(7);
	});

	it('keeps microsecond precision across a page boundary', async () => {
		const dave = (await db.insert(users).values({ infomaniakSub: 'delta-dave' }).returning())[0].id;
		await db.execute(sql`
			INSERT INTO foods (user_id, name, serving_size, serving_unit, calories, protein, carbs, fat, fiber)
			SELECT ${dave}, 'Burst ' || g, 100, 'g', 1, 1, 1, 1, 1 FROM generate_series(1, 30) g`);
		const { seen } = await pageThrough(dave, 4);
		expect(seen).toHaveLength(30);
		expect(new Set(seen).size).toBe(30);
	});

	it('returns an offline edit with an old updatedAt that was just synced', async () => {
		const erin = (await db.insert(users).values({ infomaniakSub: 'delta-erin' }).returning())[0].id;
		const first = await insertFood(erin, { name: 'First' });
		const second = await insertFood(erin, { name: 'Second' });
		const newest = (await foodsModule.listFoods(erin, { modifiedSince: EPOCH })).items.at(-1)!;
		const checkpoint = new Date(newest.serverModifiedAt.getTime() + 1);

		await new Promise((resolve) => setTimeout(resolve, 5));
		await db
			.update(foods)
			.set({ name: 'First (edited offline)', updatedAt: new Date('2021-05-05T00:00:00Z') })
			.where(eq(foods.id, first.id));

		const legacy = await db
			.select({ id: foods.id })
			.from(foods)
			.where(and(eq(foods.userId, erin), sql`${foods.updatedAt} > ${checkpoint.toISOString()}`));
		expect(legacy).toEqual([]);

		const delta = await foodsModule.listFoods(erin, { modifiedSince: checkpoint.toISOString() });
		expect(delta.items.map((food) => food.id)).toEqual([first.id]);
		expect(delta.items[0].name).toBe('First (edited offline)');
		expect(delta.items.map((food) => food.id)).not.toContain(second.id);
	});

	it('carries labels, rounds nutrition and honours the supplement and user filters', async () => {
		const frank = (await db.insert(users).values({ infomaniakSub: 'delta-frank' }).returning())[0]
			.id;
		const labelled = await insertFood(frank, { name: 'Banana', calories: 89.123456 });
		await insertFood(frank, { name: 'Vitamin D', kind: 'supplement' });
		await db.insert(foodLabels).values({
			foodId: labelled.id,
			userId: frank,
			label: 'banana',
			source: 'user'
		});
		const page = await foodsModule.listFoods(frank, { modifiedSince: '2000-01-01T00:00:00Z' });
		expect(page.items.map((food) => food.name)).toEqual(['Banana']);
		expect(page.items[0].labels).toEqual(['banana']);
		expect(page.items[0]).not.toHaveProperty('cursorTimestamp');
		expect(page.items[0].serverModifiedAt).toBeInstanceOf(Date);
		const other = await foodsModule.listFoods(alice, { modifiedSince: '2000-01-01T00:00:00Z' });
		expect(other.items.every((food) => food.userId === alice)).toBe(true);
	});

	it('leaves the classic listing untouched', async () => {
		await insertFood(alice, { name: 'Another' });
		const page = await foodsModule.listFoods(alice, { limit: 2 });
		expect(page.items).toHaveLength(2);
		expect(page.total).toBeGreaterThan(2);
		expect(page).not.toHaveProperty('nextCursor');
	});
});

describe('listFoodIds', () => {
	it('lists only the regular foods of the user', async () => {
		const gina = (await db.insert(users).values({ infomaniakSub: 'delta-gina' }).returning())[0].id;
		const a = await insertFood(gina);
		const b = await insertFood(gina);
		await insertFood(gina, { kind: 'supplement' });
		await insertFood(alice);
		expect((await foodsModule.listFoodIds(gina)).sort()).toEqual([a.id, b.id].sort());
	});
});

describe('bulkCreateFoods', () => {
	it('creates foods with the client ids, and a replay reports exists', async () => {
		const first = item({ name: 'Oats', barcode: '7610000000011' });
		const second = item({ name: 'Milk' });
		const results = await bulk.bulkCreateFoods(alice, [first, second], new Map());
		expect(results).toEqual([
			{ id: first.id, status: 'created' },
			{ id: second.id, status: 'created' }
		]);
		const [stored] = await db.select().from(foods).where(eq(foods.id, first.id));
		expect(stored.userId).toBe(alice);
		expect(stored.barcode).toBe('7610000000011');

		const replay = await bulk.bulkCreateFoods(alice, [first, second], new Map());
		expect(replay.map((result) => result.status)).toEqual(['exists', 'exists']);
		expect(await db.select().from(foods).where(eq(foods.id, first.id))).toHaveLength(1);
	});

	it('echoes the id as sent, whatever its case', async () => {
		const id = randomUUID().toUpperCase();
		const [created] = await bulk.bulkCreateFoods(alice, [item({ id })], new Map());
		expect(created).toEqual({ id, status: 'created' });
		const [replay] = await bulk.bulkCreateFoods(alice, [item({ id })], new Map());
		expect(replay).toEqual({ id, status: 'exists' });
	});

	it('reports id_conflict for an id that belongs to another user, without touching it', async () => {
		const bobs = await insertFood(bob, { name: 'Bobs' });
		const [result] = await bulk.bulkCreateFoods(
			alice,
			[item({ id: bobs.id, name: 'Hijack' })],
			new Map()
		);
		expect(result).toEqual({ id: bobs.id, status: 'id_conflict' });
		const [after] = await db.select().from(foods).where(eq(foods.id, bobs.id));
		expect(after.name).toBe('Bobs');
		expect(after.userId).toBe(bob);
	});

	it('reports duplicate_barcode against the database and within the batch', async () => {
		await insertFood(alice, { name: 'Has barcode', barcode: '4000000000001' });
		const clash = item({ barcode: '4000000000001' });
		const a = item({ barcode: '4000000000002' });
		const b = item({ barcode: '4000000000002' });
		const none = item({ barcode: '' });
		const none2 = item({ barcode: null });
		const results = await bulk.bulkCreateFoods(alice, [clash, a, b, none, none2], new Map());
		expect(results.map((result) => result.status)).toEqual([
			'duplicate_barcode',
			'created',
			'duplicate_barcode',
			'created',
			'created'
		]);
		const [other] = await bulk.bulkCreateFoods(
			bob,
			[item({ barcode: '4000000000001' })],
			new Map()
		);
		expect(other.status).toBe('created');
	});

	it('reports invalid items without failing the rest, and duplicate ids in one request', async () => {
		const good = item({ name: 'Fine' });
		const bad = item({ name: '' });
		const negative = item({ calories: -5 });
		const twin = item({ id: good.id, name: 'Twin' });
		const results = await bulk.bulkCreateFoods(alice, [bad, good, negative, twin], new Map());
		expect(results.map((result) => result.status)).toEqual([
			'invalid',
			'created',
			'invalid',
			'invalid'
		]);
		expect(results[0].message).toContain('name');
		expect(results[3].message).toBe('Duplicate id in request');
		expect(await db.select().from(foods).where(eq(foods.id, bad.id))).toHaveLength(0);
	});

	it('rejects a request whose item has no uuid id, and oversized batches', async () => {
		await expect(
			bulk.bulkCreateFoods(alice, [{ name: 'No id', ...macros }], new Map())
		).rejects.toMatchObject({ status: 400 });
		await expect(bulk.bulkCreateFoods(alice, [], new Map())).rejects.toMatchObject({
			status: 400
		});
		await expect(
			bulk.bulkCreateFoods(
				alice,
				Array.from({ length: 201 }, () => item()),
				new Map()
			)
		).rejects.toMatchObject({ status: 400 });
	});

	it('writes labels as external, capped, and seeds catalog labels after them', async () => {
		const labels = Array.from(
			{ length: 20 },
			(_, index) => `label ${String.fromCharCode(97 + index)}`
		);
		const capped = item({ labels });
		const seeded = item({
			labels: ['Apple', 'apple'],
			categoriesTags: ['en:fruits', 'en:bananas']
		});
		await bulk.bulkCreateFoods(alice, [capped, seeded], new Map());
		const cappedLabels = await db.select().from(foodLabels).where(eq(foodLabels.foodId, capped.id));
		expect(cappedLabels).toHaveLength(20);
		expect(new Set(cappedLabels.map((row) => row.source))).toEqual(new Set(['external']));
		const seededLabels = await db.select().from(foodLabels).where(eq(foodLabels.foodId, seeded.id));
		expect(seededLabels.find((row) => row.label === 'apple')?.source).toBe('external');
		expect(seededLabels.every((row) => row.userId === alice)).toBe(true);
		const [read] = (
			await foodsModule.listFoods(alice, { modifiedSince: '2000-01-01T00:00:00Z', limit: 1000 })
		).items.filter((food) => food.id === seeded.id);
		expect(read.labels).toContain('apple');
	});

	it('stores an image part: thumbnail on disk, uploads row with its size, imageUrl set', async () => {
		const withImage = item({ name: 'Pictured' });
		const [result] = await bulk.bulkCreateFoods(
			alice,
			[withImage],
			new Map([[withImage.id, await image()]])
		);
		expect(result.status).toBe('created');
		expect(result.imageUrl).toMatch(/^\/uploads\/[a-f0-9-]+\.webp$/);
		expect(result.message).toBeUndefined();
		const filename = result.imageUrl!.slice('/uploads/'.length);
		const [row] = await db.select().from(uploads).where(eq(uploads.filename, filename));
		expect(row.userId).toBe(alice);
		expect(row.sizeBytes).toBeGreaterThan(0);
		expect(await readdir(uploadDir)).toContain(filename);
		const [food] = await db.select().from(foods).where(eq(foods.id, withImage.id));
		expect(food.imageUrl).toBe(result.imageUrl);
	});

	it('creates the food without the image when it is too large, not an image or corrupt', async () => {
		const tooLarge = item();
		const notImage = item();
		const corrupt = item();
		const before = await readdir(uploadDir);
		const results = await bulk.bulkCreateFoods(
			alice,
			[tooLarge, notImage, corrupt],
			new Map([
				[tooLarge.id, new File([new Uint8Array(200 * 1024 + 1)], 'big.png', { type: 'image/png' })],
				[notImage.id, new File(['hello'], 'a.txt', { type: 'text/plain' })],
				[corrupt.id, new File(['not really a png'], 'b.png', { type: 'image/png' })]
			])
		);
		expect(results).toEqual([
			{ id: tooLarge.id, status: 'created', message: 'image_too_large' },
			{ id: notImage.id, status: 'created', message: 'image_invalid' },
			{ id: corrupt.id, status: 'created', message: 'image_invalid' }
		]);
		expect(await readdir(uploadDir)).toEqual(before);
	});

	it('ignores image parts of foods that already exist or conflict', async () => {
		const existing = item();
		await bulk.bulkCreateFoods(alice, [existing], new Map());
		const before = await readdir(uploadDir);
		const [replay] = await bulk.bulkCreateFoods(
			alice,
			[existing],
			new Map([[existing.id, await image()]])
		);
		expect(replay).toEqual({ id: existing.id, status: 'exists' });
		expect(await readdir(uploadDir)).toEqual(before);
	});

	it('refuses images past the per-user quota but still creates the food', async () => {
		const quotaUser = (
			await db.insert(users).values({ infomaniakSub: 'delta-quota' }).returning()
		)[0].id;
		const one = item();
		const two = item();
		const [probe] = await bulk.bulkCreateFoods(
			quotaUser,
			[one],
			new Map([[one.id, await image()]])
		);
		const [{ sizeBytes }] = await db
			.select()
			.from(uploads)
			.where(eq(uploads.filename, probe.imageUrl!.slice('/uploads/'.length)));

		vi.stubEnv('UPLOAD_QUOTA_BYTES', String(sizeBytes + 1));
		try {
			const [over] = await bulk.bulkCreateFoods(
				quotaUser,
				[two],
				new Map([[two.id, await image()]])
			);
			expect(over).toEqual({ id: two.id, status: 'created', message: 'quota_exceeded' });
			const [food] = await db.select().from(foods).where(eq(foods.id, two.id));
			expect(food.imageUrl).toBeNull();
		} finally {
			vi.stubEnv('UPLOAD_QUOTA_BYTES', '');
		}
		expect(bulk.uploadQuotaBytes()).toBe(5 * 1024 ** 3);
	});

	it('shows the created foods in the delta feed', async () => {
		const fresh = (await db.insert(users).values({ infomaniakSub: 'delta-fresh' }).returning())[0]
			.id;
		const batch = Array.from({ length: 5 }, (_, index) => item({ name: `Bulk ${index}` }));
		await bulk.bulkCreateFoods(fresh, batch, new Map());
		const { seen } = await pageThrough(fresh, 2);
		expect(seen.sort()).toEqual(batch.map((entry) => entry.id).sort());
	});
});
