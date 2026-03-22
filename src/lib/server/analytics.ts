import { getDB } from '$lib/server/db';
import { foodEntries, foods, weightEntries, sleepEntries } from '$lib/server/schema';
import { and, eq, gte, lte, sql, asc } from 'drizzle-orm';

export const getWeightFoodSeries = async (userId: string, startDate: string, endDate: string) => {
	const db = getDB();

	const calorieRows = await db
		.select({
			date: foodEntries.date,
			calories: sql<number>`COALESCE(SUM(
				CASE
					WHEN ${foodEntries.foodId} IS NOT NULL THEN ${foods.calories} * ${foodEntries.servings}
					WHEN ${foodEntries.recipeId} IS NOT NULL THEN 0
					ELSE ${foodEntries.quickCalories} * ${foodEntries.servings}
				END
			), 0)`.as('calories')
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
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

	// Compute 7-day moving average for weight
	for (let i = 0; i < series.length; i++) {
		const window = series
			.slice(Math.max(0, i - 6), i + 1)
			.map((r) => r.weightKg)
			.filter((v): v is number => v !== null);
		if (window.length > 0) {
			series[i].movingAvg = window.reduce((a, b) => a + b, 0) / window.length;
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

	const rows = await db
		.select({
			date: foodEntries.date,
			calories: sql<number>`COALESCE(SUM(
				CASE
					WHEN ${foodEntries.foodId} IS NOT NULL THEN ${foods.calories} * ${foodEntries.servings}
					ELSE COALESCE(${foodEntries.quickCalories}, 0) * ${foodEntries.servings}
				END
			), 0)`.as('calories'),
			protein: sql<number>`COALESCE(SUM(
				CASE
					WHEN ${foodEntries.foodId} IS NOT NULL THEN ${foods.protein} * ${foodEntries.servings}
					ELSE COALESCE(${foodEntries.quickProtein}, 0) * ${foodEntries.servings}
				END
			), 0)`.as('protein'),
			carbs: sql<number>`COALESCE(SUM(
				CASE
					WHEN ${foodEntries.foodId} IS NOT NULL THEN ${foods.carbs} * ${foodEntries.servings}
					ELSE COALESCE(${foodEntries.quickCarbs}, 0) * ${foodEntries.servings}
				END
			), 0)`.as('carbs'),
			fat: sql<number>`COALESCE(SUM(
				CASE
					WHEN ${foodEntries.foodId} IS NOT NULL THEN ${foods.fat} * ${foodEntries.servings}
					ELSE COALESCE(${foodEntries.quickFat}, 0) * ${foodEntries.servings}
				END
			), 0)`.as('fat'),
			fiber: sql<number>`COALESCE(SUM(
				CASE
					WHEN ${foodEntries.foodId} IS NOT NULL THEN ${foods.fiber} * ${foodEntries.servings}
					ELSE COALESCE(${foodEntries.quickFiber}, 0) * ${foodEntries.servings}
				END
			), 0)`.as('fiber')
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
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

	const rows = await db
		.select({
			date: foodEntries.date,
			mealType: foodEntries.mealType,
			eatenAt: foodEntries.eatenAt,
			foodId: foodEntries.foodId,
			recipeId: foodEntries.recipeId,
			calories: sql<number>`CASE
				WHEN ${foodEntries.foodId} IS NOT NULL THEN ${foods.calories} * ${foodEntries.servings}
				ELSE COALESCE(${foodEntries.quickCalories}, 0) * ${foodEntries.servings}
			END`.as('calories'),
			foodName: sql<string>`COALESCE(${foods.name}, ${foodEntries.quickName}, 'Unknown')`.as(
				'foodName'
			)
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
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

	const eveningEntries = await db
		.select({
			date: foodEntries.date,
			calories: sql<number>`CASE
				WHEN ${foodEntries.foodId} IS NOT NULL THEN ${foods.calories} * ${foodEntries.servings}
				ELSE COALESCE(${foodEntries.quickCalories}, 0) * ${foodEntries.servings}
			END`.as('calories'),
			eatenAt: foodEntries.eatenAt
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.where(
			and(
				eq(foodEntries.userId, userId),
				gte(foodEntries.date, startDate),
				lte(foodEntries.date, endDate),
				sql`EXTRACT(HOUR FROM ${foodEntries.eatenAt}) >= 17`
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

	return sleepRows.map((row) => ({
		date: row.entryDate,
		eveningCalories: eveningCaloriesByDate.get(row.entryDate) ?? null,
		sleepDurationMinutes: row.durationMinutes,
		sleepQuality: row.quality
	}));
};
