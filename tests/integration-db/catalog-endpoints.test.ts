import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { $ } from 'bun';
import { join } from 'node:path';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { catalogDatasets, catalogFoods, catalogAccess, users, foods } from '$lib/server/schema';

const DB_NAME = 'test_catalog_endpoints';
let dbUrl: string;
const FIXTURE = join(process.cwd(), 'tests/fixtures/catalog/mini.jsonl');

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
	await $`bun run scripts/catalog.ts import ${FIXTURE}`.env({
		...process.env,
		DATABASE_URL: dbUrl
	});
});
afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('catalog queries', () => {
	it('catalogSearch returns nothing for an ungranted user, results for a granted one', async () => {
		const db = getTestDB(dbUrl);
		const { catalogSearch } = await import('$lib/server/catalog/queries');
		const [u] = await db
			.insert(users)
			.values({ infomaniakSub: 'sub-q-1', email: 'q1@example.com' })
			.returning();

		expect((await catalogSearch(db as never, u.id, 'Zweifel', 10)).length).toBe(0);

		const ds = (await db.query.catalogDatasets.findFirst({
			where: eq(catalogDatasets.key, 'testset')
		}))!;
		await db.insert(catalogAccess).values({ userId: u.id, datasetId: ds.id });

		const res = await catalogSearch(db as never, u.id, 'Zweifel', 10);
		expect(res.length).toBe(1);
		expect(res[0].name).toBe('Zweifel Paprika Chips');
		expect(res[0].datasetKey).toBe('testset');
	});

	it('catalogByBarcode honors access and dataset priority tie-break', async () => {
		const db = getTestDB(dbUrl);
		const { catalogByBarcode } = await import('$lib/server/catalog/queries');
		const [u] = await db
			.insert(users)
			.values({ infomaniakSub: 'sub-q-2', email: 'q2@example.com' })
			.returning();
		expect(await catalogByBarcode(db as never, u.id, '7610095131003')).toBeNull();

		const dsLow = (await db.query.catalogDatasets.findFirst({
			where: eq(catalogDatasets.key, 'testset')
		}))!;
		// Second dataset, same barcode, lower priority number (=higher precedence)
		const [dsHi] = await db
			.insert(catalogDatasets)
			.values({ key: 'prio', name: 'Prio', source: 'migros', priority: 1, productCount: 1 })
			.returning();
		await db.insert(catalogFoods).values({
			datasetId: dsHi.id,
			name: 'PRIO WINNER',
			servingSize: 100,
			servingUnit: 'g',
			calories: 1,
			protein: 1,
			carbs: 1,
			fat: 1,
			fiber: 1,
			barcode: '7610095131003'
		});
		await db.insert(catalogAccess).values({ userId: u.id, datasetId: dsLow.id });
		await db.insert(catalogAccess).values({ userId: u.id, datasetId: dsHi.id });

		const hit = await catalogByBarcode(db as never, u.id, '7610095131003');
		expect(hit!.name).toBe('PRIO WINNER');
	});

	it('instantiateCatalogFood creates a personal food and never mutates the catalog row', async () => {
		const db = getTestDB(dbUrl);
		const { instantiateCatalogFood } = await import('$lib/server/catalog/queries');
		const [u] = await db
			.insert(users)
			.values({ infomaniakSub: 'sub-q-3', email: 'q3@example.com' })
			.returning();
		const ds = (await db.query.catalogDatasets.findFirst({
			where: eq(catalogDatasets.key, 'testset')
		}))!;
		await db.insert(catalogAccess).values({ userId: u.id, datasetId: ds.id });
		const [cf] = await db
			.select()
			.from(catalogFoods)
			.where(eq(catalogFoods.datasetId, ds.id))
			.limit(1);

		const food = await instantiateCatalogFood(db as never, u.id, cf.id);
		expect(food).toBeTruthy();
		expect(food!.userId).toBe(u.id);
		expect(food!.name).toBe(cf.name);

		const personal = await db.select().from(foods).where(eq(foods.userId, u.id));
		expect(personal.length).toBe(1);
		const stillThere = await db.select().from(catalogFoods).where(eq(catalogFoods.id, cf.id));
		expect(stillThere.length).toBe(1);

		// Ungranted user cannot instantiate
		const [u2] = await db
			.insert(users)
			.values({ infomaniakSub: 'sub-q-4', email: 'q4@example.com' })
			.returning();
		await expect(instantiateCatalogFood(db as never, u2.id, cf.id)).resolves.toBeNull();
	});
});
