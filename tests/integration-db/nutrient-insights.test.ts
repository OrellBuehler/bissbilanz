import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
	createTestDatabase,
	dropTestDatabase,
	runTestMigrations,
	getTestDB,
	closeTestDB
} from './helpers';
import {
	users,
	userPreferences,
	foods,
	foodEntries,
	recipes,
	recipeIngredients
} from '$lib/server/schema';

/**
 * The nutrient-insights queries build their select list and recipe CTE by looping over
 * RDA_VALUES, so a typo in an alias, a collision with recipe_macros, or a bad jsonb cast
 * only shows up against a real Postgres. Everything else about these tools is mocked.
 */

const DB_NAME = 'test_nutrient_insights';
let dbUrl: string;
let userId: string;

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

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(foodEntries);
	await db.delete(recipeIngredients);
	await db.delete(recipes);
	await db.delete(foods);
	await db.delete(userPreferences);
	await db.delete(users);
	const [user] = await db
		.insert(users)
		.values({ infomaniakSub: `nutrient-insights-${Date.now()}` })
		.returning();
	userId = user.id;
});

const insertFood = async (name: string, extra: Record<string, unknown> = {}) => {
	const db = getTestDB(dbUrl);
	const [food] = await db
		.insert(foods)
		.values({
			userId,
			name,
			servingSize: 100,
			servingUnit: 'g',
			calories: 100,
			protein: 5,
			carbs: 10,
			fat: 2,
			fiber: 3,
			...extra
		})
		.returning();
	return food;
};

describe('nutrient insight queries against real Postgres', () => {
	it('resolves every reference nutrient from a food, not just the eleven in analytics.ts', async () => {
		const { getRdaNutrientEntries, RDA_KEYS } = await import('$lib/server/nutrient-insights');
		const db = getTestDB(dbUrl);
		// Nutrients unreachable through the existing analytics SQL.
		const food = await insertFood('Liver', {
			vitaminB12: 70,
			calcium: 12,
			iron: 6.5,
			magnesium: 18,
			zinc: 4,
			selenium: 39,
			iodine: 14,
			molybdenum: 8
		});
		await db.insert(foodEntries).values({
			userId,
			foodId: food.id,
			date: '2026-02-01',
			mealType: 'Dinner',
			servings: 2
		});

		const entries = await getRdaNutrientEntries(userId, '2026-02-01', '2026-02-01');
		expect(entries).toHaveLength(1);
		// Amounts are per serving, so two servings doubles them.
		expect(entries[0].nutrients.vitaminB12).toBeCloseTo(140, 4);
		expect(entries[0].nutrients.iron).toBeCloseTo(13, 4);
		expect(entries[0].nutrients.molybdenum).toBeCloseTo(16, 4);
		expect(entries[0].calories).toBeCloseTo(200, 4);
		// Every reference nutrient is present as a key, null where the food had none.
		expect(Object.keys(entries[0].nutrients).sort()).toEqual([...RDA_KEYS].sort());
		expect(entries[0].nutrients.chromium).toBeNull();
	});

	it('resolves nutrients through a recipe without colliding with the recipe_macros CTE', async () => {
		const { getRdaNutrientEntries } = await import('$lib/server/nutrient-insights');
		const db = getTestDB(dbUrl);
		const spinach = await insertFood('Spinach', { iron: 2.7, vitaminK: 480 });
		const [recipe] = await db
			.insert(recipes)
			.values({ userId, name: 'Spinach bowl', totalServings: 2 })
			.returning();
		await db.insert(recipeIngredients).values({
			recipeId: recipe.id,
			foodId: spinach.id,
			quantity: 200,
			servingUnit: 'g',
			sortOrder: 0
		});
		await db.insert(foodEntries).values({
			userId,
			recipeId: recipe.id,
			date: '2026-02-02',
			mealType: 'Lunch',
			servings: 1
		});

		const entries = await getRdaNutrientEntries(userId, '2026-02-02', '2026-02-02');
		// 200 g of a 100 g-serving food = 2 servings, split over 2 recipe servings = 1 each.
		expect(entries[0].nutrients.iron).toBeCloseTo(2.7, 4);
		expect(entries[0].nutrients.vitaminK).toBeCloseTo(480, 4);
		expect(entries[0].calories).toBeCloseTo(100, 4);
		expect(entries[0].foodName).toBe('Spinach bowl');
	});

	it('falls back to quick_nutrients for a quick-logged entry', async () => {
		const { getRdaNutrientEntries } = await import('$lib/server/nutrient-insights');
		const db = getTestDB(dbUrl);
		await db.insert(foodEntries).values({
			userId,
			date: '2026-02-03',
			mealType: 'Snacks',
			servings: 2,
			quickName: 'Brazil nuts',
			quickCalories: 90,
			quickFiber: 1,
			quickNutrients: { selenium: 96, magnesium: 25 }
		});

		const entries = await getRdaNutrientEntries(userId, '2026-02-03', '2026-02-03');
		expect(entries[0].nutrients.selenium).toBeCloseTo(192, 4);
		expect(entries[0].nutrients.magnesium).toBeCloseTo(50, 4);
		expect(entries[0].nutrients.fiber).toBeCloseTo(2, 4);
		expect(entries[0].nutrients.iron).toBeNull();
	});

	it('produces a gap report whose unmeasured nutrients are reported, not dropped', async () => {
		const { getRdaNutrientEntries } = await import('$lib/server/nutrient-insights');
		const { buildNutrientGapReport } = await import('$lib/server/nutrient-gaps');
		const db = getTestDB(dbUrl);
		const food = await insertFood('Orange', { vitaminC: 53 });
		await db.insert(foodEntries).values({
			userId,
			foodId: food.id,
			date: '2026-02-04',
			mealType: 'Breakfast',
			servings: 1
		});

		const entries = await getRdaNutrientEntries(userId, '2026-02-04', '2026-02-04');
		const report = buildNutrientGapReport({
			entries,
			sex: 'male',
			goals: null,
			minCoverage: 0.7,
			topContributors: 3,
			window: { startDate: '2026-02-04', endDate: '2026-02-04' }
		});

		const vitaminC = report.nutrients.find((row) => row.key === 'vitaminC');
		expect(vitaminC?.avgIntake).toBeCloseTo(53, 4);
		expect(vitaminC?.verdict).toBe('likely_inadequate');
		expect(vitaminC?.topContributors[0].name).toBe('Orange');
		expect(report.unmeasured.some((row) => row.key === 'calcium')).toBe(true);
	});

	it('ranks candidate sources for a gap from real rows', async () => {
		const { getNutrientCandidates } = await import('$lib/server/nutrient-insights');
		const { scoreNutrientCandidates } = await import('$lib/server/nutrient-scoring');
		await insertFood('Lentils', { iron: 3.3 });
		await insertFood('Beef liver', { iron: 6.5 });
		await insertFood('Water', {});

		const candidates = await getNutrientCandidates(userId, { keys: ['iron'] });
		// Only foods carrying iron are gathered.
		expect(candidates.map((c) => c.name).sort()).toEqual(['Beef liver', 'Lentils']);

		const ranked = scoreNutrientCandidates(
			candidates,
			[{ key: 'iron', unit: 'mg', label: 'Iron', deficitPerDay: 8, target: 8, deficitFraction: 1 }],
			{ avgCalories: 2000, today: '2026-02-04' }
		);
		expect(ranked[0].name).toBe('Beef liver');
		expect(ranked[0].perNutrient[0].amountPerServing).toBeCloseTo(6.5, 4);
	});

	it('reads the biological sex preference', async () => {
		const { getBiologicalSex } = await import('$lib/server/nutrient-insights');
		const db = getTestDB(dbUrl);
		expect(await getBiologicalSex(userId)).toBeNull();
		await db.insert(userPreferences).values({ userId, biologicalSex: 'female' });
		expect(await getBiologicalSex(userId)).toBe('female');
	});
});
