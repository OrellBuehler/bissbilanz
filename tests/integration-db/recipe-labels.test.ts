import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import { users, foods, recipes, recipeIngredients, recipeLabels } from '$lib/server/schema';

const DB_NAME = 'test_recipe_labels';
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
let foodId: string;
let recipeId: string;
let otherRecipeId: string;

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(recipeLabels);
	await db.delete(recipeIngredients);
	await db.delete(recipes);
	await db.delete(foods);
	await db.delete(users);

	const [user] = await db
		.insert(users)
		.values({ infomaniakSub: `recipe-labels-test-${Date.now()}` })
		.returning();
	userId = user.id;
	const [other] = await db
		.insert(users)
		.values({ infomaniakSub: `recipe-labels-other-${Date.now()}` })
		.returning();
	otherUserId = other.id;

	const [food] = await db
		.insert(foods)
		.values({
			userId,
			name: 'Haferflocken',
			servingSize: 100,
			servingUnit: 'g',
			calories: 370,
			protein: 13,
			carbs: 60,
			fat: 7,
			fiber: 10
		})
		.returning();
	foodId = food.id;

	const makeRecipe = async (name: string) => {
		const [recipe] = await db
			.insert(recipes)
			.values({ userId, name, totalServings: 2 })
			.returning();
		await db
			.insert(recipeIngredients)
			.values({ recipeId: recipe.id, foodId, quantity: 100, servingUnit: 'g', sortOrder: 0 });
		return recipe.id;
	};
	recipeId = await makeRecipe('Porridge');
	otherRecipeId = await makeRecipe('Gerstensuppe');
});

const sourcesFor = async (id: string) => {
	const db = getTestDB(dbUrl);
	return db
		.select({ label: recipeLabels.label, source: recipeLabels.source })
		.from(recipeLabels)
		.where(eq(recipeLabels.recipeId, id))
		.orderBy(recipeLabels.label);
};

describe('recipe labels', () => {
	it('normalizes and stores on write, and reads back sorted', async () => {
		const { setRecipeLabels, getRecipeLabels } = await import('$lib/server/recipe-labels');

		expect(await setRecipeLabels(userId, recipeId, ['Soups', 'FOOD', 'soups'], 'llm')).toEqual({
			status: 'ok',
			labels: ['food', 'soup'],
			dropped: []
		});

		const rows = await getRecipeLabels(userId, recipeId);
		expect(rows.map((r) => r.label)).toEqual(['food', 'soup']);
		expect(rows.every((r) => r.source === 'llm')).toBe(true);
	});

	it('is idempotent — a re-run cannot duplicate', async () => {
		const { setRecipeLabels } = await import('$lib/server/recipe-labels');
		await setRecipeLabels(userId, recipeId, ['porridge', 'oat'], 'llm');
		await setRecipeLabels(userId, recipeId, ['porridge', 'oat'], 'llm');
		expect(await sourcesFor(recipeId)).toHaveLength(2);
	});

	it('replaces only its own source, and a user write promotes a machine label', async () => {
		const { setRecipeLabels } = await import('$lib/server/recipe-labels');
		await setRecipeLabels(userId, recipeId, ['breakfast'], 'user');
		await setRecipeLabels(userId, recipeId, ['porridge'], 'llm');
		await setRecipeLabels(userId, recipeId, ['oat'], 'llm');
		expect(await sourcesFor(recipeId)).toEqual([
			{ label: 'breakfast', source: 'user' },
			{ label: 'oat', source: 'llm' }
		]);

		await setRecipeLabels(userId, recipeId, ['oat'], 'user');
		expect(await sourcesFor(recipeId)).toEqual([{ label: 'oat', source: 'user' }]);
	});

	it('extend keeps what is there and only adds', async () => {
		const { setRecipeLabels } = await import('$lib/server/recipe-labels');
		await setRecipeLabels(userId, recipeId, ['porridge'], 'llm');
		expect(
			await setRecipeLabels(userId, recipeId, ['oat', 'porridge'], 'llm', { mode: 'extend' })
		).toEqual({ status: 'ok', labels: ['oat', 'porridge'], dropped: [] });
	});

	it('the per-recipe cap is hard: overflow is reported, never silently trimmed', async () => {
		const { setRecipeLabels } = await import('$lib/server/recipe-labels');
		await setRecipeLabels(
			userId,
			recipeId,
			Array.from({ length: 18 }, (_, i) => `label${i}`),
			'user'
		);
		const result = await setRecipeLabels(userId, recipeId, ['aaa', 'bbb', 'ccc'], 'llm');
		expect(result).toMatchObject({ status: 'ok', dropped: ['ccc'] });
		expect(await sourcesFor(recipeId)).toHaveLength(20);
	});

	it('refuses a recipe the caller does not own, and a food id', async () => {
		const { setRecipeLabels } = await import('$lib/server/recipe-labels');
		expect(await setRecipeLabels(otherUserId, recipeId, ['porridge'], 'llm')).toEqual({
			status: 'not_found'
		});
		expect(await setRecipeLabels(userId, foodId, ['oat'], 'llm')).toEqual({
			status: 'not_found'
		});
		expect(await sourcesFor(recipeId)).toEqual([]);
	});

	it('reports per-item results for a batch and keeps going past a bad id', async () => {
		const { setRecipeLabelsBatch } = await import('$lib/server/recipe-labels');
		const results = await setRecipeLabelsBatch(
			userId,
			[
				{ recipeId, labels: ['porridge'] },
				{ recipeId: '00000000-0000-0000-0000-000000000000', labels: ['ghost'] },
				{ recipeId: otherRecipeId, labels: ['soup'] }
			],
			'external'
		);
		expect(results.map((r) => r.ok)).toEqual([true, false, true]);
		expect(results[1].error).toBe('Recipe not found');
		expect(await sourcesFor(otherRecipeId)).toEqual([{ label: 'soup', source: 'external' }]);
	});

	it('a user write moves the recipe clock and honours last-write-wins', async () => {
		const { setRecipeLabels } = await import('$lib/server/recipe-labels');
		const db = getTestDB(dbUrl);
		await db
			.update(recipes)
			.set({ updatedAt: new Date('2026-09-01T08:00:00Z') })
			.where(eq(recipes.id, recipeId));
		const t1 = new Date('2026-09-01T10:00:00Z');
		const t0 = new Date('2026-09-01T09:00:00Z');
		expect(
			await setRecipeLabels(userId, recipeId, ['porridge'], 'user', { clientEditedAt: t1 })
		).toMatchObject({ status: 'ok' });
		const [row] = await db
			.select({ updatedAt: recipes.updatedAt })
			.from(recipes)
			.where(eq(recipes.id, recipeId));
		expect(row.updatedAt?.getTime()).toBe(t1.getTime());

		expect(
			await setRecipeLabels(userId, recipeId, ['oat'], 'user', { clientEditedAt: t0 })
		).toEqual({ status: 'conflict' });
		expect(await sourcesFor(recipeId)).toEqual([{ label: 'porridge', source: 'user' }]);

		await setRecipeLabels(userId, recipeId, ['breakfast'], 'llm');
		const [after] = await db
			.select({ updatedAt: recipes.updatedAt })
			.from(recipes)
			.where(eq(recipes.id, recipeId));
		expect(after.updatedAt?.getTime()).toBe(t1.getTime());
	});

	it('deleting a recipe takes its labels with it', async () => {
		const { setRecipeLabels } = await import('$lib/server/recipe-labels');
		const db = getTestDB(dbUrl);
		await setRecipeLabels(userId, recipeId, ['porridge'], 'llm');
		await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
		await db.delete(recipes).where(eq(recipes.id, recipeId));
		expect(await sourcesFor(recipeId)).toEqual([]);
	});
});

describe('labels on the recipe read shape', () => {
	it('getRecipe, listRecipes and createRecipe carry the flat array', async () => {
		const { setRecipeLabels } = await import('$lib/server/recipe-labels');
		const { getRecipe, listRecipes, createRecipe } = await import('$lib/server/recipes');
		await setRecipeLabels(userId, recipeId, ['porridge', 'oat'], 'llm');

		expect((await getRecipe(userId, recipeId))?.labels).toEqual(['oat', 'porridge']);

		const { items } = await listRecipes(userId);
		expect(items.find((r) => r.id === recipeId)?.labels).toEqual(['oat', 'porridge']);
		expect(items.find((r) => r.id === otherRecipeId)?.labels).toEqual([]);

		const created = await createRecipe(userId, {
			name: 'Neu',
			totalServings: 1,
			ingredients: [{ foodId, quantity: 50, servingUnit: 'g' }]
		});
		const createdId = created.success ? created.data.id : '';
		expect((await getRecipe(userId, createdId))?.labels).toEqual([]);
	});

	it('minLabels and unlabeled return recipes carrying fewer than that many labels', async () => {
		const { setRecipeLabels } = await import('$lib/server/recipe-labels');
		const { listRecipes } = await import('$lib/server/recipes');
		await setRecipeLabels(userId, recipeId, ['porridge', 'oat'], 'llm');
		await setRecipeLabels(userId, otherRecipeId, ['soup'], 'llm');

		expect((await listRecipes(userId, { minLabels: 1 })).items).toEqual([]);
		const two = await listRecipes(userId, { minLabels: 2 });
		expect(two.items.map((r) => r.id)).toEqual([otherRecipeId]);
		expect(two.total).toBe(1);
		expect((await listRecipes(userId, { minLabels: 3 })).total).toBe(2);
	});

	it('a query matches the name first, then the English label', async () => {
		const { setRecipeLabels } = await import('$lib/server/recipe-labels');
		const { listRecipes } = await import('$lib/server/recipes');
		await setRecipeLabels(userId, otherRecipeId, ['soup', 'porridge'], 'llm');

		const byLabel = await listRecipes(userId, { query: 'Soups' });
		expect(byLabel.items.map((r) => r.name)).toEqual(['Gerstensuppe']);
		expect(byLabel.total).toBe(1);

		// Name beats label: "Porridge" is the name of one recipe and a label of the other.
		const both = await listRecipes(userId, { query: 'porridge' });
		expect(both.items.map((r) => r.name)).toEqual(['Porridge', 'Gerstensuppe']);

		expect((await listRecipes(userId, { query: 'suppe' })).items.map((r) => r.name)).toEqual([
			'Gerstensuppe'
		]);
		expect((await listRecipes(otherUserId, { query: 'soup' })).items).toEqual([]);
	});

	it('lists ingredient names per recipe in ingredient order, for owned recipes only', async () => {
		const { listRecipeIngredientNames } = await import('$lib/server/recipes');
		const names = await listRecipeIngredientNames(userId, [recipeId, otherRecipeId]);
		expect(names.get(recipeId)).toEqual(['Haferflocken']);
		expect((await listRecipeIngredientNames(otherUserId, [recipeId])).size).toBe(0);
	});
});

describe('shared label vocabulary', () => {
	it('counts foods and recipes together with the split', async () => {
		const { setFoodLabels, listLabelStats } = await import('$lib/server/food-labels');
		const { setRecipeLabels } = await import('$lib/server/recipe-labels');
		await setFoodLabels(userId, foodId, ['oat', 'grain'], 'llm');
		await setRecipeLabels(userId, recipeId, ['porridge', 'oat'], 'llm');
		await setRecipeLabels(userId, otherRecipeId, ['soup', 'oat'], 'llm');

		expect(await listLabelStats(userId)).toEqual([
			{ label: 'oat', count: 3, foodCount: 1, recipeCount: 2 },
			{ label: 'grain', count: 1, foodCount: 1, recipeCount: 0 },
			{ label: 'porridge', count: 1, foodCount: 0, recipeCount: 1 },
			{ label: 'soup', count: 1, foodCount: 0, recipeCount: 1 }
		]);
		expect(await listLabelStats(userId, { kind: 'food' })).toHaveLength(4);
		expect(await listLabelStats(userId, { kind: 'supplement' })).toEqual([]);
		expect(await listLabelStats(otherUserId)).toEqual([]);
	});
});
