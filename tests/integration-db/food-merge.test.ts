import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, foods, foodEntries, recipes, recipeIngredients } from '$lib/server/schema';

const DB_NAME = 'test_food_merge';
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
let keeperId: string;
let sourceId: string;
let recipeId: string;

beforeEach(async () => {
	const db = getTestDB(dbUrl);

	await db.delete(recipeIngredients);
	await db.delete(recipes);
	await db.delete(foodEntries);
	await db.delete(foods);
	await db.delete(users);

	const [user] = await db
		.insert(users)
		.values({ infomaniakSub: `merge-test-${Date.now()}` })
		.returning();
	userId = user.id;

	const [keeper] = await db
		.insert(foods)
		.values({
			userId,
			name: 'Greek Yogurt',
			brand: null,
			servingSize: 100,
			servingUnit: 'g',
			calories: 60,
			protein: 10,
			carbs: 4,
			fat: 0,
			fiber: 0,
			barcode: null
		})
		.returning();
	keeperId = keeper.id;

	const [source] = await db
		.insert(foods)
		.values({
			userId,
			name: 'Greek Yogurt 0%',
			brand: 'FAGE',
			servingSize: 100,
			servingUnit: 'g',
			calories: 59,
			protein: 10.3,
			carbs: 3.6,
			fat: 0.4,
			fiber: 0,
			barcode: '1111111111',
			sodium: 36,
			sugar: 3.2,
			isFavorite: true
		})
		.returning();
	sourceId = source.id;

	await db.insert(foodEntries).values([
		{
			userId,
			foodId: sourceId,
			date: '2026-04-10',
			mealType: 'breakfast',
			servings: 1
		},
		{
			userId,
			foodId: sourceId,
			date: '2026-04-11',
			mealType: 'snack',
			servings: 2
		}
	]);

	const [recipe] = await db
		.insert(recipes)
		.values({ userId, name: 'Yogurt Parfait', totalServings: 1 })
		.returning();
	recipeId = recipe.id;

	await db.insert(recipeIngredients).values({
		recipeId,
		foodId: sourceId,
		quantity: 200,
		servingUnit: 'g',
		sortOrder: 0
	});
});

describe('mergeFoods (integration)', () => {
	it('re-points food entries from source to keeper, deletes source, fills keeper gaps', async () => {
		const { mergeFoods } = await import('$lib/server/food-merge');

		const result = await mergeFoods(userId, {
			keeperId,
			sourceIds: [sourceId]
		});

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.brand).toBe('FAGE');
		expect(result.data.barcode).toBe('1111111111');
		expect(result.data.sodium).toBe(36);
		expect(result.data.sugar).toBe(3.2);
		expect(result.data.isFavorite).toBe(true);
		expect(result.data.name).toBe('Greek Yogurt');
		expect(result.data.calories).toBe(60);

		const db = getTestDB(dbUrl);

		const remainingFoods = await db.select().from(foods).where(eq(foods.userId, userId));
		expect(remainingFoods).toHaveLength(1);
		expect(remainingFoods[0].id).toBe(keeperId);

		const entries = await db
			.select()
			.from(foodEntries)
			.where(and(eq(foodEntries.userId, userId)));
		expect(entries).toHaveLength(2);
		expect(entries.every((e) => e.foodId === keeperId)).toBe(true);

		const ingredients = await db
			.select()
			.from(recipeIngredients)
			.where(eq(recipeIngredients.recipeId, recipeId));
		expect(ingredients).toHaveLength(1);
		expect(ingredients[0].foodId).toBe(keeperId);
	});

	it('keeper barcode wins when both have one, source is deleted cleanly', async () => {
		const db = getTestDB(dbUrl);
		await db.update(foods).set({ barcode: '7777777777' }).where(eq(foods.id, keeperId));

		const { mergeFoods } = await import('$lib/server/food-merge');
		const result = await mergeFoods(userId, {
			keeperId,
			sourceIds: [sourceId]
		});

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.barcode).toBe('7777777777');
	});

	it('applies overrides on top of auto-merge', async () => {
		const { mergeFoods } = await import('$lib/server/food-merge');
		const result = await mergeFoods(userId, {
			keeperId,
			sourceIds: [sourceId],
			overrides: { brand: 'Custom Brand', sodium: 99 }
		});

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.brand).toBe('Custom Brand');
		expect(result.data.sodium).toBe(99);
		expect(result.data.barcode).toBe('1111111111');
	});

	it('rejects merging across users (404 when source not owned)', async () => {
		const db = getTestDB(dbUrl);
		const [otherUser] = await db
			.insert(users)
			.values({ infomaniakSub: `other-user-${Date.now()}` })
			.returning();
		const [foreignFood] = await db
			.insert(foods)
			.values({
				userId: otherUser.id,
				name: 'Foreign',
				servingSize: 100,
				servingUnit: 'g',
				calories: 1,
				protein: 0,
				carbs: 0,
				fat: 0,
				fiber: 0
			})
			.returning();

		const { mergeFoods } = await import('$lib/server/food-merge');
		const result = await mergeFoods(userId, {
			keeperId,
			sourceIds: [foreignFood.id]
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect((result.error as { status?: number }).status).toBe(404);
		}

		const stillThere = await db.select().from(foods).where(eq(foods.id, foreignFood.id));
		expect(stillThere).toHaveLength(1);
	});

	it('merges multiple sources atomically', async () => {
		const db = getTestDB(dbUrl);
		const [source2] = await db
			.insert(foods)
			.values({
				userId,
				name: 'Greek Yogurt v3',
				servingSize: 100,
				servingUnit: 'g',
				calories: 61,
				protein: 10.5,
				carbs: 3.8,
				fat: 0.2,
				fiber: 0,
				calcium: 110
			})
			.returning();

		await db.insert(foodEntries).values({
			userId,
			foodId: source2.id,
			date: '2026-04-12',
			mealType: 'lunch',
			servings: 1
		});

		const { mergeFoods } = await import('$lib/server/food-merge');
		const result = await mergeFoods(userId, {
			keeperId,
			sourceIds: [sourceId, source2.id]
		});

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.brand).toBe('FAGE');
		expect(result.data.calcium).toBe(110);

		const remaining = await db.select().from(foods).where(eq(foods.userId, userId));
		expect(remaining).toHaveLength(1);

		const entries = await db.select().from(foodEntries).where(eq(foodEntries.userId, userId));
		expect(entries).toHaveLength(3);
		expect(entries.every((e) => e.foodId === keeperId)).toBe(true);
	});

	it('rescales entry servings when keeper and source serving sizes differ (macros invariant)', async () => {
		const db = getTestDB(dbUrl);
		// Source defines a 50 g serving; keeper (from beforeEach) a 100 g serving.
		const [halfServingSource] = await db
			.insert(foods)
			.values({
				userId,
				name: 'Yogurt (50g serving)',
				servingSize: 50,
				servingUnit: 'g',
				calories: 30,
				protein: 5,
				carbs: 2,
				fat: 0,
				fiber: 0
			})
			.returning();

		// 2 servings of the 50 g food = 100 g logged.
		const [entry] = await db
			.insert(foodEntries)
			.values({
				userId,
				foodId: halfServingSource.id,
				date: '2026-04-20',
				mealType: 'snack',
				servings: 2
			})
			.returning();

		const { mergeFoods } = await import('$lib/server/food-merge');
		const result = await mergeFoods(userId, { keeperId, sourceIds: [halfServingSource.id] });
		expect(result.success).toBe(true);

		const [updated] = await db.select().from(foodEntries).where(eq(foodEntries.id, entry.id));
		expect(updated.foodId).toBe(keeperId);
		// factor = source.servingSize / keeper.servingSize = 50/100 = 0.5 → 2 * 0.5 = 1
		// i.e. still 100 g against the keeper's 100 g serving — macros unchanged.
		expect(updated.servings).toBeCloseTo(1, 5);
	});
});
