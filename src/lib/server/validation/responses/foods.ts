import 'zod-openapi';
import { z } from 'zod';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { servingUnitValues } from '$lib/units';

const optNutrient = z.number().nullable().optional();
const nutrientFields = Object.fromEntries(ALL_NUTRIENT_KEYS.map((key) => [key, optNutrient]));

const foodSchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		name: z.string(),
		brand: z.string().nullable(),
		servingSize: z.number(),
		servingUnit: z.enum(servingUnitValues),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		...nutrientFields,
		barcode: z.string().nullable(),
		isFavorite: z.boolean(),
		nutriScore: z.string().nullable(),
		novaGroup: z.number().nullable(),
		additives: z.array(z.string()).nullable(),
		ingredientsText: z.string().nullable(),
		imageUrl: z.string().nullable(),
		createdAt: z.string(),
		updatedAt: z.string()
	})
	.meta({ id: 'Food' });

const recentFoodSchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		name: z.string(),
		brand: z.string().nullable(),
		servingSize: z.number(),
		servingUnit: z.enum(servingUnitValues),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		barcode: z.string().nullable(),
		isFavorite: z.boolean(),
		imageUrl: z.string().nullable(),
		createdAt: z.string(),
		updatedAt: z.string()
	})
	.meta({ id: 'FoodRecent' });

export const foodsListResponseSchema = z
	.object({
		foods: z.array(foodSchema),
		total: z.number()
	})
	.meta({ id: 'FoodsListResponse' });

export const foodResponseSchema = z
	.object({
		food: foodSchema
	})
	.meta({ id: 'FoodResponse' });

export const foodsRecentResponseSchema = z
	.object({
		foods: z.array(recentFoodSchema)
	})
	.meta({ id: 'FoodsRecentResponse' });
