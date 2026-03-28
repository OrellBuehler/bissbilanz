import { getDB } from '$lib/server/db';
import {
	foodEntries,
	foods,
	recipes,
	recipeIngredients,
	weightEntries,
	sleepEntries
} from '$lib/server/schema';
import { and, eq, gte, lte, sql, asc } from 'drizzle-orm';

const buildRecipeMacrosCte = (db: ReturnType<typeof getDB>) =>
	db.$with('recipe_macros').as(
		db
			.select({
				recipeId: recipeIngredients.recipeId,
				rmCalories:
					sql<number>`SUM(${foods.calories} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_calories'
					),
				rmProtein:
					sql<number>`SUM(${foods.protein} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_protein'
					),
				rmCarbs:
					sql<number>`SUM(${foods.carbs} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_carbs'
					),
				rmFat:
					sql<number>`SUM(${foods.fat} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_fat'
					),
				rmFiber:
					sql<number>`SUM(${foods.fiber} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
						'rm_fiber'
					)
			})
			.from(recipeIngredients)
			.innerJoin(foods, eq(foods.id, recipeIngredients.foodId))
			.innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
			.groupBy(recipeIngredients.recipeId, recipes.totalServings)
	);

type RecipeMacrosCte = ReturnType<typeof buildRecipeMacrosCte>;

const caloriesExpr = (rm: RecipeMacrosCte) =>
	sql<number>`COALESCE(${foods.calories}, ${rm.rmCalories}, ${foodEntries.quickCalories}, 0) * ${foodEntries.servings}`;

const proteinExpr = (rm: RecipeMacrosCte) =>
	sql<number>`COALESCE(${foods.protein}, ${rm.rmProtein}, ${foodEntries.quickProtein}, 0) * ${foodEntries.servings}`;

const carbsExpr = (rm: RecipeMacrosCte) =>
	sql<number>`COALESCE(${foods.carbs}, ${rm.rmCarbs}, ${foodEntries.quickCarbs}, 0) * ${foodEntries.servings}`;

const fatExpr = (rm: RecipeMacrosCte) =>
	sql<number>`COALESCE(${foods.fat}, ${rm.rmFat}, ${foodEntries.quickFat}, 0) * ${foodEntries.servings}`;

const fiberExpr = (rm: RecipeMacrosCte) =>
	sql<number>`COALESCE(${foods.fiber}, ${rm.rmFiber}, ${foodEntries.quickFiber}, 0) * ${foodEntries.servings}`;

export const getWeightFoodSeries = async (userId: string, startDate: string, endDate: string) => {
	const db = getDB();
	const rm = buildRecipeMacrosCte(db);

	const calorieRows = await db
		.with(rm)
		.select({
			date: foodEntries.date,
			calories: sql<number>`COALESCE(SUM(${caloriesExpr(rm)}), 0)`.as('calories')
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.leftJoin(rm, eq(rm.recipeId, foodEntries.recipeId))
		.where(
			and(
				eq(foodEntries.userId, userId),
				gte(foodEntries.date, startDate),
				lte(foodEntries.date, endDate)
			)
		)
		.groupBy(foodEntries.date)
		.orderBy(asc(foodEntries.date));

	const weightRows = await db
		.select({
			entryDate: weightEntries.entryDate,
			weightKg: weightEntries.weightKg
		})
		.from(weightEntries)
		.where(
			and(
				eq(weightEntries.userId, userId),
				gte(weightEntries.entryDate, startDate),
				lte(weightEntries.entryDate, endDate)
			)
		)
		.orderBy(asc(weightEntries.entryDate));

	const calorieMap = new Map(calorieRows.map((r) => [r.date, r.calories]));
	const weightMap = new Map(weightRows.map((r) => [r.entryDate, r.weightKg]));

	const allDates = new Set([...calorieMap.keys(), ...weightMap.keys()]);
	const sorted = [...allDates].sort();

	const series = sorted.map((date) => ({
		date,
		calories: calorieMap.get(date) ?? null,
		weightKg: weightMap.get(date) ?? null,
		movingAvg: null as number | null
	}));

	for (let i = 0; i < series.length; i++) {
		const currentDate = new Date(series[i].date + 'T00:00:00Z').getTime();
		const windowStart = currentDate - 6 * 86_400_000;
		const values: number[] = [];
		for (let j = i; j >= 0; j--) {
			const d = new Date(series[j].date + 'T00:00:00Z').getTime();
			if (d < windowStart) break;
			if (series[j].weightKg !== null) values.push(series[j].weightKg!);
		}
		if (values.length > 0) {
			series[i].movingAvg = values.reduce((a, b) => a + b, 0) / values.length;
		}
	}

	return series;
};

export const getDailyNutrientTotals = async (
	userId: string,
	startDate: string,
	endDate: string
) => {
	const db = getDB();
	const rm = buildRecipeMacrosCte(db);

	const rows = await db
		.with(rm)
		.select({
			date: foodEntries.date,
			calories: sql<number>`COALESCE(SUM(${caloriesExpr(rm)}), 0)`.as('calories'),
			protein: sql<number>`COALESCE(SUM(${proteinExpr(rm)}), 0)`.as('protein'),
			carbs: sql<number>`COALESCE(SUM(${carbsExpr(rm)}), 0)`.as('carbs'),
			fat: sql<number>`COALESCE(SUM(${fatExpr(rm)}), 0)`.as('fat'),
			fiber: sql<number>`COALESCE(SUM(${fiberExpr(rm)}), 0)`.as('fiber')
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.leftJoin(rm, eq(rm.recipeId, foodEntries.recipeId))
		.where(
			and(
				eq(foodEntries.userId, userId),
				gte(foodEntries.date, startDate),
				lte(foodEntries.date, endDate)
			)
		)
		.groupBy(foodEntries.date)
		.orderBy(asc(foodEntries.date));

	return rows;
};

export const getMealTimingData = async (userId: string, startDate: string, endDate: string) => {
	const db = getDB();
	const rm = buildRecipeMacrosCte(db);

	const rows = await db
		.with(rm)
		.select({
			date: foodEntries.date,
			mealType: foodEntries.mealType,
			eatenAt: foodEntries.eatenAt,
			foodId: foodEntries.foodId,
			recipeId: foodEntries.recipeId,
			calories: sql<number>`${caloriesExpr(rm)}`.as('calories'),
			foodName: sql<string>`COALESCE(${foods.name}, ${foodEntries.quickName}, 'Unknown')`.as(
				'foodName'
			)
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.leftJoin(rm, eq(rm.recipeId, foodEntries.recipeId))
		.where(
			and(
				eq(foodEntries.userId, userId),
				gte(foodEntries.date, startDate),
				lte(foodEntries.date, endDate)
			)
		)
		.orderBy(asc(foodEntries.date), asc(foodEntries.eatenAt));

	return rows.map((r) => ({
		date: r.date,
		mealType: r.mealType,
		eatenAt: r.eatenAt ? r.eatenAt.toISOString() : null,
		foodId: r.foodId,
		recipeId: r.recipeId,
		calories: r.calories,
		foodName: r.foodName
	}));
};

export const getSleepFoodCorrelationData = async (
	userId: string,
	startDate: string,
	endDate: string
) => {
	const db = getDB();

	const rm = buildRecipeMacrosCte(db);

	const eveningEntries = await db
		.with(rm)
		.select({
			date: foodEntries.date,
			calories: sql<number>`${caloriesExpr(rm)}`.as('calories'),
			eatenAt: foodEntries.eatenAt
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.leftJoin(rm, eq(rm.recipeId, foodEntries.recipeId))
		.where(
			and(
				eq(foodEntries.userId, userId),
				gte(foodEntries.date, startDate),
				lte(foodEntries.date, endDate),
				sql`EXTRACT(HOUR FROM ${foodEntries.eatenAt} AT TIME ZONE 'Europe/Berlin') >= 17`
			)
		)
		.orderBy(asc(foodEntries.date));

	const sleepRows = await db
		.select({
			entryDate: sleepEntries.entryDate,
			durationMinutes: sleepEntries.durationMinutes,
			quality: sleepEntries.quality
		})
		.from(sleepEntries)
		.where(
			and(
				eq(sleepEntries.userId, userId),
				gte(sleepEntries.entryDate, startDate),
				lte(sleepEntries.entryDate, endDate)
			)
		)
		.orderBy(asc(sleepEntries.entryDate));

	const eveningCaloriesByDate = new Map<string, number>();
	for (const row of eveningEntries) {
		const prev = eveningCaloriesByDate.get(row.date) ?? 0;
		eveningCaloriesByDate.set(row.date, prev + row.calories);
	}

	return sleepRows.map((row) => {
		const prevDate = new Date(row.entryDate + 'T00:00:00Z');
		prevDate.setUTCDate(prevDate.getUTCDate() - 1);
		const prevDateStr = prevDate.toISOString().slice(0, 10);
		return {
			date: row.entryDate,
			eveningCalories: eveningCaloriesByDate.get(prevDateStr) ?? null,
			sleepDurationMinutes: row.durationMinutes,
			sleepQuality: row.quality
		};
	});
};
