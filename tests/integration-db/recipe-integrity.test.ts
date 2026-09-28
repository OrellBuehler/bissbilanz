import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import {
	users,
	foods,
	recipes,
	recipeIngredients,
	foodEntries,
	supplements,
	supplementIngredients
} from '$lib/server/schema';

const DB_NAME = 'test_recipe_integrity';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);

	const db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({ getDB: () => db }));
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

let userId: string;
let otherUserId: string;

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(foodEntries);
	await db.delete(supplementIngredients);
	await db.delete(supplements);
	await db.delete(recipeIngredients);
	await db.delete(recipes);
	await db.delete(foods);
	await db.delete(users);

	const stamp = Date.now();
	const [user, other] = await db
		.insert(users)
		.values([{ infomaniakSub: `integrity-a-${stamp}` }, { infomaniakSub: `integrity-b-${stamp}` }])
		.returning();
	userId = user.id;
	otherUserId = other.id;
});

const makeFood = async (owner: string, name: string) => {
	const db = getTestDB(dbUrl);
	const [food] = await db
		.insert(foods)
		.values({
			userId: owner,
			name,
			servingSize: 100,
			servingUnit: 'g',
			calories: 100,
			protein: 1,
			carbs: 1,
			fat: 1,
			fiber: 1
		})
		.returning();
	return food;
};

const makeRecipe = async (owner: string, name: string, foodIds: string[]) => {
	const db = getTestDB(dbUrl);
	const [recipe] = await db
		.insert(recipes)
		.values({ userId: owner, name, totalServings: 2 })
		.returning();
	if (foodIds.length > 0) {
		await db.insert(recipeIngredients).values(
			foodIds.map((foodId, index) => ({
				recipeId: recipe.id,
				foodId,
				quantity: 100,
				servingUnit: 'g' as const,
				sortOrder: index
			}))
		);
	}
	return recipe;
};

describe('backfill migration for empty recipes', () => {
	const backfill = readFileSync(
		join(process.cwd(), 'drizzle', '0066_backfill_empty_recipes.sql'),
		'utf8'
	);

	it('gives each empty recipe a zero-nutrition placeholder food and leaves the rest alone', async () => {
		const db = getTestDB(dbUrl);
		const oats = await makeFood(userId, 'Oats');
		const full = await makeRecipe(userId, 'Porridge', [oats.id]);
		const empty = await makeRecipe(userId, 'Empty Soup', []);
		const otherEmpty = await makeRecipe(otherUserId, 'Their Empty Stew', []);

		await db.execute(sql.raw(backfill));

		const ingredientsOf = (recipeId: string) =>
			db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));

		expect(await ingredientsOf(full.id)).toHaveLength(1);
		expect((await ingredientsOf(full.id))[0].foodId).toBe(oats.id);

		const [ingredient] = await ingredientsOf(empty.id);
		expect(ingredient).toMatchObject({ quantity: 100, servingUnit: 'g', sortOrder: 0 });
		const [placeholder] = await db.select().from(foods).where(eq(foods.id, ingredient.foodId));
		expect(placeholder).toMatchObject({
			userId,
			name: 'Empty Soup',
			kind: 'food',
			servingSize: 100,
			servingUnit: 'g',
			calories: 0,
			protein: 0,
			carbs: 0,
			fat: 0,
			fiber: 0
		});

		const [otherIngredient] = await ingredientsOf(otherEmpty.id);
		const [otherPlaceholder] = await db
			.select()
			.from(foods)
			.where(eq(foods.id, otherIngredient.foodId));
		expect(otherPlaceholder.userId).toBe(otherUserId);
		expect(otherPlaceholder.name).toBe('Their Empty Stew');

		const { getRecipe } = await import('$lib/server/recipes');
		expect((await getRecipe(userId, empty.id))?.calories).toBe(0);
	});

	it('is a no-op when run again', async () => {
		const db = getTestDB(dbUrl);
		await makeRecipe(userId, 'Empty Soup', []);

		await db.execute(sql.raw(backfill));
		const foodsAfterFirst = await db.select().from(foods);
		const ingredientsAfterFirst = await db.select().from(recipeIngredients);
		await db.execute(sql.raw(backfill));

		expect(await db.select().from(foods)).toHaveLength(foodsAfterFirst.length);
		expect(await db.select().from(recipeIngredients)).toHaveLength(ingredientsAfterFirst.length);
		expect(foodsAfterFirst).toHaveLength(1);
	});
});

describe('deleteFood with recipes (integration)', () => {
	it('refuses to delete the last ingredient of a recipe, even with force', async () => {
		const db = getTestDB(dbUrl);
		const { deleteFood } = await import('$lib/server/foods');
		const lonely = await makeFood(userId, 'Lonely');
		const partner = await makeFood(userId, 'Partner');
		const solo = await makeRecipe(userId, 'Solo', [lonely.id]);
		const duo = await makeRecipe(userId, 'Duo', [lonely.id, partner.id]);

		const result = await deleteFood(userId, lonely.id, true);

		expect(result).toMatchObject({
			blocked: true,
			lastIngredientRecipes: [{ id: solo.id, name: 'Solo' }]
		});
		expect(await db.select().from(foods).where(eq(foods.id, lonely.id))).toHaveLength(1);
		expect(
			await db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, duo.id))
		).toHaveLength(2);
	});

	it('treats a food listed twice as the only ingredient as the last ingredient', async () => {
		const { deleteFood } = await import('$lib/server/foods');
		const twice = await makeFood(userId, 'Twice');
		const recipe = await makeRecipe(userId, 'Doubled', [twice.id, twice.id]);

		const result = await deleteFood(userId, twice.id, true);

		expect(result).toMatchObject({
			blocked: true,
			lastIngredientRecipes: [{ id: recipe.id, name: 'Doubled' }]
		});
	});

	it('still removes a food from recipes that keep other ingredients when forced', async () => {
		const db = getTestDB(dbUrl);
		const { deleteFood } = await import('$lib/server/foods');
		const extra = await makeFood(userId, 'Extra');
		const base = await makeFood(userId, 'Base');
		const recipe = await makeRecipe(userId, 'Base plus extra', [base.id, extra.id]);

		expect(await deleteFood(userId, extra.id)).toMatchObject({ blocked: true });
		expect(await deleteFood(userId, extra.id, true)).toEqual({ blocked: false });

		expect(await db.select().from(foods).where(eq(foods.id, extra.id))).toHaveLength(0);
		const remaining = await db
			.select()
			.from(recipeIngredients)
			.where(eq(recipeIngredients.recipeId, recipe.id));
		expect(remaining.map((row) => row.foodId)).toEqual([base.id]);
	});
});

describe('bulk delete with recipes (integration)', () => {
	it('reports a last ingredient as last_ingredient instead of offering force', async () => {
		const { batchFoodAction } = await import('$lib/server/food-bulk');
		const lonely = await makeFood(userId, 'Lonely');
		await makeRecipe(userId, 'Solo', [lonely.id]);

		const results = await batchFoodAction(userId, {
			ids: [lonely.id],
			action: 'delete',
			payload: { force: true }
		});

		expect(results).toEqual([{ id: lonely.id, ok: false, error: 'last_ingredient' }]);
	});
});

describe('usage (integration)', () => {
	it('lists recipe entries newest first with a total count', async () => {
		const db = getTestDB(dbUrl);
		const { getRecipeUsage } = await import('$lib/server/usage');
		const oats = await makeFood(userId, 'Oats');
		const recipe = await makeRecipe(userId, 'Porridge', [oats.id]);
		const base = { userId, recipeId: recipe.id, servings: 1 };
		await db.insert(foodEntries).values([
			{ ...base, date: '2026-05-01', mealType: 'Breakfast' },
			{ ...base, date: '2026-05-03', mealType: 'Dinner', servings: 2 },
			{ ...base, date: '2026-05-03', mealType: 'Breakfast', eatenAt: new Date('2000-01-01') }
		]);

		const usage = await getRecipeUsage(userId, recipe.id);

		expect(usage?.totalEntries).toBe(3);
		expect(usage?.entries.map((entry) => [entry.date, entry.mealType])).toEqual([
			['2026-05-03', 'Dinner'],
			['2026-05-03', 'Breakfast'],
			['2026-05-01', 'Breakfast']
		]);
		expect(usage?.entries[0].servings).toBe(2);
		expect(typeof usage?.entries[0].eatenAt).toBe('string');
	});

	it('caps the entry list at 200 but reports the full total', async () => {
		const db = getTestDB(dbUrl);
		const { getRecipeUsage, USAGE_ENTRY_LIMIT } = await import('$lib/server/usage');
		const oats = await makeFood(userId, 'Oats');
		const recipe = await makeRecipe(userId, 'Porridge', [oats.id]);
		await db.insert(foodEntries).values(
			Array.from({ length: USAGE_ENTRY_LIMIT + 5 }, (_, index) => ({
				userId,
				recipeId: recipe.id,
				servings: 1,
				mealType: 'Lunch',
				date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
			}))
		);

		const usage = await getRecipeUsage(userId, recipe.id);

		expect(usage?.entries).toHaveLength(USAGE_ENTRY_LIMIT);
		expect(usage?.totalEntries).toBe(USAGE_ENTRY_LIMIT + 5);
		const dates = usage!.entries.map((entry) => entry.date);
		expect(dates).toEqual([...dates].sort().reverse());
	});

	it('returns null for a recipe or food owned by someone else', async () => {
		const { getRecipeUsage, getFoodUsage } = await import('$lib/server/usage');
		const theirFood = await makeFood(otherUserId, 'Theirs');
		const theirRecipe = await makeRecipe(otherUserId, 'Their recipe', [theirFood.id]);

		expect(await getRecipeUsage(userId, theirRecipe.id)).toBeNull();
		expect(await getFoodUsage(userId, theirFood.id)).toBeNull();
	});

	it('reports entries, recipes (flagging last ingredient) and supplements for a food', async () => {
		const db = getTestDB(dbUrl);
		const { getFoodUsage } = await import('$lib/server/usage');
		const salt = await makeFood(userId, 'Salt');
		const pepper = await makeFood(userId, 'Pepper');
		const only = await makeRecipe(userId, 'Only salt', [salt.id]);
		const shared = await makeRecipe(userId, 'Salt and pepper', [salt.id, pepper.id]);
		await db
			.insert(foodEntries)
			.values({ userId, foodId: salt.id, servings: 1, mealType: 'Lunch', date: '2026-05-02' });
		const [supplement] = await db
			.insert(supplements)
			.values({ userId, name: 'Electrolytes', scheduleType: 'daily' })
			.returning();
		await db
			.insert(supplementIngredients)
			.values({ supplementId: supplement.id, foodId: salt.id, servings: 1 });

		const usage = await getFoodUsage(userId, salt.id);

		expect(usage?.totalEntries).toBe(1);
		expect(usage?.entries[0]).toMatchObject({ date: '2026-05-02', mealType: 'Lunch' });
		expect(usage?.recipes).toEqual([
			{ id: only.id, name: 'Only salt', isLastIngredient: true },
			{ id: shared.id, name: 'Salt and pepper', isLastIngredient: false }
		]);
		expect(usage?.supplements).toEqual([{ id: supplement.id, name: 'Electrolytes' }]);
	});
});
