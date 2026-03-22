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
		eatenAt: z.string().nullable(),
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
