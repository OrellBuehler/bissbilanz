import { describe, test, expect, beforeEach, vi } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER, TEST_FOOD, TEST_RECIPE } from '../helpers/fixtures';

const { db, setResult, reset, queueResults } = createMockDB();

const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const foodLabelsModule = await import('$lib/server/food-labels');
const recipeLabelsModule = await import('$lib/server/recipe-labels');
const { listRecipes, listRecipeIngredientNames } = await import('$lib/server/recipes');

const U = TEST_USER.id;
const R = TEST_RECIPE.id;
const F = TEST_FOOD.id;

const failing = (message: string) => ({
	then: (_resolve: unknown, reject: (error: Error) => void) => reject(new Error(message))
});

beforeEach(() => reset());

describe('recipe_labels table', () => {
	test('cascades from recipes and users', () => {
		const config = getTableConfig(schema.recipeLabels);
		expect(config.foreignKeys.map((fk) => fk.reference().foreignTable)).toEqual([
			schema.recipes,
			schema.users
		]);
		expect(config.foreignKeys.every((fk) => fk.onDelete === 'cascade')).toBe(true);
		expect(config.indexes.map((index) => index.config.name).sort()).toEqual([
			'idx_recipe_labels_recipe_id',
			'idx_recipe_labels_recipe_label',
			'idx_recipe_labels_user_label'
		]);
	});
});

describe('setRecipeLabels', () => {
	test('answers not_found for a recipe the caller does not own', async () => {
		queueResults([[]]);
		expect(await recipeLabelsModule.setRecipeLabels(U, R, ['soup'], 'llm')).toEqual({
			status: 'not_found'
		});
	});

	test('a machine write replaces its source and merges with what is left', async () => {
		queueResults([[{ id: R }], [], [{ label: 'soup' }], []]);
		const result = await recipeLabelsModule.setRecipeLabels(U, R, ['Porridges'], 'llm');
		expect(result).toEqual({ status: 'ok', labels: ['porridge', 'soup'], dropped: [] });
	});

	test('extend skips the delete', async () => {
		queueResults([[{ id: R }], [{ label: 'soup' }], []]);
		const result = await recipeLabelsModule.setRecipeLabels(U, R, ['soup', 'stew'], 'llm', {
			mode: 'extend',
			confidence: 0.5
		});
		expect(result).toEqual({ status: 'ok', labels: ['soup', 'stew'], dropped: [] });
	});

	test('a user write that loses last-write-wins is a conflict', async () => {
		queueResults([[{ id: R }], []]);
		expect(
			await recipeLabelsModule.setRecipeLabels(U, R, ['soup'], 'user', {
				clientEditedAt: new Date('2026-09-01T10:00:00Z')
			})
		).toEqual({ status: 'conflict' });
	});

	test('a user write stamps the recipe and promotes labels another source holds', async () => {
		queueResults([[{ id: R }], [{ id: R }], [], [{ label: 'soup' }], []]);
		expect(await recipeLabelsModule.setRecipeLabels(U, R, ['soup', 'stew'], 'user')).toEqual({
			status: 'ok',
			labels: ['soup', 'stew'],
			dropped: []
		});
	});

	test('the cap is hard: overflow is reported as dropped', async () => {
		const existing = Array.from({ length: 20 }, (_, i) => ({ label: `label${i}` }));
		queueResults([[{ id: R }], [], existing, []]);
		const result = await recipeLabelsModule.setRecipeLabels(U, R, ['extra'], 'llm');
		expect(result).toMatchObject({ status: 'ok', dropped: ['extra'] });
	});
});

describe('getRecipeLabels', () => {
	test('returns the rows for the recipe', async () => {
		const rows = [{ label: 'soup', source: 'llm', confidence: null, createdAt: null }];
		setResult(rows);
		expect(await recipeLabelsModule.getRecipeLabels(U, R)).toEqual(rows);
	});
});

describe('setRecipeLabelsBatch', () => {
	test('reports per-item results: ok, unknown id, and a failing write', async () => {
		const unknown = '00000000-0000-4000-8000-000000000000';
		const broken = '00000000-0000-4000-8000-000000000001';
		queueResults([[{ id: R }, { id: broken }], [], [], [], failing('boom')]);
		const results = await recipeLabelsModule.setRecipeLabelsBatch(
			U,
			[
				{ recipeId: R, labels: ['soup'] },
				{ recipeId: unknown, labels: ['ghost'] },
				{ recipeId: broken, labels: ['x'] }
			],
			'external'
		);
		expect(results).toEqual([
			{ recipeId: R, ok: true, labels: ['soup'] },
			{ recipeId: unknown, ok: false, error: 'Recipe not found' },
			{ recipeId: broken, ok: false, error: 'boom' }
		]);
	});

	test('a user batch stamps the recipes and surfaces dropped labels', async () => {
		const existing = Array.from({ length: 20 }, (_, i) => ({ label: `label${i}` }));
		queueResults([[{ id: R }], [{ id: R }], [], existing, []]);
		const results = await recipeLabelsModule.setRecipeLabelsBatch(
			U,
			[{ recipeId: R, labels: ['extra'] }],
			'user'
		);
		expect(results).toEqual([
			{ recipeId: R, ok: true, labels: existing.map((row) => row.label).sort(), dropped: ['extra'] }
		]);
	});

	test('an empty batch makes no ownership query', async () => {
		expect(await recipeLabelsModule.setRecipeLabelsBatch(U, [], 'llm')).toEqual([]);
	});
});

describe('food label writes share the same rules', () => {
	test('setFoodLabels: not_found, conflict and ok', async () => {
		queueResults([[]]);
		expect(await foodLabelsModule.setFoodLabels(U, F, ['banana'], 'llm')).toEqual({
			status: 'not_found'
		});
		queueResults([[{ id: F }], []]);
		expect(await foodLabelsModule.setFoodLabels(U, F, ['banana'], 'user')).toEqual({
			status: 'conflict'
		});
		queueResults([[{ id: F }], [], [], []]);
		expect(await foodLabelsModule.setFoodLabels(U, F, ['Bananas'], 'llm')).toEqual({
			status: 'ok',
			labels: ['banana'],
			dropped: []
		});
	});

	test('setFoodLabelsBatch keys results by foodId', async () => {
		queueResults([[{ id: F }], [], [], []]);
		const results = await foodLabelsModule.setFoodLabelsBatch(
			U,
			[
				{ foodId: F, labels: ['banana'] },
				{ foodId: '00000000-0000-4000-8000-000000000000', labels: ['ghost'] }
			],
			'llm'
		);
		expect(results).toEqual([
			{ foodId: F, ok: true, labels: ['banana'] },
			{
				foodId: '00000000-0000-4000-8000-000000000000',
				ok: false,
				error: 'Food not found'
			}
		]);
	});

	test('getFoodLabels returns the rows', async () => {
		const rows = [{ label: 'banana', source: 'user', confidence: null, createdAt: null }];
		setResult(rows);
		expect(await foodLabelsModule.getFoodLabels(U, F)).toEqual(rows);
	});

	test('seedCatalogLabels is a no-op without usable tags or after a user edit', async () => {
		expect(await foodLabelsModule.seedCatalogLabels(db as never, U, F, [])).toEqual([]);
		queueResults([[{ id: 'row' }]]);
		expect(await foodLabelsModule.seedCatalogLabels(db as never, U, F, ['en:bananas'])).toEqual([]);
	});

	test('seedCatalogLabels adds labels the food did not have', async () => {
		queueResults([[], [], [], [], []]);
		expect(
			await foodLabelsModule.seedCatalogLabels(db as never, U, F, ['en:fruits', 'en:bananas'])
		).toEqual(['fruit', 'banana']);
	});
});

describe('listLabelStats', () => {
	test('merges food and recipe counts, most common first', async () => {
		queueResults([
			[
				{ label: 'oat', count: 1 },
				{ label: 'grain', count: 1 }
			],
			[
				{ label: 'oat', count: 2 },
				{ label: 'soup', count: 1 }
			]
		]);
		expect(await foodLabelsModule.listLabelStats(U)).toEqual([
			{ label: 'oat', count: 3, foodCount: 1, recipeCount: 2 },
			{ label: 'grain', count: 1, foodCount: 1, recipeCount: 0 },
			{ label: 'soup', count: 1, foodCount: 0, recipeCount: 1 }
		]);
	});

	test('a kind filter joins foods, and supplements leave recipes out', async () => {
		queueResults([[{ label: 'oat', count: 1 }], [{ label: 'soup', count: 1 }]]);
		expect(await foodLabelsModule.listLabelStats(U, { kind: 'food' })).toHaveLength(2);
		queueResults([[{ label: 'zinc', count: 1 }]]);
		expect(await foodLabelsModule.listLabelStats(U, { kind: 'supplement' })).toEqual([
			{ label: 'zinc', count: 1, foodCount: 1, recipeCount: 0 }
		]);
	});
});

describe('listRecipes label options', () => {
	test('accepts a query, a label threshold and paging', async () => {
		queueResults([[{ id: R, name: 'Soup', labels: ['soup'] }], [{ total: 1 }]]);
		const result = await listRecipes(U, { query: '50%_soup', minLabels: 2, limit: 5, offset: 10 });
		expect(result.items).toEqual([{ id: R, name: 'Soup', labels: ['soup'] }]);
		expect(result.total).toBe(1);
	});

	test('a query that cannot be a label still matches by name', async () => {
		queueResults([[], [{ total: 0 }]]);
		expect((await listRecipes(U, { query: '%%' })).total).toBe(0);
	});
});

describe('listRecipeIngredientNames', () => {
	test('groups ingredient names by recipe', async () => {
		setResult([
			{ recipeId: R, name: 'Oats' },
			{ recipeId: R, name: 'Milk' }
		]);
		const names = await listRecipeIngredientNames(U, [R]);
		expect(names.get(R)).toEqual(['Oats', 'Milk']);
	});

	test('an empty id list makes no query', async () => {
		expect((await listRecipeIngredientNames(U, [])).size).toBe(0);
	});
});
