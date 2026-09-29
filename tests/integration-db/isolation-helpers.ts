import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	aiTasks,
	catalogAccess,
	catalogDatasets,
	catalogFoods,
	customMealTypes,
	dayProperties,
	fastingSessions,
	favoriteMealTimeframes,
	foodEntries,
	foodLabels,
	foods,
	identities,
	pushSubscriptions,
	recipeIngredients,
	recipeSteps,
	recipes,
	reminders,
	sleepEntries,
	supplementIngredients,
	supplements,
	uploads,
	userGoals,
	userPreferences,
	users,
	weightEntries
} from '$lib/server/schema';
import type { getTestDB } from './helpers';

export const D1 = '2026-03-10';
export const D2 = '2026-03-11';
export const TODAY = new Date().toISOString().slice(0, 10);
export const EAN = '4006381333931';

export type TestDB = ReturnType<typeof getTestDB>;
type Ids = Record<string, string>;

/** A is the victim, B the attacker, C an account that never owns anything. */
export type World = {
	db: TestDB;
	A: string;
	B: string;
	C: string;
	a: Ids;
	b: Ids;
	uploadDir: string;
};

export const createWorld = async (db: TestDB, uploadDir: string): Promise<World> => {
	const [a, b, c] = await db
		.insert(users)
		.values([
			{ infomaniakSub: `iso-a-${randomUUID()}`, email: 'isoA@example.test', name: 'isoA-name' },
			{ infomaniakSub: `iso-b-${randomUUID()}`, name: 'isoB-name' },
			{ infomaniakSub: `iso-c-${randomUUID()}` }
		])
		.returning();
	return { db, A: a.id, B: b.id, C: c.id, a: {}, b: {}, uploadDir };
};

export const insertFood = async (
	w: World,
	userId: string,
	name: string,
	extra: Record<string, unknown> = {}
) => {
	const [row] = await w.db
		.insert(foods)
		.values({
			userId,
			name,
			servingSize: 100,
			servingUnit: 'g',
			calories: 200,
			protein: 10,
			carbs: 20,
			fat: 5,
			fiber: 3,
			...extra
		})
		.returning();
	return row;
};

export const insertRecipe = async (w: World, userId: string, name: string, foodId: string) => {
	const [recipe] = await w.db
		.insert(recipes)
		.values({ userId, name, totalServings: 2, isFavorite: true })
		.returning();
	await w.db
		.insert(recipeIngredients)
		.values({ recipeId: recipe.id, foodId, quantity: 50, servingUnit: 'g', sortOrder: 0 });
	return recipe;
};

export const insertEntry = async (w: World, userId: string, values: Record<string, unknown>) => {
	const [row] = await w.db
		.insert(foodEntries)
		.values({ userId, date: D1, mealType: 'Lunch', servings: 1, ...values })
		.returning();
	return row;
};

export const insertSupplement = async (w: World, userId: string, name: string) => {
	const backing = await insertFood(w, userId, `${name}-backing`, { kind: 'supplement' });
	const [supp] = await w.db
		.insert(supplements)
		.values({ userId, name, scheduleType: 'daily', scheduleStartDate: '2026-01-01' })
		.returning();
	await w.db
		.insert(supplementIngredients)
		.values({ supplementId: supp.id, foodId: backing.id, servings: 1, sortOrder: 0 });
	return { supp, backing };
};

/** Rows the attacker legitimately owns, for probes that need a valid own target next to a foreign one. */
export const arrangeBOwn = async (w: World, what: ('food' | 'recipe' | 'entry' | 'supp')[]) => {
	w.b.food = (await insertFood(w, w.B, 'isoB-food')).id;
	if (what.includes('recipe'))
		w.b.recipe = (await insertRecipe(w, w.B, 'isoB-recipe', w.b.food)).id;
	if (what.includes('entry')) w.b.entry = (await insertEntry(w, w.B, { foodId: w.b.food })).id;
	if (what.includes('supp')) w.b.supp = (await insertSupplement(w, w.B, 'isoB-supp')).supp.id;
};

/**
 * One seeder per resource; each fills user A's world. Seeders run in key order,
 * so a later one may reference ids stored by an earlier one.
 */
export const seeders = {
	foods: async (w: World) => {
		const upload = `${randomUUID()}.webp`;
		await writeFile(join(w.uploadDir, upload), 'isoA-bytes');
		await w.db.insert(uploads).values({ filename: upload, userId: w.A });
		w.a.upload = upload;

		const food = await insertFood(w, w.A, 'isoA-Oats', {
			brand: 'isoA-Brand',
			barcode: EAN,
			isFavorite: true,
			imageUrl: `/uploads/${upload}`
		});
		w.a.food = food.id;
		w.a.foodLoose = (await insertFood(w, w.A, 'isoA-Loose')).id;
		w.a.foodKeeper = (await insertFood(w, w.A, 'isoA-Twin', { brand: 'isoA-Brand' })).id;
		w.a.foodSource = (await insertFood(w, w.A, 'isoA-Twin', { brand: 'isoA-Brand' })).id;
		await w.db
			.insert(foodLabels)
			.values({ foodId: food.id, userId: w.A, label: 'isoalabel', source: 'user' });
	},

	recipes: async (w: World) => {
		const recipe = await insertRecipe(w, w.A, 'isoA-Recipe', w.a.food);
		w.a.recipe = recipe.id;
		await w.db.insert(recipeSteps).values({ recipeId: recipe.id, sortOrder: 0, text: 'isoA-step' });
	},

	entries: async (w: World) => {
		w.a.entry = (await insertEntry(w, w.A, { foodId: w.a.food, notes: 'isoA-note' })).id;
		w.a.recipeEntry = (await insertEntry(w, w.A, { recipeId: w.a.recipe, mealType: 'Dinner' })).id;
		w.a.todayEntry = (await insertEntry(w, w.A, { foodId: w.a.food, date: TODAY })).id;
		w.a.quickEntry = (
			await insertEntry(w, w.A, { quickName: 'isoA-quick', quickCalories: 500, mealType: 'Snacks' })
		).id;
	},

	mealTypes: async (w: World) => {
		const [mt] = await w.db
			.insert(customMealTypes)
			.values({ userId: w.A, name: 'isoA-Meal', sortOrder: 0 })
			.returning();
		w.a.mealType = mt.id;
		await w.db.insert(favoriteMealTimeframes).values({
			userId: w.A,
			mealType: 'isoA-Meal',
			customMealTypeId: mt.id,
			startMinute: 420,
			endMinute: 540
		});
	},

	supplements: async (w: World) => {
		const { supp, backing } = await insertSupplement(w, w.A, 'isoA-Supp');
		w.a.supp = supp.id;
		w.a.suppFood = backing.id;
		await insertEntry(w, w.A, { foodId: backing.id, supplementId: supp.id, mealType: 'Snacks' });
		await insertEntry(w, w.A, {
			foodId: backing.id,
			supplementId: supp.id,
			mealType: 'Snacks',
			date: TODAY
		});
	},

	weight: async (w: World) => {
		const loggedAt = new Date();
		const [first] = await w.db
			.insert(weightEntries)
			.values([
				{ userId: w.A, weightKg: 81.5, entryDate: D1, loggedAt, notes: 'isoA-wnote' },
				{ userId: w.A, weightKg: 80.5, entryDate: '2026-03-20', loggedAt }
			])
			.returning();
		w.a.weight = first.id;
	},

	sleep: async (w: World) => {
		const [row] = await w.db
			.insert(sleepEntries)
			.values({
				userId: w.A,
				entryDate: D1,
				durationMinutes: 444,
				quality: 7,
				notes: 'isoA-snote',
				loggedAt: new Date()
			})
			.returning();
		w.a.sleep = row.id;
	},

	aiTasks: async (w: World) => {
		const [row] = await w.db
			.insert(aiTasks)
			.values({ userId: w.A, description: 'isoA-task', date: D1, photoUrls: [] })
			.returning();
		w.a.task = row.id;
	},

	reminders: async (w: World) => {
		const [row] = await w.db
			.insert(reminders)
			.values({ userId: w.A, kind: 'weight', time: '07:30', weekdays: [1, 3] })
			.returning();
		w.a.reminder = row.id;
	},

	dayProperties: async (w: World) => {
		await w.db
			.insert(dayProperties)
			.values({ userId: w.A, date: D1, isFastingDay: true, notes: 'isoA-day', waterMl: 1500 });
	},

	goals: async (w: World) => {
		await w.db.insert(userGoals).values({
			userId: w.A,
			calorieGoal: 2222,
			proteinGoal: 111,
			carbGoal: 222,
			fatGoal: 66,
			fiberGoal: 33
		});
	},

	preferences: async (w: World) => {
		await w.db.insert(userPreferences).values({ userId: w.A, showChartWidget: false });
	},

	fasts: async (w: World) => {
		const [row] = await w.db
			.insert(fastingSessions)
			.values({
				userId: w.A,
				startedAt: new Date('2026-03-09T20:00:00Z'),
				endedAt: new Date('2026-03-10T12:00:00Z'),
				targetHours: 16
			})
			.returning();
		w.a.fast = row.id;
	},

	pushSubscriptions: async (w: World) => {
		w.a.pushEndpoint = 'https://push.example.test/isoA-endpoint';
		await w.db.insert(pushSubscriptions).values({
			userId: w.A,
			endpoint: w.a.pushEndpoint,
			p256dh: 'isoA-p256dh',
			auth: 'isoA-auth'
		});
	},

	identities: async (w: World) => {
		const [first] = await w.db
			.insert(identities)
			.values([
				{
					userId: w.A,
					provider: 'google',
					subject: `isoA-google-${w.A}`,
					email: 'isoA@example.test'
				},
				{ userId: w.A, provider: 'apple', subject: `isoA-apple-${w.A}` }
			])
			.returning();
		w.a.identity = first.id;
	},

	catalog: async (w: World) => {
		const [dataset] = await w.db
			.insert(catalogDatasets)
			.values({ key: `iso-private-${w.A}`, name: 'isoA-dataset', source: 'test', productCount: 1 })
			.returning();
		const [item] = await w.db
			.insert(catalogFoods)
			.values({
				datasetId: dataset.id,
				name: 'isoA-catalog-crisps',
				servingSize: 100,
				servingUnit: 'g',
				calories: 500,
				protein: 5,
				carbs: 50,
				fat: 30,
				fiber: 2,
				barcode: '7610095131003'
			})
			.returning();
		await w.db.insert(catalogAccess).values({ userId: w.A, datasetId: dataset.id });
		w.a.catalogFood = item.id;
	}
};

export const seedWorld = async (w: World) => {
	for (const seed of Object.values(seeders)) await seed(w);
};

const snapshotQueries = (w: World) => {
	const { db, A } = w;
	const own = <T extends { userId: any }>(table: T) => eq(table.userId, A);
	const aRecipes = db.select({ id: recipes.id }).from(recipes).where(eq(recipes.userId, A));
	const aSupps = db
		.select({ id: supplements.id })
		.from(supplements)
		.where(eq(supplements.userId, A));
	const aFoods = db.select({ id: foods.id }).from(foods).where(eq(foods.userId, A));
	return {
		users: db.select().from(users).where(eq(users.id, A)),
		foods: db.select().from(foods).where(own(foods)),
		foodLabels: db.select().from(foodLabels).where(inArray(foodLabels.foodId, aFoods)),
		foodEntries: db.select().from(foodEntries).where(own(foodEntries)),
		recipes: db.select().from(recipes).where(own(recipes)),
		recipeIngredients: db
			.select()
			.from(recipeIngredients)
			.where(inArray(recipeIngredients.recipeId, aRecipes)),
		recipeSteps: db.select().from(recipeSteps).where(inArray(recipeSteps.recipeId, aRecipes)),
		supplements: db.select().from(supplements).where(own(supplements)),
		supplementIngredients: db
			.select()
			.from(supplementIngredients)
			.where(inArray(supplementIngredients.supplementId, aSupps)),
		customMealTypes: db.select().from(customMealTypes).where(own(customMealTypes)),
		favoriteMealTimeframes: db
			.select()
			.from(favoriteMealTimeframes)
			.where(own(favoriteMealTimeframes)),
		userGoals: db.select().from(userGoals).where(own(userGoals)),
		userPreferences: db.select().from(userPreferences).where(own(userPreferences)),
		reminders: db.select().from(reminders).where(own(reminders)),
		dayProperties: db.select().from(dayProperties).where(own(dayProperties)),
		fastingSessions: db.select().from(fastingSessions).where(own(fastingSessions)),
		weightEntries: db.select().from(weightEntries).where(own(weightEntries)),
		sleepEntries: db.select().from(sleepEntries).where(own(sleepEntries)),
		aiTasks: db.select().from(aiTasks).where(own(aiTasks)),
		pushSubscriptions: db.select().from(pushSubscriptions).where(own(pushSubscriptions)),
		uploads: db.select().from(uploads).where(own(uploads)),
		identities: db.select().from(identities).where(own(identities)),
		catalogAccess: db.select().from(catalogAccess).where(own(catalogAccess))
	};
};

/** Every row user A owns (plus children reachable through A's rows), and the upload files. */
export const snapshot = async (w: World) => {
	const out: Record<string, string[]> = {};
	for (const [name, query] of Object.entries(snapshotQueries(w))) {
		const rows = (await query) as unknown[];
		out[name] = rows.map((row) => JSON.stringify(row)).sort();
	}
	out.uploadFiles = (await readdir(w.uploadDir)).sort();
	return out;
};

/** Rows of B (or written on B's behalf) that point at user A's data; must always be empty. */
export const foreignReferences = async (w: World) => {
	const { db, A, B } = w;
	const aFoods = db.select({ id: foods.id }).from(foods).where(eq(foods.userId, A));
	const aRecipes = db.select({ id: recipes.id }).from(recipes).where(eq(recipes.userId, A));
	const aSupps = db
		.select({ id: supplements.id })
		.from(supplements)
		.where(eq(supplements.userId, A));
	const aMeals = db
		.select({ id: customMealTypes.id })
		.from(customMealTypes)
		.where(eq(customMealTypes.userId, A));
	const bRecipes = db.select({ id: recipes.id }).from(recipes).where(eq(recipes.userId, B));
	const bSupps = db
		.select({ id: supplements.id })
		.from(supplements)
		.where(eq(supplements.userId, B));
	const bFoods = db.select({ id: foods.id }).from(foods).where(eq(foods.userId, B));

	const found: Record<string, unknown[]> = {
		entriesToForeignFood: await db
			.select({ id: foodEntries.id })
			.from(foodEntries)
			.where(and(eq(foodEntries.userId, B), inArray(foodEntries.foodId, aFoods))),
		entriesToForeignRecipe: await db
			.select({ id: foodEntries.id })
			.from(foodEntries)
			.where(and(eq(foodEntries.userId, B), inArray(foodEntries.recipeId, aRecipes))),
		entriesToForeignSupplement: await db
			.select({ id: foodEntries.id })
			.from(foodEntries)
			.where(and(eq(foodEntries.userId, B), inArray(foodEntries.supplementId, aSupps))),
		recipeIngredientsToForeignFood: await db
			.select({ id: recipeIngredients.id })
			.from(recipeIngredients)
			.where(
				and(
					inArray(recipeIngredients.recipeId, bRecipes),
					inArray(recipeIngredients.foodId, aFoods)
				)
			),
		supplementIngredientsToForeignFood: await db
			.select({ id: supplementIngredients.id })
			.from(supplementIngredients)
			.where(
				and(
					inArray(supplementIngredients.supplementId, bSupps),
					inArray(supplementIngredients.foodId, aFoods)
				)
			),
		labelsOnForeignFood: await db
			.select({ id: foodLabels.id })
			.from(foodLabels)
			.where(and(inArray(foodLabels.foodId, aFoods), ne(foodLabels.userId, A))),
		labelsFromForeignUserOnOwnFood: await db
			.select({ id: foodLabels.id })
			.from(foodLabels)
			.where(and(eq(foodLabels.userId, A), inArray(foodLabels.foodId, bFoods))),
		timeframesToForeignMealType: await db
			.select({ id: favoriteMealTimeframes.id })
			.from(favoriteMealTimeframes)
			.where(
				and(
					eq(favoriteMealTimeframes.userId, B),
					inArray(favoriteMealTimeframes.customMealTypeId, aMeals)
				)
			)
	};
	return Object.fromEntries(Object.entries(found).filter(([, rows]) => rows.length > 0));
};

/** Every id user A owns, so a response can be checked for leaking any of them. */
export const collectAIds = async (w: World) => {
	const ids = new Set<string>(Object.values(w.a).filter((v) => /^[0-9a-f-]{36}$/.test(v)));
	const tables = [
		foods,
		recipes,
		foodEntries,
		supplements,
		weightEntries,
		sleepEntries,
		aiTasks,
		reminders,
		customMealTypes,
		fastingSessions
	];
	for (const table of tables) {
		const rows = await w.db
			.select({ id: table.id })
			.from(table)
			.where(eq(table.userId as never, w.A));
		for (const row of rows) ids.add(row.id);
	}
	return [...ids];
};

/** A response may echo what the attacker sent; only strings that came from A's data count as a leak. */
export const stripEchoed = (response: string, request: unknown) => {
	const echoed = JSON.stringify(request).match(/isoa[\w-]*/gi) ?? [];
	return echoed.reduce(
		(text, token) => text.replaceAll(token.toLowerCase(), ''),
		response.toLowerCase()
	);
};

export const resetDatabase = async (db: TestDB, uploadDir: string) => {
	await db.execute(sql`TRUNCATE TABLE users CASCADE`);
	await db.delete(catalogFoods);
	await db.delete(catalogDatasets);
	for (const file of await readdir(uploadDir)) await rm(join(uploadDir, file));
};
