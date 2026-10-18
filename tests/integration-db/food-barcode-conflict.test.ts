import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, foods } from '$lib/server/schema';

const DB_NAME = 'test_food_barcode_conflict';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);

	const db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({
		getDB: () => db
	}));
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

let userId: string;

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(foods);
	await db.delete(users);

	const [user] = await db
		.insert(users)
		.values({ infomaniakSub: `barcode-conflict-${Date.now()}` })
		.returning();
	userId = user.id;
});

const food = {
	name: 'Skyr',
	servingSize: 100,
	servingUnit: 'g' as const,
	calories: 60,
	protein: 10,
	carbs: 4,
	fat: 0,
	fiber: 0,
	barcode: '7610000000001'
};

describe('duplicate barcode on create (integration)', () => {
	it('createFood returns a 409 naming the existing food', async () => {
		const { createFood } = await import('$lib/server/foods');
		expect((await createFood(userId, food)).success).toBe(true);

		const result = await createFood(userId, { ...food, name: 'Skyr copy' });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect((result.error as { status?: number }).status).toBe(409);
			expect(result.error.message).toBe('A food with barcode 7610000000001 already exists: "Skyr"');
		}
	});

	it('the MCP create_food handler reports the conflict instead of an internal error', async () => {
		const { handleCreateFood } = await import('$lib/server/mcp/handlers');
		await handleCreateFood(userId, food);

		const result = await handleCreateFood(userId, { ...food, name: 'Skyr copy' });
		expect(result).toEqual({
			error: 'A food with barcode 7610000000001 already exists: "Skyr"'
		});
	});
});
