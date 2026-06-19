import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, foods, foodEntries, recipes } from '$lib/server/schema';

const DB_NAME = 'test_idor';
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

let userAId: string;
let userBId: string;
let ownFoodId: string;
let foreignFoodId: string;
let foreignRecipeId: string;

beforeEach(async () => {
	const db = getTestDB(dbUrl);

	await db.delete(foodEntries);
	await db.delete(recipes);
	await db.delete(foods);
	await db.delete(users);

	const [userA] = await db
		.insert(users)
		.values({ infomaniakSub: `idor-a-${Date.now()}` })
		.returning();
	userAId = userA.id;
	const [userB] = await db
		.insert(users)
		.values({ infomaniakSub: `idor-b-${Date.now()}` })
		.returning();
	userBId = userB.id;

	const [ownFood] = await db
		.insert(foods)
		.values({
			userId: userAId,
			name: 'My Oats',
			servingSize: 100,
			servingUnit: 'g',
			calories: 380,
			protein: 13,
			carbs: 67,
			fat: 7,
			fiber: 10
		})
		.returning();
	ownFoodId = ownFood.id;

	const [foreignFood] = await db
		.insert(foods)
		.values({
			userId: userBId,
			name: "Bob's Secret Protein",
			servingSize: 30,
			servingUnit: 'g',
			calories: 120,
			protein: 24,
			carbs: 2,
			fat: 1,
			fiber: 0
		})
		.returning();
	foreignFoodId = foreignFood.id;

	const [foreignRecipe] = await db
		.insert(recipes)
		.values({ userId: userBId, name: "Bob's Smoothie", totalServings: 1 })
		.returning();
	foreignRecipeId = foreignRecipe.id;
});

describe('IDOR — entry/recipe foreign-key ownership (integration)', () => {
	it('createEntry rejects a foodId owned by another user (404), creates nothing', async () => {
		const { createEntry } = await import('$lib/server/entries');
		const result = await createEntry(userAId, {
			foodId: foreignFoodId,
			mealType: 'breakfast',
			servings: 1,
			date: '2026-05-01'
		});

		expect(result.success).toBe(false);
		if (!result.success) expect((result.error as { status?: number }).status).toBe(404);

		const db = getTestDB(dbUrl);
		const entries = await db.select().from(foodEntries).where(eq(foodEntries.userId, userAId));
		expect(entries).toHaveLength(0);
	});

	it('createEntry rejects a recipeId owned by another user (404)', async () => {
		const { createEntry } = await import('$lib/server/entries');
		const result = await createEntry(userAId, {
			recipeId: foreignRecipeId,
			mealType: 'lunch',
			servings: 1,
			date: '2026-05-01'
		});

		expect(result.success).toBe(false);
		if (!result.success) expect((result.error as { status?: number }).status).toBe(404);
	});

	it('createEntry accepts the user’s own food (control)', async () => {
		const { createEntry } = await import('$lib/server/entries');
		const result = await createEntry(userAId, {
			foodId: ownFoodId,
			mealType: 'breakfast',
			servings: 1,
			date: '2026-05-01'
		});
		expect(result.success).toBe(true);
	});

	it('createRecipe rejects an ingredient referencing another user’s food (404), persists nothing', async () => {
		const { createRecipe } = await import('$lib/server/recipes');
		const result = await createRecipe(userAId, {
			name: 'Stolen Macros',
			totalServings: 1,
			ingredients: [{ foodId: foreignFoodId, quantity: 100, servingUnit: 'g' }]
		});

		expect(result.success).toBe(false);
		if (!result.success) expect((result.error as { status?: number }).status).toBe(404);

		const db = getTestDB(dbUrl);
		const rows = await db.select().from(recipes).where(eq(recipes.userId, userAId));
		expect(rows).toHaveLength(0);
	});

	it('read-side: a cross-user entry reference does not leak the foreign food’s name/macros', async () => {
		const db = getTestDB(dbUrl);
		// Bypass the write-side guard to simulate a pre-existing bad row.
		await db.insert(foodEntries).values({
			userId: userAId,
			foodId: foreignFoodId,
			date: '2026-05-02',
			mealType: 'Breakfast',
			servings: 1
		});

		const { listEntriesByDate } = await import('$lib/server/entries');
		const { items } = await listEntriesByDate(userAId, '2026-05-02');

		expect(items).toHaveLength(1);
		// foods join is scoped to the owner, so the foreign food resolves to null.
		expect(items[0].foodName).toBeNull();
		expect(items[0].calories).toBeNull();
	});
});
