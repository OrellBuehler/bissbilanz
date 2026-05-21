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
import { catalogDatasets, catalogFoods } from '$lib/server/schema';

const DB_NAME = 'test_catalog_import';
let dbUrl: string;
const FIXTURE = join(process.cwd(), 'tests/fixtures/catalog/mini.jsonl');

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
});
afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('catalog:import', () => {
	it('imports a dataset, upserts by key, replaces rows on re-import', async () => {
		await $`bun run scripts/catalog.ts import ${FIXTURE}`.env({
			...process.env,
			DATABASE_URL: dbUrl
		});
		const db = getTestDB(dbUrl);
		const ds = await db.query.catalogDatasets.findFirst({
			where: eq(catalogDatasets.key, 'testset')
		});
		expect(ds).toBeDefined();
		expect(ds!.productCount).toBe(2);
		const firstId = ds!.id;
		const rows = await db.select().from(catalogFoods).where(eq(catalogFoods.datasetId, firstId));
		expect(rows.length).toBe(2);
		expect(rows.find((r) => r.barcode === '7610095131003')!.name).toBe('Zweifel Paprika Chips');

		// Re-import: same key reuses the dataset row (id stable), rows replaced
		await $`bun run scripts/catalog.ts import ${FIXTURE}`.env({
			...process.env,
			DATABASE_URL: dbUrl
		});
		const ds2 = await db.query.catalogDatasets.findFirst({
			where: eq(catalogDatasets.key, 'testset')
		});
		expect(ds2!.id).toBe(firstId);
		const rows2 = await db.select().from(catalogFoods).where(eq(catalogFoods.datasetId, firstId));
		expect(rows2.length).toBe(2);
	});

	it('fails closed on an invalid line and aborts the whole import', async () => {
		const bad = join(process.cwd(), 'tests/fixtures/catalog/bad.jsonl');
		await Bun.write(
			bad,
			'{"_dataset":{"key":"badset","name":"Bad","source":"migros","priority":1}}\n{"name":"NoMacros","servingSize":100,"servingUnit":"g"}\n'
		);
		let failed = false;
		try {
			await $`bun run scripts/catalog.ts import ${bad}`
				.env({ ...process.env, DATABASE_URL: dbUrl })
				.quiet();
		} catch {
			failed = true;
		}
		expect(failed).toBe(true);
		const db = getTestDB(dbUrl);
		const ds = await db.query.catalogDatasets.findFirst({
			where: eq(catalogDatasets.key, 'badset')
		});
		expect(ds).toBeUndefined();
	});
});
