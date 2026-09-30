import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
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
	userPreferences,
	userGoals
} from '$lib/server/schema';

const DB_NAME = 'test_entries_daily_totals';
let dbUrl: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);

	const db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', async () => ({
		...(await import('$lib/server/schema')),
		getDB: () => db
	}));
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

let userId: string;
let otherUserId: string;
let oatsId: string;
let milkId: string;
let bananaId: string;

const mkUser = async (label: string) => {
	const db = getTestDB(dbUrl);
	const [user] = await db
		.insert(users)
		.values({ infomaniakSub: `entries-totals-${label}-${Date.now()}-${Math.random()}` })
		.returning();
	return user.id;
};

const mkFood = async (
	uid: string,
	values: Partial<typeof foods.$inferInsert> & { name: string }
) => {
	const db = getTestDB(dbUrl);
	const [food] = await db
		.insert(foods)
		.values({
			userId: uid,
			servingSize: 100,
			servingUnit: 'g',
			calories: 0,
			protein: 0,
			carbs: 0,
			fat: 0,
			fiber: 0,
			...values
		})
		.returning();
	return food.id;
};

beforeEach(async () => {
	const db = getTestDB(dbUrl);
	await db.delete(foodEntries);
	await db.delete(recipeIngredients);
	await db.delete(recipes);
	await db.delete(foods);
	await db.delete(userGoals);
	await db.delete(userPreferences);
	await db.delete(users);

	userId = await mkUser('a');
	otherUserId = await mkUser('b');

	oatsId = await mkFood(userId, {
		name: 'Oats',
		calories: 380,
		protein: 13,
		carbs: 67,
		fat: 7,
		fiber: 10,
		sodium: 20,
		omega3: 0.5
	});
	milkId = await mkFood(userId, {
		name: 'Milk',
		servingUnit: 'ml',
		calories: 64,
		protein: 3.4,
		carbs: 4.8,
		fat: 3.6,
		fiber: 0,
		sodium: 44
	});
	bananaId = await mkFood(userId, {
		name: 'Banana',
		servingSize: 120,
		calories: 107,
		protein: 1.3,
		carbs: 27,
		fat: 0.4,
		fiber: 3.1
	});
});

afterEach(() => {
	vi.useRealTimers();
});

const status = async (date: string, uid = userId) => {
	const { handleGetDailyStatus } = await import('$lib/server/mcp/handlers');
	const result = await handleGetDailyStatus(uid, date, true);
	if (!result) throw new Error('no status');
	return result as {
		totals: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
		byMeal: Record<string, { calories: number; protein: number }>;
		entryCount: number;
		entries: { id: string; calories: number | null; foodName: string | null }[];
		date: string;
	};
};

const log = async (payload: Record<string, unknown>, uid = userId) => {
	const { createEntry } = await import('$lib/server/entries');
	const result = await createEntry(uid, payload);
	if (!result.success) throw result.error;
	return result.data;
};

const porridge = async (totalServings = 2) => {
	const { createRecipe } = await import('$lib/server/recipes');
	const result = await createRecipe(userId, {
		name: 'Porridge',
		totalServings,
		ingredients: [
			{ foodId: oatsId, quantity: 50, servingUnit: 'g' },
			{ foodId: milkId, quantity: 250, servingUnit: 'ml' }
		]
	});
	if (!result.success) throw result.error;
	return result.data.id;
};

describe('daily totals across meals', () => {
	it('sums calories/protein/carbs/fat/fiber per day and per meal, with fractional servings', async () => {
		await log({ foodId: oatsId, mealType: 'Breakfast', servings: 0.5, date: '2026-06-10' });
		await log({ foodId: bananaId, mealType: 'Breakfast', servings: 2, date: '2026-06-10' });
		await log({ foodId: milkId, mealType: 'Lunch', servings: 1.5, date: '2026-06-10' });
		await log({ foodId: oatsId, mealType: 'Snacks', servings: 0.25, date: '2026-06-10' });

		const s = await status('2026-06-10');
		expect(s.entryCount).toBe(4);
		expect(s.totals.calories).toBeCloseTo(380 * 0.75 + 107 * 2 + 64 * 1.5, 0);
		expect(s.totals.protein).toBeCloseTo(13 * 0.75 + 1.3 * 2 + 3.4 * 1.5, 0);
		expect(s.totals.carbs).toBeCloseTo(67 * 0.75 + 27 * 2 + 4.8 * 1.5, 0);
		expect(s.totals.fat).toBeCloseTo(7 * 0.75 + 0.4 * 2 + 3.6 * 1.5, 0);
		expect(s.totals.fiber).toBeCloseTo(10 * 0.75 + 3.1 * 2, 0);

		expect(s.byMeal.Breakfast.calories).toBeCloseTo(190 + 214, 0);
		expect(s.byMeal.Lunch.calories).toBeCloseTo(96, 0);
		expect(s.byMeal.Snacks.calories).toBeCloseTo(95, 0);
	});

	it('normalizes lowercase meal types and rejects unknown ones without writing', async () => {
		const { createEntry } = await import('$lib/server/entries');
		const entry = await log({
			foodId: oatsId,
			mealType: 'breakfast',
			servings: 1,
			date: '2026-06-10'
		});
		expect(entry.mealType).toBe('Breakfast');

		const bad = await createEntry(userId, {
			foodId: oatsId,
			mealType: 'Brunch',
			servings: 1,
			date: '2026-06-10'
		});
		expect(bad.success).toBe(false);
		expect((await status('2026-06-10')).entryCount).toBe(1);
	});

	it('keeps days separate', async () => {
		await log({ foodId: oatsId, mealType: 'Breakfast', servings: 1, date: '2026-06-10' });
		await log({ foodId: oatsId, mealType: 'Breakfast', servings: 2, date: '2026-06-11' });

		expect((await status('2026-06-10')).totals.calories).toBeCloseTo(380, 0);
		expect((await status('2026-06-11')).totals.calories).toBeCloseTo(760, 0);
		expect((await status('2026-06-12')).totals.calories).toBe(0);
	});

	it('does not mix users, even when logging the same food id (write-side guard) or the same date', async () => {
		const otherFood = await mkFood(otherUserId, { name: 'Rice', calories: 130, protein: 2.7 });
		await log({ foodId: oatsId, mealType: 'Lunch', servings: 1, date: '2026-06-10' });
		await log(
			{ foodId: otherFood, mealType: 'Lunch', servings: 3, date: '2026-06-10' },
			otherUserId
		);

		const { createEntry } = await import('$lib/server/entries');
		const cross = await createEntry(otherUserId, {
			foodId: oatsId,
			mealType: 'Lunch',
			servings: 1,
			date: '2026-06-10'
		});
		expect(cross.success).toBe(false);

		const mine = await status('2026-06-10');
		const theirs = await status('2026-06-10', otherUserId);
		expect(mine.totals.calories).toBeCloseTo(380, 0);
		expect(theirs.totals.calories).toBeCloseTo(390, 0);
		expect(mine.entryCount).toBe(1);
		expect(theirs.entryCount).toBe(1);
	});

	it('returns goal progress when goals exist', async () => {
		const db = getTestDB(dbUrl);
		await db.insert(userGoals).values({
			userId,
			calorieGoal: 2000,
			proteinGoal: 100,
			carbGoal: 250,
			fatGoal: 70,
			fiberGoal: 30
		});
		await log({ foodId: oatsId, mealType: 'Breakfast', servings: 1, date: '2026-06-10' });
		const s = (await status('2026-06-10')) as unknown as {
			progress: { calories: number; protein: number };
		};
		expect(s.progress.calories).toBe(19);
		expect(s.progress.protein).toBe(13);
	});
});

describe('quick entries', () => {
	it('uses the quick macros verbatim and multiplies by servings', async () => {
		await log({
			quickName: 'Restaurant pasta',
			quickCalories: 700,
			quickProtein: 25,
			quickCarbs: 90,
			quickFat: 20,
			quickFiber: 5,
			mealType: 'Dinner',
			servings: 1.5,
			date: '2026-06-10'
		});
		const s = await status('2026-06-10');
		expect(s.entries[0].foodName).toBe('Restaurant pasta');
		expect(s.totals.calories).toBeCloseTo(1050, 0);
		expect(s.totals.protein).toBeCloseTo(37.5, 0);
		expect(s.totals.carbs).toBeCloseTo(135, 0);
		expect(s.totals.fat).toBeCloseTo(30, 0);
		expect(s.totals.fiber).toBeCloseTo(7.5, 0);
	});

	it('rejects a quick entry with zero calories and no food/recipe', async () => {
		const { createEntry } = await import('$lib/server/entries');
		const result = await createEntry(userId, {
			quickName: 'Water',
			quickCalories: 0,
			mealType: 'Snacks',
			servings: 1,
			date: '2026-06-10'
		});
		expect(result.success).toBe(false);
	});

	it('quick macros feed extended-nutrient totals via quickNutrients', async () => {
		await log({
			quickName: 'Salty snack',
			quickCalories: 200,
			quickNutrients: { sodium: 300 },
			mealType: 'Snacks',
			servings: 2,
			date: '2026-06-10'
		});
		const { getDailyNutrientTotals } = await import('$lib/server/analytics');
		const rows = await getDailyNutrientTotals(userId, '2026-06-10', '2026-06-10');
		expect(rows).toHaveLength(1);
		expect(rows[0].sodium).toBeCloseTo(600, 0);
		expect(rows[0].calories).toBeCloseTo(400, 0);
	});
});

describe('recipe per-serving math', () => {
	it('entry-embedded recipe macros are per-serving; recipe API is whole-recipe', async () => {
		const recipeId = await porridge(2);
		const { getRecipe } = await import('$lib/server/recipes');
		const whole = await getRecipe(userId, recipeId);
		// oats 50g -> 190 kcal, milk 250ml -> 160 kcal
		expect(whole?.calories).toBeCloseTo(350, 1);
		expect(whole?.protein).toBeCloseTo(15, 1);

		await log({ recipeId, mealType: 'Breakfast', servings: 1, date: '2026-06-10' });
		const s = await status('2026-06-10');
		expect(s.totals.calories).toBeCloseTo(175, 1);
		expect(s.totals.protein).toBeCloseTo(7.5, 1);
		expect(s.totals.carbs).toBeCloseTo(22.75, 0);
		expect(s.totals.fat).toBeCloseTo(6.25, 0);
		expect(s.totals.fiber).toBeCloseTo(2.5, 1);
	});

	it('logging every serving equals the whole recipe; fractional servings scale linearly', async () => {
		const recipeId = await porridge(4);
		await log({ recipeId, mealType: 'Lunch', servings: 4, date: '2026-06-10' });
		await log({ recipeId, mealType: 'Dinner', servings: 0.5, date: '2026-06-11' });
		// per-serving calories are rounded to whole kcal (87.5 -> 88) before scaling
		expect(Math.abs((await status('2026-06-10')).totals.calories - 350)).toBeLessThanOrEqual(2);
		expect(Math.abs((await status('2026-06-11')).totals.calories - 350 / 8)).toBeLessThanOrEqual(1);
	});

	it('converts ingredient units (kg -> g) when computing recipe macros', async () => {
		const { createRecipe } = await import('$lib/server/recipes');
		const created = await createRecipe(userId, {
			name: 'Kilo of oats',
			totalServings: 10,
			ingredients: [{ foodId: oatsId, quantity: 1, servingUnit: 'kg' }]
		});
		if (!created.success) throw created.error;
		await log({
			recipeId: created.data.id,
			mealType: 'Breakfast',
			servings: 1,
			date: '2026-06-10'
		});
		// 1 kg = 10 servings of 100 g = 3800 kcal / 10 servings
		expect((await status('2026-06-10')).totals.calories).toBeCloseTo(380, 0);
	});

	it('recipe entries mixed with food entries add up', async () => {
		const recipeId = await porridge(2);
		await log({ recipeId, mealType: 'Breakfast', servings: 2, date: '2026-06-10' });
		await log({ foodId: bananaId, mealType: 'Breakfast', servings: 1, date: '2026-06-10' });
		const s = await status('2026-06-10');
		expect(s.totals.calories).toBeCloseTo(350 + 107, 0);
		expect(s.byMeal.Breakfast.calories).toBeCloseTo(457, 0);
	});

	it('extended nutrients roll up through recipes per serving', async () => {
		const recipeId = await porridge(2);
		await log({ recipeId, mealType: 'Breakfast', servings: 1, date: '2026-06-10' });
		const { getDailyNutrientTotals } = await import('$lib/server/analytics');
		const [row] = await getDailyNutrientTotals(userId, '2026-06-10', '2026-06-10');
		// oats 50g: sodium 10, omega3 0.25; milk 250ml: sodium 110; per serving /2
		expect(row.sodium).toBeCloseTo(60, 1);
		expect(row.omega3).toBeCloseTo(0.125, 2);
		expect(row.calories).toBeCloseTo(175, 1);
	});

	it('editing the recipe totalServings re-scales existing entries (macros are derived live)', async () => {
		const recipeId = await porridge(2);
		await log({ recipeId, mealType: 'Breakfast', servings: 1, date: '2026-06-10' });
		const db = getTestDB(dbUrl);
		await db.update(recipes).set({ totalServings: 5 }).where(eq(recipes.id, recipeId));
		expect((await status('2026-06-10')).totals.calories).toBeCloseTo(70, 1);
	});
});

describe('update and delete recompute totals', () => {
	it('changing servings, meal and food updates day and meal totals', async () => {
		const { updateEntry } = await import('$lib/server/entries');
		const entry = await log({
			foodId: oatsId,
			mealType: 'Breakfast',
			servings: 1,
			date: '2026-06-10'
		});

		const res = await updateEntry(userId, entry.id, { servings: 2.5, mealType: 'Dinner' });
		expect(res.success).toBe(true);
		let s = await status('2026-06-10');
		expect(s.totals.calories).toBeCloseTo(950, 0);
		expect(s.byMeal.Breakfast).toBeUndefined();
		expect(s.byMeal.Dinner.calories).toBeCloseTo(950, 0);

		await updateEntry(userId, entry.id, { foodId: bananaId });
		s = await status('2026-06-10');
		expect(Math.abs(s.totals.calories - 107 * 2.5)).toBeLessThanOrEqual(0.5);
	});

	it('moving an entry to another date moves its totals', async () => {
		const { updateEntry } = await import('$lib/server/entries');
		const entry = await log({ foodId: oatsId, mealType: 'Lunch', servings: 1, date: '2026-06-10' });
		await updateEntry(userId, entry.id, { date: '2026-06-12' });
		expect((await status('2026-06-10')).totals.calories).toBe(0);
		expect((await status('2026-06-12')).totals.calories).toBeCloseTo(380, 0);
	});

	it('a partial update keeps the note; explicit null clears it', async () => {
		const { updateEntry } = await import('$lib/server/entries');
		const entry = await log({
			foodId: oatsId,
			mealType: 'Lunch',
			servings: 1,
			date: '2026-06-10',
			notes: 'with honey'
		});
		const kept = await updateEntry(userId, entry.id, { servings: 2 });
		if (!kept.success) throw kept.error;
		expect(kept.data?.notes).toBe('with honey');
		const cleared = await updateEntry(userId, entry.id, { notes: null });
		if (!cleared.success) throw cleared.error;
		expect(cleared.data?.notes).toBeNull();
	});

	it('rejects non-positive servings and unknown meals on update, leaving the row untouched', async () => {
		const { updateEntry } = await import('$lib/server/entries');
		const entry = await log({ foodId: oatsId, mealType: 'Lunch', servings: 1, date: '2026-06-10' });
		expect((await updateEntry(userId, entry.id, { servings: 0 })).success).toBe(false);
		expect((await updateEntry(userId, entry.id, { mealType: 'Elevenses' })).success).toBe(false);
		expect((await status('2026-06-10')).totals.calories).toBeCloseTo(380, 0);
	});

	it('update/delete on another user’s entry is a no-op', async () => {
		const { updateEntry, deleteEntry } = await import('$lib/server/entries');
		const entry = await log({ foodId: oatsId, mealType: 'Lunch', servings: 1, date: '2026-06-10' });
		const upd = await updateEntry(otherUserId, entry.id, { servings: 9 });
		expect(upd.success).toBe(true);
		if (upd.success) expect(upd.data).toBeUndefined();
		expect(await deleteEntry(otherUserId, entry.id)).toBeNull();
		expect((await status('2026-06-10')).totals.calories).toBeCloseTo(380, 0);
	});

	it('delete removes the entry from totals and is idempotent', async () => {
		const { deleteEntry } = await import('$lib/server/entries');
		const a = await log({ foodId: oatsId, mealType: 'Lunch', servings: 1, date: '2026-06-10' });
		await log({ foodId: bananaId, mealType: 'Lunch', servings: 1, date: '2026-06-10' });

		expect(await deleteEntry(userId, a.id)).toEqual({ id: a.id, date: '2026-06-10' });
		expect((await status('2026-06-10')).totals.calories).toBeCloseTo(107, 0);
		expect(await deleteEntry(userId, a.id)).toBeNull();
		expect((await status('2026-06-10')).entryCount).toBe(1);
	});

	it('MCP update/delete handlers return the recomputed daily status', async () => {
		const { handleUpdateEntry, handleDeleteEntry } = await import('$lib/server/mcp/handlers');
		const entry = await log({ foodId: oatsId, mealType: 'Lunch', servings: 1, date: '2026-06-10' });
		const upd = (await handleUpdateEntry(userId, {
			entryId: entry.id,
			servings: 3
		})) as unknown as {
			dailyStatus: { totals: { calories: number } };
		};
		expect(upd.dailyStatus.totals.calories).toBeCloseTo(1140, 0);
		const del = (await handleDeleteEntry(userId, entry.id)) as unknown as {
			dailyStatus: { totals: { calories: number }; entryCount: number };
		};
		expect(del.dailyStatus.entryCount).toBe(0);
		expect(del.dailyStatus.totals.calories).toBe(0);
	});

	it('cannot delete a food that still has entries (restrict FK), totals stay intact', async () => {
		const db = getTestDB(dbUrl);
		await log({ foodId: oatsId, mealType: 'Lunch', servings: 1, date: '2026-06-10' });
		await expect(db.delete(foods).where(eq(foods.id, oatsId))).rejects.toThrow();
		expect((await status('2026-06-10')).totals.calories).toBeCloseTo(380, 0);
	});
});

describe('copying entries', () => {
	it('copyEntries duplicates every entry (foods, recipes, quick) onto the target day, preserving meals and servings', async () => {
		const { copyEntries } = await import('$lib/server/entries');
		const recipeId = await porridge(2);
		await log({
			foodId: oatsId,
			mealType: 'Breakfast',
			servings: 0.5,
			date: '2026-06-10',
			notes: 'n1'
		});
		await log({ recipeId, mealType: 'Lunch', servings: 1.5, date: '2026-06-10' });
		await log({
			quickName: 'Snack bar',
			quickCalories: 210,
			quickProtein: 4,
			quickNutrients: { sodium: 80 },
			mealType: 'Snacks',
			servings: 2,
			date: '2026-06-10'
		});
		await log({ foodId: bananaId, mealType: 'Dinner', servings: 1, date: '2026-06-09' });

		const copied = await copyEntries(userId, '2026-06-10', '2026-06-20');
		expect(copied).toHaveLength(3);
		expect(copied.every((c) => c.date === '2026-06-20')).toBe(true);

		const src = await status('2026-06-10');
		const dst = await status('2026-06-20');
		expect(dst.entryCount).toBe(3);
		expect(dst.totals).toEqual(src.totals);
		expect(dst.byMeal).toEqual(src.byMeal);
		// source day and unrelated days are untouched
		expect(src.entryCount).toBe(3);
		expect((await status('2026-06-09')).entryCount).toBe(1);

		const db = getTestDB(dbUrl);
		const rows = await db
			.select()
			.from(foodEntries)
			.where(and(eq(foodEntries.userId, userId), eq(foodEntries.date, '2026-06-20')));
		expect(rows.find((r) => r.foodId === oatsId)?.notes).toBe('n1');
		expect(rows.find((r) => r.quickName === 'Snack bar')?.quickNutrients).toEqual({ sodium: 80 });
		expect(new Set(rows.map((r) => r.id)).size).toBe(3);
	});

	it('copying an empty day is a no-op and copying twice doubles the target day', async () => {
		const { copyEntries } = await import('$lib/server/entries');
		expect(await copyEntries(userId, '2026-06-01', '2026-06-02')).toEqual([]);

		await log({ foodId: oatsId, mealType: 'Breakfast', servings: 1, date: '2026-06-10' });
		await copyEntries(userId, '2026-06-10', '2026-06-11');
		await copyEntries(userId, '2026-06-10', '2026-06-11');
		expect((await status('2026-06-11')).totals.calories).toBeCloseTo(760, 0);
	});

	it('copying a day onto itself doubles it', async () => {
		const { copyEntries } = await import('$lib/server/entries');
		await log({ foodId: oatsId, mealType: 'Breakfast', servings: 1, date: '2026-06-10' });
		await copyEntries(userId, '2026-06-10', '2026-06-10');
		expect((await status('2026-06-10')).entryCount).toBe(2);
	});

	it('copies keep the local time of day, across a DST change', async () => {
		const { copyEntries } = await import('$lib/server/entries');
		const db = getTestDB(dbUrl);
		await db.insert(userPreferences).values({ userId, timeZone: 'Europe/Zurich' });
		await log({
			foodId: oatsId,
			mealType: 'Breakfast',
			servings: 1,
			date: '2026-03-20',
			eatenAt: '2026-03-20T08:30:00+01:00'
		});
		await log({
			foodId: oatsId,
			mealType: 'Dinner',
			servings: 1,
			date: '2026-03-20',
			eatenAt: '2026-03-20T23:45:00+01:00'
		});

		const copied = await copyEntries(userId, '2026-03-20', '2026-04-02');
		const times = copied.map((c) => c.eatenAt.toISOString()).sort();
		expect(times).toEqual(['2026-04-02T06:30:00.000Z', '2026-04-02T21:45:00.000Z']);

		const back = await copyEntries(userId, '2026-04-02', '2026-03-05');
		expect(back.map((c) => c.eatenAt.toISOString()).sort()).toEqual([
			'2026-03-05T07:30:00.000Z',
			'2026-03-05T22:45:00.000Z'
		]);
	});

	it('never copies another user’s entries', async () => {
		const { copyEntries } = await import('$lib/server/entries');
		const otherFood = await mkFood(otherUserId, { name: 'Rice', calories: 130 });
		await log(
			{ foodId: otherFood, mealType: 'Lunch', servings: 1, date: '2026-06-10' },
			otherUserId
		);
		expect(await copyEntries(userId, '2026-06-10', '2026-06-11')).toEqual([]);
		expect((await status('2026-06-11')).entryCount).toBe(0);
	});

	it('copy route handler copies and reports the count', async () => {
		const { POST } = await import('../../src/routes/api/entries/copy/+server');
		await log({ foodId: oatsId, mealType: 'Breakfast', servings: 1, date: '2026-06-10' });
		const event = {
			locals: { user: { id: userId } },
			url: new URL('http://localhost/api/entries/copy?fromDate=2026-06-10&toDate=2026-06-15')
		} as unknown as RequestEvent;
		const res = await (POST as (e: RequestEvent) => Promise<Response>)(event);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { count: number; entries: unknown[] };
		expect(body.count).toBe(1);
		expect((await status('2026-06-15')).totals.calories).toBeCloseTo(380, 0);

		const bad = await (POST as (e: RequestEvent) => Promise<Response>)({
			locals: { user: { id: userId } },
			url: new URL('http://localhost/api/entries/copy?fromDate=nope&toDate=2026-06-15')
		} as unknown as RequestEvent);
		expect(bad.status).toBe(400);
	});

	it('MCP copy_entries defaults the target to the user’s local today and returns its status', async () => {
		const { handleCopyEntries } = await import('$lib/server/mcp/handlers');
		const db = getTestDB(dbUrl);
		await db.insert(userPreferences).values({ userId, timeZone: 'Pacific/Auckland' });
		await log({ foodId: oatsId, mealType: 'Breakfast', servings: 1, date: '2026-06-10' });

		// 2026-06-15 20:00Z is already 2026-06-16 08:00 in Auckland (NZST, UTC+12)
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-06-15T20:00:00Z'));
		const res = (await handleCopyEntries(userId, { fromDate: '2026-06-10' })) as unknown as {
			copiedCount: number;
			dailyStatus: { totals: { calories: number } };
		};
		vi.useRealTimers();

		expect(res.copiedCount).toBe(1);
		expect(res.dailyStatus.totals.calories).toBeCloseTo(380, 0);
		expect((await status('2026-06-16')).entryCount).toBe(1);
		expect((await status('2026-06-15')).entryCount).toBe(0);
	});
});

describe('entries API route handlers', () => {
	it('POST /api/entries then GET /api/entries?date= round-trips with per-serving recipe macros', async () => {
		const { POST, GET } = await import('../../src/routes/api/entries/+server');
		const recipeId = await porridge(2);
		const call = (h: unknown, event: Record<string, unknown>) =>
			(h as (e: RequestEvent) => Promise<Response>)({
				locals: { user: { id: userId } },
				...event
			} as unknown as RequestEvent);

		const created = await call(POST, {
			request: new Request('http://localhost/api/entries', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ recipeId, mealType: 'breakfast', servings: 2, date: '2026-06-10' })
			})
		});
		expect(created.status).toBe(201);

		const listed = await call(GET, {
			url: new URL('http://localhost/api/entries?date=2026-06-10')
		});
		expect(listed.status).toBe(200);
		const body = (await listed.json()) as {
			entries: { calories: number; servings: number; foodName: string }[];
			total: number;
		};
		expect(body.total).toBe(1);
		expect(body.entries[0].foodName).toBe('Porridge');
		expect(body.entries[0].calories).toBeCloseTo(175, 1);
		expect(body.entries[0].servings).toBe(2);

		const missing = await call(GET, { url: new URL('http://localhost/api/entries') });
		expect(missing.status).toBe(400);
		const badDate = await call(GET, { url: new URL('http://localhost/api/entries?date=06/10') });
		expect(badDate.status).toBe(400);
	});

	it('listEntriesByDate paginates without changing the total', async () => {
		const { listEntriesByDate } = await import('$lib/server/entries');
		for (let i = 0; i < 5; i++) {
			await log({ foodId: oatsId, mealType: 'Snacks', servings: 1, date: '2026-06-10' });
		}
		const page = await listEntriesByDate(userId, '2026-06-10', { limit: 2, offset: 4 });
		expect(page.items).toHaveLength(1);
		expect(page.total).toBe(5);
	});
});

describe('timezone day boundaries', () => {
	const setPreferredZone = async (timeZone: string) => {
		const db = getTestDB(dbUrl);
		await db.insert(userPreferences).values({ userId, timeZone });
	};

	// 'today' as seen by the server is derived from the stored zone, never the runtime zone.
	const todayCases: [string, string, string][] = [
		['Europe/Zurich', '2026-06-15T22:30:00Z', '2026-06-16'],
		['Europe/Zurich', '2026-06-15T21:59:59Z', '2026-06-15'],
		['America/Los_Angeles', '2026-06-16T06:59:59Z', '2026-06-15'],
		['America/Los_Angeles', '2026-06-16T07:00:00Z', '2026-06-16'],
		['Pacific/Auckland', '2026-06-15T11:59:59Z', '2026-06-15'],
		['Pacific/Auckland', '2026-06-15T12:00:00Z', '2026-06-16'],
		['UTC', '2026-06-15T23:59:59Z', '2026-06-15']
	];

	it.each(todayCases)(
		'%s at %s: today is %s (get_daily_status without a date)',
		async (zone, instant, expected) => {
			await setPreferredZone(zone);
			await log({ foodId: oatsId, mealType: 'Breakfast', servings: 1, date: expected });
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date(instant));
			const { handleGetDailyStatus } = await import('$lib/server/mcp/handlers');
			const res = (await handleGetDailyStatus(userId)) as unknown as {
				date: string;
				entryCount: number;
			};
			vi.useRealTimers();
			expect(res.date).toBe(expected);
			expect(res.entryCount).toBe(1);
		}
	);

	it('a user without stored preferences falls back to UTC', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-06-15T23:30:00Z'));
		const { handleGetDailyStatus } = await import('$lib/server/mcp/handlers');
		const res = (await handleGetDailyStatus(userId)) as unknown as { date: string };
		vi.useRealTimers();
		expect(res.date).toBe('2026-06-15');
	});

	it('an entry at 23:30 local files under the local day the client sends, not the UTC day', async () => {
		// 23:30 in LA on 2026-06-10 is 06:30Z on 2026-06-11.
		await log({
			foodId: oatsId,
			mealType: 'Snacks',
			servings: 1,
			date: '2026-06-10',
			eatenAt: '2026-06-10T23:30:00-07:00'
		});
		// 23:30 in Zurich on 2026-06-10 is 21:30Z the same UTC day.
		await log({
			foodId: bananaId,
			mealType: 'Snacks',
			servings: 1,
			date: '2026-06-10',
			eatenAt: '2026-06-10T23:30:00+02:00'
		});
		// 00:30 in Auckland on 2026-06-11 is 12:30Z on 2026-06-10.
		await log({
			foodId: milkId,
			mealType: 'Snacks',
			servings: 1,
			date: '2026-06-11',
			eatenAt: '2026-06-11T00:30:00+12:00'
		});

		expect((await status('2026-06-10')).entryCount).toBe(2);
		expect((await status('2026-06-11')).entryCount).toBe(1);

		const db = getTestDB(dbUrl);
		const rows = await db.select().from(foodEntries).where(eq(foodEntries.foodId, oatsId));
		expect(rows[0].eatenAt.toISOString()).toBe('2026-06-11T06:30:00.000Z');
		expect(rows[0].date).toBe('2026-06-10');
	});

	it('an entry logged with the current day right before local midnight does not roll over', async () => {
		await setPreferredZone('America/Los_Angeles');
		// 2026-06-11T06:30Z is 23:30 on 2026-06-10 in LA (UTC-7)
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-06-11T06:30:00Z'));
		const { todayInTimeZone } = await import('$lib/utils/dates');
		const { getUserTimeZone } = await import('$lib/server/preferences');
		const localToday = todayInTimeZone(await getUserTimeZone(userId));
		expect(localToday).toBe('2026-06-10');
		await log({ foodId: oatsId, mealType: 'Snacks', servings: 1, date: localToday });
		vi.useRealTimers();
		expect((await status('2026-06-10')).entryCount).toBe(1);
		expect((await status('2026-06-11')).entryCount).toBe(0);
	});

	describe('moving an entry to another date keeps its local clock time', () => {
		const updateEntryAtZone = async (
			zone: string,
			from: { date: string; eatenAt: string },
			toDate: string
		) => {
			const db = getTestDB(dbUrl);
			await db.insert(userPreferences).values({ userId, timeZone: zone });
			const created = await log({
				foodId: oatsId,
				mealType: 'Snacks',
				servings: 1,
				date: from.date,
				eatenAt: from.eatenAt
			});
			const { updateEntry } = await import('$lib/server/entries');
			const res = await updateEntry(userId, created.id, { date: toDate });
			if (!res.success || !res.data) throw new Error('update failed');
			return res.data;
		};

		const localTime = (iso: Date, zone: string) =>
			new Intl.DateTimeFormat('en-GB', {
				timeZone: zone,
				hour: '2-digit',
				minute: '2-digit',
				hour12: false
			}).format(iso);
		const localDate = (iso: Date, zone: string) =>
			new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(iso);

		it('Los Angeles across spring-forward (2026-03-08): 23:30 stays 23:30 on the new date', async () => {
			const updated = await updateEntryAtZone(
				'America/Los_Angeles',
				{ date: '2026-03-07', eatenAt: '2026-03-07T23:30:00-08:00' },
				'2026-03-09'
			);
			expect(updated.date).toBe('2026-03-09');
			expect(localTime(updated.eatenAt, 'America/Los_Angeles')).toBe('23:30');
			expect(localDate(updated.eatenAt, 'America/Los_Angeles')).toBe('2026-03-09');
			expect(updated.eatenAt.toISOString()).toBe('2026-03-10T06:30:00.000Z');
		});

		it('Zurich across fall-back (2026-10-25): 23:30 stays 23:30', async () => {
			const updated = await updateEntryAtZone(
				'Europe/Zurich',
				{ date: '2026-10-24', eatenAt: '2026-10-24T23:30:00+02:00' },
				'2026-10-26'
			);
			expect(localTime(updated.eatenAt, 'Europe/Zurich')).toBe('23:30');
			expect(localDate(updated.eatenAt, 'Europe/Zurich')).toBe('2026-10-26');
			expect(updated.eatenAt.toISOString()).toBe('2026-10-26T22:30:00.000Z');
		});

		it('Auckland across NZ spring-forward (2026-09-27): 00:30 stays 00:30', async () => {
			const updated = await updateEntryAtZone(
				'Pacific/Auckland',
				{ date: '2026-09-26', eatenAt: '2026-09-26T00:30:00+12:00' },
				'2026-09-28'
			);
			expect(localTime(updated.eatenAt, 'Pacific/Auckland')).toBe('00:30');
			expect(localDate(updated.eatenAt, 'Pacific/Auckland')).toBe('2026-09-28');
			expect(updated.eatenAt.toISOString()).toBe('2026-09-27T11:30:00.000Z');
		});

		it('an explicit eatenAt in the same update wins over the derived time', async () => {
			const db = getTestDB(dbUrl);
			await db.insert(userPreferences).values({ userId, timeZone: 'Europe/Zurich' });
			const created = await log({
				foodId: oatsId,
				mealType: 'Snacks',
				servings: 1,
				date: '2026-06-10',
				eatenAt: '2026-06-10T10:00:00+02:00'
			});
			const { updateEntry } = await import('$lib/server/entries');
			const res = await updateEntry(userId, created.id, {
				date: '2026-06-12',
				eatenAt: '2026-06-12T18:15:00+02:00'
			});
			if (!res.success || !res.data) throw new Error('update failed');
			expect(res.data.eatenAt.toISOString()).toBe('2026-06-12T16:15:00.000Z');
		});

		it('changing only the date to the same date leaves eatenAt untouched', async () => {
			const db = getTestDB(dbUrl);
			await db.insert(userPreferences).values({ userId, timeZone: 'Europe/Zurich' });
			const created = await log({
				foodId: oatsId,
				mealType: 'Snacks',
				servings: 1,
				date: '2026-06-10',
				eatenAt: '2026-06-10T10:00:00+02:00'
			});
			const { updateEntry } = await import('$lib/server/entries');
			const res = await updateEntry(userId, created.id, { date: '2026-06-10' });
			if (!res.success || !res.data) throw new Error('update failed');
			expect(res.data.eatenAt.toISOString()).toBe('2026-06-10T08:00:00.000Z');
		});
	});
});
