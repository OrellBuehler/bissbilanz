import { describe, test, expect, beforeEach, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { createMockDB } from '../helpers/mock-db';
import { TEST_USER } from '../helpers/fixtures';
import { servingUnitValues, unitConversionFactor } from '$lib/units';

const { db, setResult, reset } = createMockDB();
const schema = await import('$lib/server/schema');

vi.mock('$lib/server/db', () => ({
	getDB: () => db,
	...Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value]))
}));

const { macroAggregations } = await import('$lib/server/recipes');
const { buildRecipeMacrosCte, convertedIngredientQuantitySql } =
	await import('$lib/server/recipe-macros');
const { listFavoriteRecipes } = await import('$lib/server/favorites');

const dialect = new PgDialect();
const render = (fragment: Parameters<PgDialect['sqlToQuery']>[0]) =>
	dialect.sqlToQuery(fragment).sql.replace(/\s+/g, ' ');

beforeEach(() => reset());

describe('recipe macro semantics: API totals are whole-recipe, entry-embedded are per-serving', () => {
	test('macroAggregations (recipes API, favorites) sum ingredients without dividing by totalServings', () => {
		for (const key of ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const) {
			const sql = render(macroAggregations[key]);
			expect(sql, key).toContain('SUM(');
			expect(sql, key).not.toContain('total_servings');
		}
	});

	test('f4b33479 the aggregations include fiber', () => {
		expect(Object.keys(macroAggregations).sort()).toEqual(
			['calories', 'carbs', 'fat', 'fiber', 'protein'].sort()
		);
	});

	test('buildRecipeMacrosCte (entry-embedded recipes) divides by totalServings', () => {
		const realDb = drizzle.mock();
		const cte = buildRecipeMacrosCte(realDb as never, TEST_USER.id);
		const { sql } = realDb.with(cte).select().from(cte).toSQL();
		for (const alias of ['rm_calories', 'rm_protein', 'rm_carbs', 'rm_fat', 'rm_fiber']) {
			expect(sql, alias).toContain(`/ NULLIF("recipes"."total_servings", 0) as "${alias}"`);
		}
	});
});

describe('02a09643 favorite recipes return the same whole-recipe totals as /api/recipes', () => {
	test('listFavoriteRecipes passes the aggregated macros through undivided and marks isFavorite', async () => {
		setResult([
			{
				id: '10000000-0000-4000-8000-000000000020',
				name: 'Porridge',
				imageUrl: null,
				cookedWeight: null,
				totalServings: 4,
				logCount: '3',
				calories: '800',
				protein: '40',
				carbs: '120',
				fat: '20',
				fiber: '16'
			}
		]);
		const [recipe] = await listFavoriteRecipes(TEST_USER.id);
		expect(recipe).toMatchObject({
			totalServings: 4,
			calories: 800,
			protein: 40,
			carbs: 120,
			fat: 20,
			fiber: 16,
			logCount: 3,
			type: 'recipe'
		});
	});

	test('1fd5d280 favorite recipes always report isFavorite: true', async () => {
		setResult([
			{
				id: '10000000-0000-4000-8000-000000000020',
				name: 'Porridge',
				imageUrl: null,
				cookedWeight: null,
				totalServings: 1,
				logCount: 0,
				calories: 1,
				protein: 1,
				carbs: 1,
				fat: 1,
				fiber: 1
			}
		]);
		const [recipe] = await listFavoriteRecipes(TEST_USER.id);
		expect(recipe.isFavorite).toBe(true);
	});
});

describe('2225c398 ingredient unit conversion in SQL mirrors $lib/units', () => {
	test('every unit factor in the CASE expression equals UNIT_BASE', () => {
		const sql = render(convertedIngredientQuantitySql);
		const matches = [...sql.matchAll(/WHEN '(\w+)' THEN ([\d.]+)/g)];
		const fromSql = Object.fromEntries(matches.map((m) => [m[1], Number(m[2])]));
		const expected = Object.fromEntries(
			servingUnitValues.map((unit) => [
				unit,
				unitConversionFactor(unit, unitConversionFactor(unit, 'g') === null ? 'ml' : 'g')
			])
		);
		expect(fromSql).toEqual(expected);
	});

	test('mass/volume mismatches fall back to the raw quantity', () => {
		const sql = render(convertedIngredientQuantitySql);
		expect(sql).toMatch(/ELSE "recipe_ingredients"\."quantity" END/);
	});
});
