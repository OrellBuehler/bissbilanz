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

const buildRecipeExtendedCte = (db: ReturnType<typeof getDB>) =>
	db.$with('recipe_extended').as(
		db
			.select({
				recipeId: recipeIngredients.recipeId,
				reOmega3: sql<
					number | null
				>`SUM(${foods.omega3} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
					're_omega3'
				),
				reOmega6: sql<
					number | null
				>`SUM(${foods.omega6} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
					're_omega6'
				),
				reSodium: sql<
					number | null
				>`SUM(${foods.sodium} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
					're_sodium'
				),
				reCaffeine: sql<
					number | null
				>`SUM(${foods.caffeine} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
					're_caffeine'
				),
				reSaturatedFat: sql<
					number | null
				>`SUM(${foods.saturatedFat} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
					're_saturated_fat'
				),
				reTransFat: sql<
					number | null
				>`SUM(${foods.transFat} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
					're_trans_fat'
				),
				reVitaminC: sql<
					number | null
				>`SUM(${foods.vitaminC} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
					're_vitamin_c'
				),
				reVitaminD: sql<
					number | null
				>`SUM(${foods.vitaminD} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
					're_vitamin_d'
				),
				reVitaminE: sql<
					number | null
				>`SUM(${foods.vitaminE} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
					're_vitamin_e'
				),
				reAlcohol: sql<
					number | null
				>`SUM(${foods.alcohol} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
					're_alcohol'
				),
				reAddedSugars: sql<
					number | null
				>`SUM(${foods.addedSugars} * ${recipeIngredients.quantity} / NULLIF(${foods.servingSize}, 0)) / NULLIF(${recipes.totalServings}, 0)`.as(
					're_added_sugars'
				)
			})
			.from(recipeIngredients)
			.innerJoin(foods, eq(foods.id, recipeIngredients.foodId))
			.innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
			.groupBy(recipeIngredients.recipeId, recipes.totalServings)
	);

type RecipeExtendedCte = ReturnType<typeof buildRecipeExtendedCte>;

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
	const re = buildRecipeExtendedCte(db);

	const rows = await db
		.with(rm, re)
		.select({
			date: foodEntries.date,
			calories: sql<number>`COALESCE(SUM(${caloriesExpr(rm)}), 0)`.as('calories'),
			protein: sql<number>`COALESCE(SUM(${proteinExpr(rm)}), 0)`.as('protein'),
			carbs: sql<number>`COALESCE(SUM(${carbsExpr(rm)}), 0)`.as('carbs'),
			fat: sql<number>`COALESCE(SUM(${fatExpr(rm)}), 0)`.as('fat'),
			fiber: sql<number>`COALESCE(SUM(${fiberExpr(rm)}), 0)`.as('fiber'),
			omega3: sql<
				number | null
			>`SUM(COALESCE(${foods.omega3}, ${re.reOmega3}) * ${foodEntries.servings})`.as('omega3'),
			omega6: sql<
				number | null
			>`SUM(COALESCE(${foods.omega6}, ${re.reOmega6}) * ${foodEntries.servings})`.as('omega6'),
			sodium: sql<
				number | null
			>`SUM(COALESCE(${foods.sodium}, ${re.reSodium}) * ${foodEntries.servings})`.as('sodium'),
			caffeine: sql<
				number | null
			>`SUM(COALESCE(${foods.caffeine}, ${re.reCaffeine}) * ${foodEntries.servings})`.as(
				'caffeine'
			),
			saturatedFat: sql<
				number | null
			>`SUM(COALESCE(${foods.saturatedFat}, ${re.reSaturatedFat}) * ${foodEntries.servings})`.as(
				'saturated_fat'
			),
			transFat: sql<
				number | null
			>`SUM(COALESCE(${foods.transFat}, ${re.reTransFat}) * ${foodEntries.servings})`.as(
				'trans_fat'
			),
			vitaminC: sql<
				number | null
			>`SUM(COALESCE(${foods.vitaminC}, ${re.reVitaminC}) * ${foodEntries.servings})`.as(
				'vitamin_c'
			),
			vitaminD: sql<
				number | null
			>`SUM(COALESCE(${foods.vitaminD}, ${re.reVitaminD}) * ${foodEntries.servings})`.as(
				'vitamin_d'
			),
			vitaminE: sql<
				number | null
			>`SUM(COALESCE(${foods.vitaminE}, ${re.reVitaminE}) * ${foodEntries.servings})`.as(
				'vitamin_e'
			),
			alcohol: sql<
				number | null
			>`SUM(COALESCE(${foods.alcohol}, ${re.reAlcohol}) * ${foodEntries.servings})`.as('alcohol'),
			addedSugars: sql<
				number | null
			>`SUM(COALESCE(${foods.addedSugars}, ${re.reAddedSugars}) * ${foodEntries.servings})`.as(
				'added_sugars'
			)
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.leftJoin(rm, eq(rm.recipeId, foodEntries.recipeId))
		.leftJoin(re, eq(re.recipeId, foodEntries.recipeId))
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

export const getExtendedNutrientEntries = async (
	userId: string,
	startDate: string,
	endDate: string
) => {
	const db = getDB();
	const rm = buildRecipeMacrosCte(db);
	const re = buildRecipeExtendedCte(db);

	const rows = await db
		.with(rm, re)
		.select({
			date: foodEntries.date,
			mealType: foodEntries.mealType,
			eatenAt: foodEntries.eatenAt,
			foodId: foodEntries.foodId,
			recipeId: foodEntries.recipeId,
			foodName: sql<string>`COALESCE(${foods.name}, ${foodEntries.quickName}, 'Unknown')`.as(
				'food_name'
			),
			calories: sql<number>`${caloriesExpr(rm)}`.as('calories'),
			protein: sql<number>`${proteinExpr(rm)}`.as('protein'),
			carbs: sql<number>`${carbsExpr(rm)}`.as('carbs'),
			fat: sql<number>`${fatExpr(rm)}`.as('fat'),
			fiber: sql<number>`${fiberExpr(rm)}`.as('fiber'),
			novaGroup: sql<number | null>`${foods.novaGroup}`.as('nova_group'),
			omega3: sql<
				number | null
			>`COALESCE(${foods.omega3}, ${re.reOmega3}) * ${foodEntries.servings}`.as('omega3'),
			omega6: sql<
				number | null
			>`COALESCE(${foods.omega6}, ${re.reOmega6}) * ${foodEntries.servings}`.as('omega6'),
			sodium: sql<
				number | null
			>`COALESCE(${foods.sodium}, ${re.reSodium}) * ${foodEntries.servings}`.as('sodium'),
			caffeine: sql<
				number | null
			>`COALESCE(${foods.caffeine}, ${re.reCaffeine}) * ${foodEntries.servings}`.as('caffeine'),
			saturatedFat: sql<
				number | null
			>`COALESCE(${foods.saturatedFat}, ${re.reSaturatedFat}) * ${foodEntries.servings}`.as(
				'saturated_fat'
			),
			transFat: sql<
				number | null
			>`COALESCE(${foods.transFat}, ${re.reTransFat}) * ${foodEntries.servings}`.as('trans_fat'),
			vitaminC: sql<
				number | null
			>`COALESCE(${foods.vitaminC}, ${re.reVitaminC}) * ${foodEntries.servings}`.as('vitamin_c'),
			vitaminD: sql<
				number | null
			>`COALESCE(${foods.vitaminD}, ${re.reVitaminD}) * ${foodEntries.servings}`.as('vitamin_d'),
			vitaminE: sql<
				number | null
			>`COALESCE(${foods.vitaminE}, ${re.reVitaminE}) * ${foodEntries.servings}`.as('vitamin_e'),
			alcohol: sql<
				number | null
			>`COALESCE(${foods.alcohol}, ${re.reAlcohol}) * ${foodEntries.servings}`.as('alcohol'),
			addedSugars: sql<
				number | null
			>`COALESCE(${foods.addedSugars}, ${re.reAddedSugars}) * ${foodEntries.servings}`.as(
				'added_sugars'
			)
		})
		.from(foodEntries)
		.leftJoin(foods, eq(foodEntries.foodId, foods.id))
		.leftJoin(rm, eq(rm.recipeId, foodEntries.recipeId))
		.leftJoin(re, eq(re.recipeId, foodEntries.recipeId))
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
		foodName: r.foodName,
		calories: r.calories,
		protein: r.protein,
		carbs: r.carbs,
		fat: r.fat,
		fiber: r.fiber,
		novaGroup: r.novaGroup,
		omega3: r.omega3,
		omega6: r.omega6,
		sodium: r.sodium,
		caffeine: r.caffeine,
		saturatedFat: r.saturatedFat,
		transFat: r.transFat,
		vitaminC: r.vitaminC,
		vitaminD: r.vitaminD,
		vitaminE: r.vitaminE,
		alcohol: r.alcohol,
		addedSugars: r.addedSugars
	}));
};

export const getFoodDiversityData = async (userId: string, startDate: string, endDate: string) => {
	const db = getDB();

	const rows = await db
		.select({
			date: foodEntries.date,
			foodId: foodEntries.foodId,
			recipeId: foodEntries.recipeId,
			foodName: sql<string>`COALESCE(${foods.name}, ${foodEntries.quickName}, 'Unknown')`.as(
				'food_name'
			),
			novaGroup: sql<number | null>`${foods.novaGroup}`.as('nova_group')
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
		.orderBy(asc(foodEntries.date));

	return rows;
};
