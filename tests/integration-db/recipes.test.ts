import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, foods, recipes, recipeIngredients, foodEntries } from '$lib/server/schema';

const DB_NAME = 'test_recipes';
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

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(foodEntries);
	await db.delete(recipeIngredients);
	await db.delete(recipes);
	await db.delete(foods);
	await db.delete(users);

	const [user] = await db
		.insert(users)
		.values({ infomaniakSub: `recipes-test-${Date.now()}` })
		.returning();
	userId = user.id;
});

describe('recipe macros (integration)', () => {
	it('macroAggregations (whole-recipe) is totalServings x the per-serving amount from buildRecipeMacrosCte', async () => {
		const db = getTestDB(dbUrl);
		const { createRecipe, getRecipe } = await import('$lib/server/recipes');
		const { createEntry, listEntriesByDate } = await import('$lib/server/entries');

		const [food] = await db
			.insert(foods)
			.values({
				userId,
				name: 'Oats',
				servingSize: 100,
				servingUnit: 'g',
				calories: 380,
				protein: 13,
				carbs: 67,
				fat: 7,
				fiber: 10
			})
			.returning();

		const created = await createRecipe(userId, {
			name: 'Big Batch Oatmeal',
			totalServings: 4,
			ingredients: [{ foodId: food.id, quantity: 400, servingUnit: 'g' }]
		});
		expect(created.success).toBe(true);
		if (!created.success) return;

		const whole = await getRecipe(userId, created.data.id);
		expect(whole).toBeTruthy();
		// 400g of a 380kcal/100g food = 1520 kcal for the whole recipe.
		expect(whole?.calories).toBeCloseTo(1520, 5);

		await createEntry(userId, {
			recipeId: created.data.id,
			mealType: 'Breakfast',
			servings: 1,
			date: '2026-05-01'
		});
		const { items } = await listEntriesByDate(userId, '2026-05-01');
		expect(items).toHaveLength(1);
		// The entry-embedded recipe is per-serving: 1520 / 4 = 380 kcal.
		expect(items[0].calories).toBeCloseTo(380, 5);
		expect((whole?.calories ?? 0) / (whole?.totalServings ?? 1)).toBeCloseTo(
			items[0].calories ?? 0,
			5
		);
	});

	it('converts a volume-unit ingredient into the food’s own unit', async () => {
		const db = getTestDB(dbUrl);
		const { createRecipe, getRecipe } = await import('$lib/server/recipes');

		// A food measured in ml: 100 ml = 200 kcal.
		const [food] = await db
			.insert(foods)
			.values({
				userId,
				name: 'Olive Oil',
				servingSize: 100,
				servingUnit: 'ml',
				calories: 200,
				protein: 0,
				carbs: 0,
				fat: 22,
				fiber: 0
			})
			.returning();

		// 2 tbsp = 30 ml (matches the codebase-wide tbsp=15ml factor).
		const created = await createRecipe(userId, {
			name: 'Dressing',
			totalServings: 1,
			ingredients: [{ foodId: food.id, quantity: 2, servingUnit: 'tbsp' }]
		});
		expect(created.success).toBe(true);
		if (!created.success) return;

		const recipe = await getRecipe(userId, created.data.id);
		// 30 ml of a 200kcal/100ml food = 60 kcal.
		expect(recipe?.calories).toBeCloseTo(60, 5);
	});

	it('falls back to raw quantity for a legacy cross-dimension row', async () => {
		const db = getTestDB(dbUrl);
		const { getRecipe } = await import('$lib/server/recipes');

		const [food] = await db
			.insert(foods)
			.values({
				userId,
				name: 'Flour',
				servingSize: 100,
				servingUnit: 'g',
				calories: 364,
				protein: 10,
				carbs: 76,
				fat: 1,
				fiber: 3
			})
			.returning();
		const [recipe] = await db
			.insert(recipes)
			.values({ userId, name: 'Legacy Recipe', totalServings: 1 })
			.returning();
		// Bypass the write-side validation to simulate a pre-existing row that
		// predates unit-aware validation: 50 "ml" against a food measured in g.
		await db.insert(recipeIngredients).values({
			recipeId: recipe.id,
			foodId: food.id,
			quantity: 50,
			servingUnit: 'ml',
			sortOrder: 0
		});

		const result = await getRecipe(userId, recipe.id);
		// Factor 1 fallback: 50 * 364 / 100 = 182.
		expect(result?.calories).toBeCloseTo(182, 5);
	});

	it('rejects a cross-dimension unit on create with a 400', async () => {
		const db = getTestDB(dbUrl);
		const { createRecipe } = await import('$lib/server/recipes');

		const [food] = await db
			.insert(foods)
			.values({
				userId,
				name: 'Milk',
				servingSize: 100,
				servingUnit: 'ml',
				calories: 60,
				protein: 3,
				carbs: 5,
				fat: 3,
				fiber: 0
			})
			.returning();

		const result = await createRecipe(userId, {
			name: 'Bad Unit Recipe',
			totalServings: 1,
			ingredients: [{ foodId: food.id, quantity: 100, servingUnit: 'g' }]
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect((result.error as { status?: number }).status).toBe(400);
		}
		const rows = await db.select().from(recipes).where(eq(recipes.userId, userId));
		expect(rows).toHaveLength(0);
	});

	it('rejects a cross-dimension unit on update with a 400', async () => {
		const db = getTestDB(dbUrl);
		const { createRecipe, updateRecipe } = await import('$lib/server/recipes');

		const [food] = await db
			.insert(foods)
			.values({
				userId,
				name: 'Water',
				servingSize: 250,
				servingUnit: 'ml',
				calories: 0,
				protein: 0,
				carbs: 0,
				fat: 0,
				fiber: 0
			})
			.returning();
		const created = await createRecipe(userId, {
			name: 'Recipe',
			totalServings: 1,
			ingredients: [{ foodId: food.id, quantity: 100, servingUnit: 'ml' }]
		});
		expect(created.success).toBe(true);
		if (!created.success) return;

		const result = await updateRecipe(userId, created.data.id, {
			ingredients: [{ foodId: food.id, quantity: 1, servingUnit: 'lb' }]
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect((result.error as { status?: number }).status).toBe(400);
		}
	});
});

describe('PATCH recipe ingredients end to end (integration)', () => {
	it('replaces ingredients and recomputes macros', async () => {
		const db = getTestDB(dbUrl);
		const { createRecipe, updateRecipe, getRecipe } = await import('$lib/server/recipes');

		const [foodA] = await db
			.insert(foods)
			.values({
				userId,
				name: 'Banana',
				servingSize: 100,
				servingUnit: 'g',
				calories: 89,
				protein: 1,
				carbs: 23,
				fat: 0,
				fiber: 3
			})
			.returning();
		const [foodB] = await db
			.insert(foods)
			.values({
				userId,
				name: 'Peanut Butter',
				servingSize: 100,
				servingUnit: 'g',
				calories: 588,
				protein: 25,
				carbs: 20,
				fat: 50,
				fiber: 6
			})
			.returning();

		const created = await createRecipe(userId, {
			name: 'Snack',
			totalServings: 1,
			ingredients: [{ foodId: foodA.id, quantity: 100, servingUnit: 'g' }]
		});
		expect(created.success).toBe(true);
		if (!created.success) return;

		const updated = await updateRecipe(userId, created.data.id, {
			ingredients: [
				{ foodId: foodA.id, quantity: 100, servingUnit: 'g' },
				{ foodId: foodB.id, quantity: 20, servingUnit: 'g' }
			]
		});
		expect(updated.success).toBe(true);

		const recipe = await getRecipe(userId, created.data.id);
		expect(recipe?.ingredients).toHaveLength(2);
		// 89 (banana) + 20g of 588kcal/100g peanut butter (117.6) = 206.6,
		// rounded to the nearest whole calorie by roundNutrition.
		expect(recipe?.calories).toBe(207);
	});
});

describe('food delete conflict counts (integration)', () => {
	it('reports ingredientCount and distinct recipeCount on a blocked delete', async () => {
		const db = getTestDB(dbUrl);
		const { createRecipe } = await import('$lib/server/recipes');
		const { deleteFood } = await import('$lib/server/foods');

		const [food] = await db
			.insert(foods)
			.values({
				userId,
				name: 'Shared Ingredient',
				servingSize: 100,
				servingUnit: 'g',
				calories: 100,
				protein: 5,
				carbs: 10,
				fat: 2,
				fiber: 1
			})
			.returning();

		const recipeA = await createRecipe(userId, {
			name: 'Recipe A',
			totalServings: 1,
			ingredients: [{ foodId: food.id, quantity: 50, servingUnit: 'g' }]
		});
		const recipeB = await createRecipe(userId, {
			name: 'Recipe B',
			totalServings: 1,
			ingredients: [{ foodId: food.id, quantity: 30, servingUnit: 'g' }]
		});
		expect(recipeA.success).toBe(true);
		expect(recipeB.success).toBe(true);

		const result = await deleteFood(userId, food.id);
		expect(result.blocked).toBe(true);
		if (result.blocked) {
			expect(result.entryCount).toBe(0);
			expect(result.ingredientCount).toBe(2);
			expect(result.recipeCount).toBe(2);
		}
	});

	it('force delete removes the food from its recipes', async () => {
		const db = getTestDB(dbUrl);
		const { createRecipe, getRecipe } = await import('$lib/server/recipes');
		const { deleteFood } = await import('$lib/server/foods');

		const [food] = await db
			.insert(foods)
			.values({
				userId,
				name: 'To Delete',
				servingSize: 100,
				servingUnit: 'g',
				calories: 100,
				protein: 5,
				carbs: 10,
				fat: 2,
				fiber: 1
			})
			.returning();
		const created = await createRecipe(userId, {
			name: 'Recipe',
			totalServings: 1,
			ingredients: [{ foodId: food.id, quantity: 50, servingUnit: 'g' }]
		});
		expect(created.success).toBe(true);
		if (!created.success) return;

		const result = await deleteFood(userId, food.id, true);
		expect(result.blocked).toBe(false);

		const recipe = await getRecipe(userId, created.data.id);
		expect(recipe?.ingredients).toHaveLength(0);
	});
});

describe('favorite recipe preview math (integration)', () => {
	it('listFavoriteRecipes returns whole-recipe totals with totalServings', async () => {
		const db = getTestDB(dbUrl);
		const { createRecipe, updateRecipe } = await import('$lib/server/recipes');
		const { listFavoriteRecipes } = await import('$lib/server/favorites');

		const [food] = await db
			.insert(foods)
			.values({
				userId,
				name: 'Favorite Ingredient',
				servingSize: 100,
				servingUnit: 'g',
				calories: 200,
				protein: 10,
				carbs: 20,
				fat: 5,
				fiber: 2
			})
			.returning();
		const created = await createRecipe(userId, {
			name: 'Favorite Recipe',
			totalServings: 2,
			ingredients: [{ foodId: food.id, quantity: 200, servingUnit: 'g' }]
		});
		expect(created.success).toBe(true);
		if (!created.success) return;
		await updateRecipe(userId, created.data.id, { isFavorite: true });

		const favorites = await listFavoriteRecipes(userId);
		expect(favorites).toHaveLength(1);
		// Whole-recipe: 200g of a 200kcal/100g food = 400 kcal for 2 servings.
		expect(favorites[0].calories).toBeCloseTo(400, 5);
		expect(favorites[0].totalServings).toBe(2);
		// A per-serving preview must divide this by totalServings (200 kcal).
		expect(favorites[0].calories / favorites[0].totalServings).toBeCloseTo(200, 5);
	});
});
