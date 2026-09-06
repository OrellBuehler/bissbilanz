import { and, asc, eq, sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { strToU8, zip, type Zippable } from 'fflate';
import { getDB } from './db';
import {
	aiTasks,
	customMealTypes,
	dayProperties,
	fastingSessions,
	favoriteMealTimeframes,
	foodEntries,
	foods,
	identities,
	recipeIngredients,
	recipes,
	sleepEntries,
	supplementIngredients,
	supplements,
	userGoals,
	userPreferences,
	users,
	weightEntries
} from './schema';
import { buildRecipeMacrosCte } from './recipe-macros';
import { UPLOAD_DIR } from './images';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';

export const EXPORT_FORMAT_VERSION = 1;

type CsvValue = string | number | boolean | Date | null | undefined;

const csvEscape = (value: CsvValue): string => {
	if (value === null || value === undefined) return '';
	const str =
		value instanceof Date
			? value.toISOString()
			: typeof value === 'boolean'
				? value
					? 'true'
					: 'false'
				: String(value);
	if (/[",\n\r]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
	return str;
};

// UTF-8 BOM so spreadsheet apps detect the encoding (umlauts in food names)
export const toCsv = (headers: string[], rows: CsvValue[][]): string =>
	'﻿' + [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';

const stripUserId = <T extends { userId?: string }>(rows: T[]): Omit<T, 'userId'>[] =>
	rows.map(({ userId: _userId, ...rest }) => rest);

const round1 = (value: number | null): number | null =>
	value === null ? null : Math.round(value * 10) / 10;

const imageName = (url: string | null): string | null =>
	url && url.startsWith('/uploads/') ? `images/${basename(url)}` : null;

async function gatherData(userId: string) {
	const db = getDB();
	const recipeMacrosCte = buildRecipeMacrosCte(db, userId);

	const [
		[profile],
		identityRows,
		foodRows,
		recipeRows,
		recipeIngredientRows,
		entryRows,
		supplementRows,
		supplementIngredientRows,
		weightRows,
		sleepRows,
		dayPropertyRows,
		fastingRows,
		[goals],
		[preferences],
		mealTypeRows,
		timeframeRows,
		aiTaskRows
	] = await Promise.all([
		db
			.select({
				email: users.email,
				name: users.name,
				locale: users.locale,
				createdAt: users.createdAt
			})
			.from(users)
			.where(eq(users.id, userId)),
		db
			.select({
				provider: identities.provider,
				email: identities.email,
				createdAt: identities.createdAt
			})
			.from(identities)
			.where(eq(identities.userId, userId)),
		db.select().from(foods).where(eq(foods.userId, userId)).orderBy(asc(foods.name)),
		db.select().from(recipes).where(eq(recipes.userId, userId)).orderBy(asc(recipes.name)),
		db
			.select({
				id: recipeIngredients.id,
				recipeId: recipeIngredients.recipeId,
				foodId: recipeIngredients.foodId,
				foodName: foods.name,
				quantity: recipeIngredients.quantity,
				servingUnit: recipeIngredients.servingUnit,
				sortOrder: recipeIngredients.sortOrder
			})
			.from(recipeIngredients)
			.innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
			.innerJoin(foods, eq(foods.id, recipeIngredients.foodId))
			.where(eq(recipes.userId, userId))
			.orderBy(asc(recipeIngredients.recipeId), asc(recipeIngredients.sortOrder)),
		db
			.with(recipeMacrosCte)
			.select({
				id: foodEntries.id,
				date: foodEntries.date,
				eatenAt: foodEntries.eatenAt,
				mealType: foodEntries.mealType,
				servings: foodEntries.servings,
				notes: foodEntries.notes,
				foodId: foodEntries.foodId,
				recipeId: foodEntries.recipeId,
				supplementId: foodEntries.supplementId,
				quickName: foodEntries.quickName,
				quickCalories: foodEntries.quickCalories,
				quickProtein: foodEntries.quickProtein,
				quickCarbs: foodEntries.quickCarbs,
				quickFat: foodEntries.quickFat,
				quickFiber: foodEntries.quickFiber,
				quickNutrients: foodEntries.quickNutrients,
				name: sql<
					string | null
				>`COALESCE(${foodEntries.quickName}, ${foods.name}, ${recipes.name})`,
				brand: foods.brand,
				perServingCalories: sql<
					number | null
				>`COALESCE(${foodEntries.quickCalories}, ${foods.calories}, ${recipeMacrosCte.rmCalories})`,
				perServingProtein: sql<
					number | null
				>`COALESCE(${foodEntries.quickProtein}, ${foods.protein}, ${recipeMacrosCte.rmProtein})`,
				perServingCarbs: sql<
					number | null
				>`COALESCE(${foodEntries.quickCarbs}, ${foods.carbs}, ${recipeMacrosCte.rmCarbs})`,
				perServingFat: sql<
					number | null
				>`COALESCE(${foodEntries.quickFat}, ${foods.fat}, ${recipeMacrosCte.rmFat})`,
				perServingFiber: sql<
					number | null
				>`COALESCE(${foodEntries.quickFiber}, ${foods.fiber}, ${recipeMacrosCte.rmFiber})`,
				createdAt: foodEntries.createdAt,
				updatedAt: foodEntries.updatedAt
			})
			.from(foodEntries)
			.leftJoin(foods, and(eq(foodEntries.foodId, foods.id), eq(foods.userId, userId)))
			.leftJoin(recipes, and(eq(foodEntries.recipeId, recipes.id), eq(recipes.userId, userId)))
			.leftJoin(recipeMacrosCte, eq(recipeMacrosCte.recipeId, foodEntries.recipeId))
			.where(eq(foodEntries.userId, userId))
			.orderBy(asc(foodEntries.date), asc(foodEntries.eatenAt)),
		db
			.select()
			.from(supplements)
			.where(eq(supplements.userId, userId))
			.orderBy(asc(supplements.sortOrder)),
		db
			.select({
				id: supplementIngredients.id,
				supplementId: supplementIngredients.supplementId,
				foodId: supplementIngredients.foodId,
				foodName: foods.name,
				servings: supplementIngredients.servings,
				sortOrder: supplementIngredients.sortOrder
			})
			.from(supplementIngredients)
			.innerJoin(supplements, eq(supplements.id, supplementIngredients.supplementId))
			.innerJoin(foods, eq(foods.id, supplementIngredients.foodId))
			.where(eq(supplements.userId, userId))
			.orderBy(asc(supplementIngredients.supplementId), asc(supplementIngredients.sortOrder)),
		db
			.select()
			.from(weightEntries)
			.where(eq(weightEntries.userId, userId))
			.orderBy(asc(weightEntries.entryDate)),
		db
			.select()
			.from(sleepEntries)
			.where(eq(sleepEntries.userId, userId))
			.orderBy(asc(sleepEntries.entryDate)),
		db
			.select()
			.from(dayProperties)
			.where(eq(dayProperties.userId, userId))
			.orderBy(asc(dayProperties.date)),
		db
			.select()
			.from(fastingSessions)
			.where(eq(fastingSessions.userId, userId))
			.orderBy(asc(fastingSessions.startedAt)),
		db.select().from(userGoals).where(eq(userGoals.userId, userId)),
		db.select().from(userPreferences).where(eq(userPreferences.userId, userId)),
		db
			.select()
			.from(customMealTypes)
			.where(eq(customMealTypes.userId, userId))
			.orderBy(asc(customMealTypes.sortOrder)),
		db
			.select()
			.from(favoriteMealTimeframes)
			.where(eq(favoriteMealTimeframes.userId, userId))
			.orderBy(asc(favoriteMealTimeframes.sortOrder)),
		db.select().from(aiTasks).where(eq(aiTasks.userId, userId)).orderBy(asc(aiTasks.createdAt))
	]);

	return {
		profile: profile ?? null,
		identities: identityRows,
		foods: stripUserId(foodRows),
		recipes: stripUserId(recipeRows),
		recipeIngredients: recipeIngredientRows,
		entries: entryRows,
		supplements: stripUserId(supplementRows),
		supplementIngredients: supplementIngredientRows,
		weightEntries: stripUserId(weightRows),
		sleepEntries: stripUserId(sleepRows),
		dayProperties: stripUserId(dayPropertyRows),
		fastingSessions: stripUserId(fastingRows),
		goals: goals ? stripUserId([goals])[0] : null,
		preferences: preferences ? stripUserId([preferences])[0] : null,
		customMealTypes: stripUserId(mealTypeRows),
		favoriteMealTimeframes: stripUserId(timeframeRows),
		aiTasks: stripUserId(aiTaskRows)
	};
}

type ExportData = Awaited<ReturnType<typeof gatherData>>;

function buildEntriesCsv(data: ExportData): string {
	const headers = [
		'date',
		'eaten_at',
		'meal',
		'name',
		'brand',
		'source',
		'servings',
		'calories',
		'protein',
		'carbs',
		'fat',
		'fiber',
		'notes'
	];
	const rows = data.entries.map((entry) => [
		entry.date,
		entry.eatenAt,
		entry.mealType,
		entry.name,
		entry.brand,
		entry.supplementId ? 'supplement' : entry.recipeId ? 'recipe' : entry.foodId ? 'food' : 'quick',
		entry.servings,
		round1((entry.perServingCalories ?? 0) * entry.servings),
		round1((entry.perServingProtein ?? 0) * entry.servings),
		round1((entry.perServingCarbs ?? 0) * entry.servings),
		round1((entry.perServingFat ?? 0) * entry.servings),
		round1((entry.perServingFiber ?? 0) * entry.servings),
		entry.notes
	]);
	return toCsv(headers, rows);
}

function buildFoodsCsv(data: ExportData): string {
	const headers = [
		'name',
		'brand',
		'kind',
		'serving_size',
		'serving_unit',
		'calories',
		'protein',
		'carbs',
		'fat',
		'fiber',
		...ALL_NUTRIENT_KEYS,
		'barcode',
		'is_favorite',
		'nutri_score',
		'nova_group',
		'image',
		'created_at'
	];
	const rows = data.foods.map((food) => [
		food.name,
		food.brand,
		food.kind,
		food.servingSize,
		food.servingUnit,
		food.calories,
		food.protein,
		food.carbs,
		food.fat,
		food.fiber,
		...ALL_NUTRIENT_KEYS.map((key) => (food as Record<string, CsvValue>)[key]),
		food.barcode,
		food.isFavorite,
		food.nutriScore,
		food.novaGroup,
		imageName(food.imageUrl),
		food.createdAt
	]);
	return toCsv(headers, rows);
}

function buildCsvFiles(data: ExportData): Record<string, string> {
	const recipeNames = new Map(data.recipes.map((recipe) => [recipe.id, recipe.name]));
	const supplementNames = new Map(
		data.supplements.map((supplement) => [supplement.id, supplement.name])
	);

	const files: Record<string, string> = {
		'csv/food-entries.csv': buildEntriesCsv(data),
		'csv/foods.csv': buildFoodsCsv(data),
		'csv/recipes.csv': toCsv(
			['name', 'total_servings', 'is_favorite', 'image', 'created_at'],
			data.recipes.map((recipe) => [
				recipe.name,
				recipe.totalServings,
				recipe.isFavorite,
				imageName(recipe.imageUrl),
				recipe.createdAt
			])
		),
		'csv/recipe-ingredients.csv': toCsv(
			['recipe', 'food', 'quantity', 'serving_unit'],
			data.recipeIngredients.map((ingredient) => [
				recipeNames.get(ingredient.recipeId),
				ingredient.foodName,
				ingredient.quantity,
				ingredient.servingUnit
			])
		),
		'csv/supplements.csv': toCsv(
			[
				'name',
				'schedule_type',
				'schedule_days',
				'schedule_start_date',
				'time_of_day',
				'reminder_times',
				'is_active'
			],
			data.supplements.map((supplement) => [
				supplement.name,
				supplement.scheduleType,
				supplement.scheduleDays?.join(';'),
				supplement.scheduleStartDate,
				supplement.timeOfDay,
				supplement.reminderTimes?.join(';'),
				supplement.isActive
			])
		),
		'csv/supplement-ingredients.csv': toCsv(
			['supplement', 'food', 'servings'],
			data.supplementIngredients.map((ingredient) => [
				supplementNames.get(ingredient.supplementId),
				ingredient.foodName,
				ingredient.servings
			])
		),
		'csv/weight.csv': toCsv(
			['date', 'weight_kg', 'logged_at', 'notes'],
			data.weightEntries.map((entry) => [
				entry.entryDate,
				entry.weightKg,
				entry.loggedAt,
				entry.notes
			])
		),
		'csv/sleep.csv': toCsv(
			[
				'date',
				'duration_minutes',
				'quality',
				'bedtime',
				'wake_time',
				'wake_ups',
				'sleep_latency_minutes',
				'deep_sleep_minutes',
				'light_sleep_minutes',
				'rem_sleep_minutes',
				'source',
				'notes'
			],
			data.sleepEntries.map((entry) => [
				entry.entryDate,
				entry.durationMinutes,
				entry.quality,
				entry.bedtime,
				entry.wakeTime,
				entry.wakeUps,
				entry.sleepLatencyMinutes,
				entry.deepSleepMinutes,
				entry.lightSleepMinutes,
				entry.remSleepMinutes,
				entry.source,
				entry.notes
			])
		),
		'csv/day-properties.csv': toCsv(
			['date', 'is_fasting_day', 'notes', 'water_ml', 'activity_calories', 'activity_note'],
			data.dayProperties.map((day) => [
				day.date,
				day.isFastingDay,
				day.notes,
				day.waterMl,
				day.activityCalories,
				day.activityNote
			])
		),
		'csv/fasting-sessions.csv': toCsv(
			['id', 'started_at', 'ended_at', 'target_hours'],
			data.fastingSessions.map((fast) => [fast.id, fast.startedAt, fast.endedAt, fast.targetHours])
		),
		'csv/meal-types.csv': toCsv(
			['name', 'sort_order'],
			data.customMealTypes.map((mealType) => [mealType.name, mealType.sortOrder])
		)
	};

	if (data.goals) {
		files['csv/goals.csv'] = toCsv(
			[
				'calorie_goal',
				'protein_goal',
				'carb_goal',
				'fat_goal',
				'fiber_goal',
				'sodium_goal',
				'sugar_goal'
			],
			[
				[
					data.goals.calorieGoal,
					data.goals.proteinGoal,
					data.goals.carbGoal,
					data.goals.fatGoal,
					data.goals.fiberGoal,
					data.goals.sodiumGoal,
					data.goals.sugarGoal
				]
			]
		);
	}

	return files;
}

async function gatherImages(data: ExportData): Promise<Record<string, Uint8Array>> {
	const urls = new Set<string>();
	for (const food of data.foods) {
		if (food.imageUrl?.startsWith('/uploads/')) urls.add(food.imageUrl);
	}
	for (const recipe of data.recipes) {
		if (recipe.imageUrl?.startsWith('/uploads/')) urls.add(recipe.imageUrl);
	}
	for (const task of data.aiTasks) {
		for (const photoUrl of task.photoUrls ?? []) {
			if (photoUrl.startsWith('/uploads/')) urls.add(photoUrl);
		}
	}

	const images: Record<string, Uint8Array> = {};
	await Promise.all(
		[...urls].map(async (url) => {
			const name = basename(url);
			try {
				const buffer = await readFile(join(UPLOAD_DIR, name));
				images[`images/${name}`] = new Uint8Array(buffer);
			} catch {
				// Missing file on disk — skip rather than fail the whole export
			}
		})
	);
	return images;
}

const README = `Bissbilanz data export
======================

bissbilanz.json   Complete export of your data (canonical, machine-readable).
                  Contains every record with IDs and relations intact.
csv/              The same data as spreadsheet-friendly CSV files.
                  food-entries.csv is denormalized: each row carries the food
                  name and the calories/macros computed for that entry.
images/           Your uploaded food and recipe photos.

All times are ISO 8601 (UTC). CSV files are UTF-8 with BOM, comma-separated.
`;

export async function buildAccountExport(userId: string): Promise<Uint8Array<ArrayBuffer>> {
	const data = await gatherData(userId);
	const [csvFiles, images] = [buildCsvFiles(data), await gatherImages(data)];

	const json = JSON.stringify(
		{
			formatVersion: EXPORT_FORMAT_VERSION,
			exportedAt: new Date().toISOString(),
			...data
		},
		null,
		'\t'
	);

	const files: Zippable = {
		'README.txt': strToU8(README),
		'bissbilanz.json': strToU8(json)
	};
	for (const [name, content] of Object.entries(csvFiles)) {
		files[name] = strToU8(content);
	}
	for (const [name, content] of Object.entries(images)) {
		// Uploaded images are already-compressed WebP/JPEG — store without deflate
		files[name] = [content, { level: 0 }];
	}

	return new Promise((resolve, reject) => {
		zip(files, { level: 6 }, (error, result) => {
			if (error) reject(error);
			else resolve(result as Uint8Array<ArrayBuffer>);
		});
	});
}
