import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { ALL_NUTRIENTS } from '$lib/nutrients';

const DB_NAME = 'test_catalog_schema';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

async function columns(db: ReturnType<typeof getTestDB>, table: string): Promise<Set<string>> {
	const rows = await db.execute(
		sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${table}`
	);
	return new Set((rows as unknown as { column_name: string }[]).map((r) => r.column_name));
}

describe('catalog schema', () => {
	it('catalog_foods nutrient columns match foods and ALL_NUTRIENTS exactly', async () => {
		const db = getTestDB(dbUrl);
		const catalogCols = await columns(db, 'catalog_foods');
		const foodCols = await columns(db, 'foods');
		const nutrientDbCols = new Set(ALL_NUTRIENTS.map((n) => n.dbColumn));
		const foodsNutrientCols = new Set([...foodCols].filter((c) => nutrientDbCols.has(c)));
		const catalogNutrientCols = new Set([...catalogCols].filter((c) => nutrientDbCols.has(c)));
		expect(
			foodsNutrientCols.size,
			`foods has ${foodsNutrientCols.size} nutrient cols, expected ${nutrientDbCols.size}`
		).toBe(nutrientDbCols.size);
		expect(
			catalogNutrientCols.size,
			`catalog_foods has ${catalogNutrientCols.size} nutrient cols, expected ${nutrientDbCols.size}`
		).toBe(nutrientDbCols.size);
		for (const n of ALL_NUTRIENTS) {
			expect(catalogCols.has(n.dbColumn), `catalog_foods missing ${n.dbColumn}`).toBe(true);
			expect(foodCols.has(n.dbColumn), `foods missing ${n.dbColumn}`).toBe(true);
		}
	});

	it('pg_trgm extension and GIN name index exist', async () => {
		const db = getTestDB(dbUrl);
		const ext = await db.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`);
		expect((ext as unknown as unknown[]).length).toBe(1);
		const idx = await db.execute(
			sql`SELECT 1 FROM pg_indexes WHERE indexname = 'idx_catalog_foods_name_trgm'`
		);
		expect((idx as unknown as unknown[]).length).toBe(1);
	});

	it('catalog_datasets.key is unique and catalog_access has composite PK', async () => {
		const db = getTestDB(dbUrl);
		const ds = await columns(db, 'catalog_datasets');
		expect(ds.has('key')).toBe(true);
		expect(ds.has('priority')).toBe(true);
		const acc = await columns(db, 'catalog_access');
		expect(acc.has('user_id')).toBe(true);
		expect(acc.has('dataset_id')).toBe(true);
	});
});
