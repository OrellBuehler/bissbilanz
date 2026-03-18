import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';

const DB_NAME = 'test_migration_integrity';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('migration integrity', () => {
	it('runs all migrations from scratch without errors', async () => {
		await expect(runTestMigrations(dbUrl)).resolves.toBeDefined();
	});

	it('records all 30 migrations in the journal', async () => {
		const db = getTestDB(dbUrl);
		const result = await db.execute<{ count: number }>(
			sql`SELECT count(*)::int as count FROM "drizzle"."__drizzle_migrations"`
		);
		expect(result[0].count).toBe(30);
	});

	it('creates all expected tables', async () => {
		const db = getTestDB(dbUrl);
		const result = await db.execute<{ table_name: string }>(
			sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
		);
		const tables = result.map((r) => r.table_name);
		const expected = [
			'users',
			'sessions',
			'foods',
			'food_entries',
			'user_goals',
			'user_preferences',
			'recipes',
			'recipe_ingredients',
			'custom_meal_types',
			'favorite_meal_timeframes',
			'supplements',
			'supplement_ingredients',
			'supplement_logs',
			'weight_entries',
			'oauth_clients',
			'oauth_authorizations',
			'oauth_tokens',
			'oauth_authorization_codes'
		];
		for (const table of expected) {
			expect(tables).toContain(table);
		}
	});
});
