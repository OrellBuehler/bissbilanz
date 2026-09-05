import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
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
	weightEntries,
	userGoals
} from '$lib/server/schema';

const DB_NAME = 'test_account_export';
let dbUrl: string;
let userAId: string;

beforeAll(async () => {
	dbUrl = await createTestDatabase(DB_NAME);
	await runTestMigrations(dbUrl);

	const db = getTestDB(dbUrl);
	vi.doMock('$lib/server/db', () => ({
		getDB: () => db
	}));

	const [userA] = await db.insert(users).values({ infomaniakSub: 'export-a' }).returning();
	userAId = userA.id;
	const [userB] = await db.insert(users).values({ infomaniakSub: 'export-b' }).returning();

	const [oats] = await db
		.insert(foods)
		.values({
			userId: userAId,
			name: 'Oats, "steel-cut"',
			brand: 'Müsli AG',
			servingSize: 100,
			servingUnit: 'g',
			calories: 380,
			protein: 13,
			carbs: 67,
			fat: 7,
			fiber: 10,
			sodium: 2
		})
		.returning();

	const [smoothie] = await db
		.insert(recipes)
		.values({ userId: userAId, name: 'Oat Smoothie', totalServings: 2 })
		.returning();
	await db.insert(recipeIngredients).values({
		recipeId: smoothie.id,
		foodId: oats.id,
		quantity: 200,
		servingUnit: 'g',
		sortOrder: 0
	});

	await db.insert(foodEntries).values([
		{
			userId: userAId,
			foodId: oats.id,
			date: '2026-08-01',
			mealType: 'Breakfast',
			servings: 0.5
		},
		{
			userId: userAId,
			recipeId: smoothie.id,
			date: '2026-08-01',
			mealType: 'Lunch',
			servings: 1
		},
		{
			userId: userAId,
			date: '2026-08-02',
			mealType: 'Snacks',
			servings: 1,
			quickName: 'Street food',
			quickCalories: 500,
			quickProtein: 20,
			quickCarbs: 50,
			quickFat: 25,
			quickFiber: 5
		}
	]);

	await db.insert(weightEntries).values({
		userId: userAId,
		weightKg: 80.4,
		entryDate: '2026-08-01',
		loggedAt: new Date('2026-08-01T06:30:00Z')
	});
	await db.insert(userGoals).values({
		userId: userAId,
		calorieGoal: 2500,
		proteinGoal: 160,
		carbGoal: 280,
		fatGoal: 80,
		fiberGoal: 30
	});

	// User B's data must never appear in A's export
	const [secret] = await db
		.insert(foods)
		.values({
			userId: userB.id,
			name: 'Bobs Secret Bar',
			servingSize: 50,
			servingUnit: 'g',
			calories: 200,
			protein: 10,
			carbs: 20,
			fat: 8,
			fiber: 2
		})
		.returning();
	await db.insert(foodEntries).values({
		userId: userB.id,
		foodId: secret.id,
		date: '2026-08-01',
		mealType: 'Breakfast',
		servings: 1
	});
});

afterAll(async () => {
	await closeTestDB(dbUrl);
	await dropTestDatabase(DB_NAME);
});

describe('buildAccountExport (integration)', () => {
	it('produces a zip with canonical JSON, CSVs, and no foreign data', async () => {
		const { buildAccountExport } = await import('$lib/server/export');
		const archive = await buildAccountExport(userAId);
		const entries = unzipSync(archive);

		expect(Object.keys(entries).sort()).toEqual([
			'README.txt',
			'bissbilanz.json',
			'csv/day-properties.csv',
			'csv/fasting-sessions.csv',
			'csv/food-entries.csv',
			'csv/foods.csv',
			'csv/goals.csv',
			'csv/meal-types.csv',
			'csv/recipe-ingredients.csv',
			'csv/recipes.csv',
			'csv/sleep.csv',
			'csv/supplement-ingredients.csv',
			'csv/supplements.csv',
			'csv/weight.csv'
		]);

		const json = JSON.parse(strFromU8(entries['bissbilanz.json']));
		expect(json.formatVersion).toBe(1);
		expect(json.foods).toHaveLength(1);
		expect(json.foods[0].name).toBe('Oats, "steel-cut"');
		expect(json.foods[0].sodium).toBe(2);
		expect(json.foods[0].userId).toBeUndefined();
		expect(json.recipes).toHaveLength(1);
		expect(json.recipeIngredients).toHaveLength(1);
		expect(json.entries).toHaveLength(3);
		expect(json.weightEntries).toHaveLength(1);
		expect(json.goals.calorieGoal).toBe(2500);
		expect(JSON.stringify(json)).not.toContain('Bobs Secret Bar');

		const entriesCsv = strFromU8(entries['csv/food-entries.csv']);
		const lines = entriesCsv.replace(/^﻿/, '').trimEnd().split('\r\n');
		expect(lines).toHaveLength(4);
		expect(lines[0]).toBe(
			'date,eaten_at,meal,name,brand,source,servings,calories,protein,carbs,fat,fiber,notes'
		);
		// 0.5 servings of oats: 380 * 0.5 = 190 kcal
		const oatsRow = lines.find((line) => line.includes('steel-cut'))!;
		expect(oatsRow).toContain('"Oats, ""steel-cut"""');
		expect(oatsRow).toContain('Müsli AG');
		expect(oatsRow).toContain(',food,0.5,190,6.5,33.5,3.5,5,');
		// 1 serving of the recipe: 200g oats / 2 servings = 380 kcal per serving
		const recipeRow = lines.find((line) => line.includes('Oat Smoothie'))!;
		expect(recipeRow).toContain(',recipe,1,380,13,67,7,10,');
		const quickRow = lines.find((line) => line.includes('Street food'))!;
		expect(quickRow).toContain(',quick,1,500,20,50,25,5,');

		const weightCsv = strFromU8(entries['csv/weight.csv']);
		expect(weightCsv).toContain('2026-08-01,80.4,2026-08-01T06:30:00.000Z,');
	});
});
