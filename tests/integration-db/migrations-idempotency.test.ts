import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, dropTestDatabase, runTestMigrations, closeTestDB } from './helpers';

const DB_NAME = 'test_migration_idempotency';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('migration idempotency', () => {
	it('runs migrations twice without errors (simulates server restart)', async () => {
		await runTestMigrations(dbUrl);
		await expect(runTestMigrations(dbUrl)).resolves.toBeDefined();
	});
});
