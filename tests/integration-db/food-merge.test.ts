import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
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
	foodEntries,
	recipes,
	recipeIngredients,
	foodLabels,
	supplements,
	supplementIngredients
} from '$lib/server/schema';

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

	await db.delete(supplementIngredients);
	await db.delete(supplements);
	await db.delete(foodLabels);
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

	it('unions food_labels from source onto keeper, skipping labels the keeper already has', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(foodLabels).values([
			{ foodId: keeperId, userId, label: 'yogurt', source: 'user' },
			{ foodId: sourceId, userId, label: 'yogurt', source: 'llm', confidence: 0.9 },
			{ foodId: sourceId, userId, label: 'dairy', source: 'catalog', confidence: 0.8 }
		]);

		const { mergeFoods } = await import('$lib/server/food-merge');
		const result = await mergeFoods(userId, { keeperId, sourceIds: [sourceId] });
		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.labels).toEqual(expect.arrayContaining(['yogurt', 'dairy']));

		const labels = await db.select().from(foodLabels).where(eq(foodLabels.foodId, keeperId));
		expect(labels).toHaveLength(2);
		// The keeper's own 'yogurt' row wins — source's duplicate label is dropped,
		// not overwritten (still 'user' sourced, not 'llm').
		const yogurt = labels.find((l) => l.label === 'yogurt');
		expect(yogurt?.source).toBe('user');
		const dairy = labels.find((l) => l.label === 'dairy');
		expect(dairy?.source).toBe('catalog');

		// Source's labels are gone (cascade-deleted with the source food row).
		const sourceLabels = await db.select().from(foodLabels).where(eq(foodLabels.foodId, sourceId));
		expect(sourceLabels).toHaveLength(0);
	});

	it('re-points supplement_ingredients from source to keeper without violating the FK restrict, rescaling servings', async () => {
		const db = getTestDB(dbUrl);

		// Two duplicate supplement-backing foods with different serving sizes.
		const [keeperBacking] = await db
			.insert(foods)
			.values({
				userId,
				name: 'Vitamin D 1000 IU',
				kind: 'supplement',
				servingSize: 1,
				servingUnit: 'g',
				calories: 0,
				protein: 0,
				carbs: 0,
				fat: 0,
				fiber: 0,
				vitaminD: 25
			})
			.returning();

		const [sourceBacking] = await db
			.insert(foods)
			.values({
				userId,
				name: 'Vitamin D3 1000 IU (dup)',
				kind: 'supplement',
				servingSize: 2,
				servingUnit: 'g',
				calories: 0,
				protein: 0,
				carbs: 0,
				fat: 0,
				fiber: 0,
				vitaminD: 50
			})
			.returning();

		const [supplement] = await db
			.insert(supplements)
			.values({ userId, name: 'Vitamin D', scheduleType: 'daily' })
			.returning();

		const [ingredient] = await db
			.insert(supplementIngredients)
			.values({
				supplementId: supplement.id,
				foodId: sourceBacking.id,
				servings: 1,
				sortOrder: 0
			})
			.returning();

		const { mergeFoods } = await import('$lib/server/food-merge');
		// Without the fix, this throws a foreign key violation (foodId onDelete: 'restrict').
		const result = await mergeFoods(userId, {
			keeperId: keeperBacking.id,
			sourceIds: [sourceBacking.id]
		});
		expect(result.success).toBe(true);

		const [updated] = await db
			.select()
			.from(supplementIngredients)
			.where(eq(supplementIngredients.id, ingredient.id));
		expect(updated.foodId).toBe(keeperBacking.id);
		// factor = source.servingSize / keeper.servingSize = 2/1 = 2 → 1 * 2 = 2,
		// i.e. still 2 g against the keeper's 1 g serving — nutrients unchanged.
		expect(updated.servings).toBeCloseTo(2, 5);

		const remainingBackingFoods = await db
			.select()
			.from(foods)
			.where(eq(foods.id, sourceBacking.id));
		expect(remainingBackingFoods).toHaveLength(0);
	});

	describe('unit-aware rescaling', () => {
		const insertFood = async (
			name: string,
			servingSize: number,
			servingUnit: 'g' | 'kg' | 'ml' | 'l'
		) => {
			const db = getTestDB(dbUrl);
			const [row] = await db
				.insert(foods)
				.values({
					userId,
					name,
					servingSize,
					servingUnit,
					calories: 100,
					protein: 0,
					carbs: 0,
					fat: 0,
					fiber: 0
				})
				.returning();
			return row;
		};

		const logEntry = async (foodId: string, servings: number) => {
			const db = getTestDB(dbUrl);
			const [entry] = await db
				.insert(foodEntries)
				.values({ userId, foodId, date: '2026-04-21', mealType: 'lunch', servings })
				.returning();
			return entry;
		};

		const merge = async (keeper: string, source: string) => {
			const { mergeFoods } = await import('$lib/server/food-merge');
			const result = await mergeFoods(userId, { keeperId: keeper, sourceIds: [source] });
			expect(result.success).toBe(true);
		};

		const servingsOf = async (id: string) => {
			const db = getTestDB(dbUrl);
			const [row] = await db.select().from(foodEntries).where(eq(foodEntries.id, id));
			return row.servings;
		};

		it('converts kg to g (1 kg source into 100 g keeper)', async () => {
			const source = await insertFood('Flour 1kg', 1, 'kg');
			const entry = await logEntry(source.id, 0.5);
			await merge(keeperId, source.id);
			// 0.5 kg = 500 g = 5 servings of the 100 g keeper.
			expect(await servingsOf(entry.id)).toBeCloseTo(5, 5);
		});

		it('converts g to kg (100 g source into 1 kg keeper)', async () => {
			const db = getTestDB(dbUrl);
			const kgKeeper = await insertFood('Flour 1kg', 1, 'kg');
			const entry = await logEntry(sourceId, 3);
			await merge(kgKeeper.id, sourceId);
			// 300 g = 0.3 servings of the 1 kg keeper.
			expect(await servingsOf(entry.id)).toBeCloseTo(0.3, 5);
			const rows = await db.select().from(foodEntries).where(eq(foodEntries.id, entry.id));
			expect(rows[0].foodId).toBe(kgKeeper.id);
		});

		it('converts l to ml (1 l source into 330 ml keeper)', async () => {
			const mlKeeper = await insertFood('Cola 330ml', 330, 'ml');
			const source = await insertFood('Cola 1l', 1, 'l');
			const entry = await logEntry(source.id, 2);
			await merge(mlKeeper.id, source.id);
			// 2 l = 2000 ml = 2000/330 servings.
			expect(await servingsOf(entry.id)).toBeCloseTo(2000 / 330, 5);
		});

		it('leaves same-unit merges on the plain size ratio', async () => {
			const source = await insertFood('Yogurt 250g', 250, 'g');
			const entry = await logEntry(source.id, 2);
			await merge(keeperId, source.id);
			expect(await servingsOf(entry.id)).toBeCloseTo(5, 5);
		});

		it('falls back to the size ratio across mass and volume', async () => {
			const source = await insertFood('Milk 200ml', 200, 'ml');
			const entry = await logEntry(source.id, 1);
			await merge(keeperId, source.id);
			expect(await servingsOf(entry.id)).toBeCloseTo(2, 5);
		});

		it('rescales supplement ingredients across units', async () => {
			const db = getTestDB(dbUrl);
			const source = await insertFood('Powder 1kg', 1, 'kg');
			const [supplement] = await db
				.insert(supplements)
				.values({ userId, name: 'Powder', scheduleType: 'daily' })
				.returning();
			const [ingredient] = await db
				.insert(supplementIngredients)
				.values({ supplementId: supplement.id, foodId: source.id, servings: 0.01, sortOrder: 0 })
				.returning();
			await merge(keeperId, source.id);
			const [updated] = await db
				.select()
				.from(supplementIngredients)
				.where(eq(supplementIngredients.id, ingredient.id));
			// 0.01 kg = 10 g = 0.1 servings of the 100 g keeper.
			expect(updated.foodId).toBe(keeperId);
			expect(updated.servings).toBeCloseTo(0.1, 5);
		});

		it('leaves recipe ingredient quantity and unit untouched when units are convertible', async () => {
			const db = getTestDB(dbUrl);
			const source = await insertFood('Flour 1kg', 1, 'kg');
			const [ingredient] = await db
				.insert(recipeIngredients)
				.values({ recipeId, foodId: source.id, quantity: 250, servingUnit: 'g', sortOrder: 1 })
				.returning();
			await merge(keeperId, source.id);
			const [updated] = await db
				.select()
				.from(recipeIngredients)
				.where(eq(recipeIngredients.id, ingredient.id));
			expect(updated.foodId).toBe(keeperId);
			expect(updated.quantity).toBe(250);
			expect(updated.servingUnit).toBe('g');
		});

		it('re-expresses recipe ingredients in the keeper unit across mass and volume', async () => {
			const db = getTestDB(dbUrl);
			const source = await insertFood('Milk 250ml', 250, 'ml');
			const [ingredient] = await db
				.insert(recipeIngredients)
				.values({ recipeId, foodId: source.id, quantity: 500, servingUnit: 'ml', sortOrder: 1 })
				.returning();
			await merge(keeperId, source.id);
			const [updated] = await db
				.select()
				.from(recipeIngredients)
				.where(eq(recipeIngredients.id, ingredient.id));
			// 500 ml = 2 servings of the source = 200 g of the 100 g keeper.
			expect(updated.foodId).toBe(keeperId);
			expect(updated.quantity).toBeCloseTo(200, 5);
			expect(updated.servingUnit).toBe('g');
		});
	});
});
