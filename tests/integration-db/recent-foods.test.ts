import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, foods, foodEntries } from '$lib/server/schema';

const DB_NAME = 'test_recent_foods';
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
	await db.delete(foodEntries);
	await db.delete(foods);
	await db.delete(users);

	const [user] = await db
		.insert(users)
		.values({ infomaniakSub: `recent-test-${Date.now()}` })
		.returning();
	userId = user.id;
});

const insertFood = async (name: string, servingUnit: 'g' | 'ml') => {
	const db = getTestDB(dbUrl);
	const [food] = await db
		.insert(foods)
		.values({
			userId,
			name,
			servingSize: 100,
			servingUnit,
			calories: 100,
			protein: 5,
			carbs: 10,
			fat: 2,
			fiber: 1
		})
		.returning();
	return food;
};

describe('listRecentFoods (integration)', () => {
	it('returns the servings from each food’s most recent log entry, newest food first', async () => {
		const db = getTestDB(dbUrl);
		const oatmeal = await insertFood('Oatmeal', 'g');
		const milk = await insertFood('Milk', 'ml');

		// Oatmeal: an older entry (2 servings) and a newer one (0.5 servings).
		// The newer servings value is what should be prefilled.
		await db.insert(foodEntries).values([
			{
				userId,
				foodId: oatmeal.id,
				date: '2026-04-10',
				mealType: 'breakfast',
				servings: 2,
				createdAt: new Date('2026-04-10T08:00:00Z')
			},
			{
				userId,
				foodId: oatmeal.id,
				date: '2026-04-12',
				mealType: 'breakfast',
				servings: 0.5,
				createdAt: new Date('2026-04-12T08:00:00Z')
			}
		]);
		// Milk: a single, most-recent-overall entry.
		await db.insert(foodEntries).values({
			userId,
			foodId: milk.id,
			date: '2026-04-13',
			mealType: 'breakfast',
			servings: 2.5,
			createdAt: new Date('2026-04-13T08:00:00Z')
		});

		const { listRecentFoods } = await import('$lib/server/foods');
		const recent = await listRecentFoods(userId);

		// Ordered by most recently logged food first.
		expect(recent.map((f) => f.name)).toEqual(['Milk', 'Oatmeal']);

		const oat = recent.find((f) => f.name === 'Oatmeal');
		const mlk = recent.find((f) => f.name === 'Milk');
		expect(oat?.lastServings).toBe(0.5);
		expect(mlk?.lastServings).toBe(2.5);
	});

	it('uses the latest entry by created_at even when an older entry is logged for a later date', async () => {
		const db = getTestDB(dbUrl);
		const food = await insertFood('Rice', 'g');

		// The entry logged most recently (higher created_at) wins, regardless of
		// the meal `date` it was logged against.
		await db.insert(foodEntries).values([
			{
				userId,
				foodId: food.id,
				date: '2026-05-20',
				mealType: 'dinner',
				servings: 3,
				createdAt: new Date('2026-05-01T10:00:00Z')
			},
			{
				userId,
				foodId: food.id,
				date: '2026-05-02',
				mealType: 'lunch',
				servings: 1.5,
				createdAt: new Date('2026-05-05T10:00:00Z')
			}
		]);

		const { listRecentFoods } = await import('$lib/server/foods');
		const recent = await listRecentFoods(userId);

		expect(recent).toHaveLength(1);
		expect(recent[0].lastServings).toBe(1.5);
	});
});
