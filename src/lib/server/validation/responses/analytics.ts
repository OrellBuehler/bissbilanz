import 'zod-openapi';
import { z } from 'zod';

const dailyWeightFoodSchema = z
	.object({
		date: z.string(),
		calories: z.number().nullable(),
		weightKg: z.number().nullable(),
		movingAvg: z.number().nullable()
	})
	.meta({ id: 'DailyWeightFood' });

const dailyNutrientsSchema = z
	.object({
		date: z.string(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number()
	})
	.meta({ id: 'DailyNutrients' });

const mealTimingEntrySchema = z
	.object({
		date: z.string(),
		mealType: z.string(),
		eatenAt: z.string(),
		foodId: z.string().nullable(),
		recipeId: z.string().nullable(),
		calories: z.number(),
		foodName: z.string()
	})
	.meta({ id: 'MealTimingEntry' });

export const weightFoodResponseSchema = z
	.object({
		data: z.array(dailyWeightFoodSchema)
	})
	.meta({ id: 'WeightFoodResponse' });

export const nutrientsDailyResponseSchema = z
	.object({
		data: z.array(dailyNutrientsSchema)
	})
	.meta({ id: 'NutrientsDailyResponse' });

export const mealTimingResponseSchema = z
	.object({
		data: z.array(mealTimingEntrySchema)
	})
	.meta({ id: 'MealTimingResponse' });

const sleepFoodCorrelationEntrySchema = z
	.object({
		date: z.string(),
		eveningCalories: z.number().nullable(),
		sleepDurationMinutes: z.number().int(),
		sleepQuality: z.number().int()
	})
	.meta({ id: 'SleepFoodCorrelationEntry' });

const foodDiversityEntrySchema = z
	.object({
		date: z.string(),
		foodId: z.string().uuid().nullable(),
		recipeId: z.string().uuid().nullable(),
		foodName: z.string(),
		novaGroup: z.number().int().nullable()
	})
	.meta({ id: 'FoodDiversityEntry' });

export const foodDiversityResponseSchema = z
	.object({
		data: z.array(foodDiversityEntrySchema)
	})
	.meta({ id: 'FoodDiversityResponse' });

const extendedNutrientEntrySchema = z
	.object({
		date: z.string(),
		mealType: z.string(),
		eatenAt: z.string(),
		foodId: z.string().uuid().nullable(),
		recipeId: z.string().uuid().nullable(),
		foodName: z.string(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		novaGroup: z.number().int().nullable(),
		omega3: z.number().nullable(),
		omega6: z.number().nullable(),
		sodium: z.number().nullable(),
		caffeine: z.number().nullable(),
		saturatedFat: z.number().nullable(),
		transFat: z.number().nullable(),
		vitaminC: z.number().nullable(),
		vitaminD: z.number().nullable(),
		vitaminE: z.number().nullable(),
		alcohol: z.number().nullable(),
		addedSugars: z.number().nullable()
	})
	.meta({ id: 'ExtendedNutrientEntry' });

export const nutrientsExtendedResponseSchema = z
	.object({
		data: z.array(extendedNutrientEntrySchema)
	})
	.meta({ id: 'NutrientsExtendedResponse' });

export const sleepFoodCorrelationResponseSchema = z
	.object({
		data: z.array(sleepFoodCorrelationEntrySchema)
	})
	.meta({ id: 'SleepFoodCorrelationResponse' });
