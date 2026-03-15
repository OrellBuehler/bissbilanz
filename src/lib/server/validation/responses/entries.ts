import 'zod-openapi';
import { z } from 'zod';

const entryListItemSchema = z
	.object({
		id: z.string().uuid(),
		mealType: z.string(),
		servings: z.number(),
		notes: z.string().nullable(),
		foodId: z.string().uuid().nullable(),
		recipeId: z.string().uuid().nullable(),
		quickName: z.string().nullable(),
		quickCalories: z.number().nullable(),
		quickProtein: z.number().nullable(),
		quickCarbs: z.number().nullable(),
		quickFat: z.number().nullable(),
		quickFiber: z.number().nullable(),
		foodName: z.string().nullable(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		eatenAt: z.string().nullable(),
		createdAt: z.string().optional(),
		servingSize: z.number().nullable(),
		servingUnit: z.string().nullable()
	})
	.meta({ id: 'EntryListItem' });

const entryRawSchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		foodId: z.string().uuid().nullable(),
		recipeId: z.string().uuid().nullable(),
		date: z.string(),
		mealType: z.string(),
		servings: z.number(),
		notes: z.string().nullable(),
		quickName: z.string().nullable(),
		quickCalories: z.number().nullable(),
		quickProtein: z.number().nullable(),
		quickCarbs: z.number().nullable(),
		quickFat: z.number().nullable(),
		quickFiber: z.number().nullable(),
		eatenAt: z.string().nullable(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional()
	})
	.meta({ id: 'Entry' });

const entryRangeSchema = z
	.object({
		id: z.string().uuid(),
		date: z.string(),
		mealType: z.string(),
		servings: z.number(),
		notes: z.string().nullable(),
		foodId: z.string().uuid().nullable(),
		recipeId: z.string().uuid().nullable(),
		foodName: z.string().nullable(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number()
	})
	.meta({ id: 'EntryRangeItem' });

export const entriesListResponseSchema = z
	.object({
		entries: z.array(entryListItemSchema),
		total: z.number().int()
	})
	.meta({ id: 'EntriesListResponse' });

export const entryResponseSchema = z
	.object({
		entry: entryRawSchema
	})
	.meta({ id: 'EntryResponse' });

export const entriesCopyResponseSchema = z
	.object({
		entries: z.array(entryRawSchema),
		count: z.number().int()
	})
	.meta({ id: 'EntriesCopyResponse' });

export const entriesRangeResponseSchema = z
	.object({
		entries: z.array(entryRangeSchema)
	})
	.meta({ id: 'EntriesRangeResponse' });
