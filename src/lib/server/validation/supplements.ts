import 'zod-openapi';
import { z } from 'zod';
import { scheduleTypeValues } from '../../supplement-units';
import { foodCreateSchema } from './foods';

// An ingredient either references an existing food (foodId) or creates a new one (food)
export const ingredientSchema = z
	.object({
		foodId: z.string().uuid().optional(),
		food: foodCreateSchema.optional(),
		servings: z.coerce.number().positive().optional(),
		sortOrder: z.coerce.number().int().optional()
	})
	.meta({ id: 'SupplementIngredientInput' })
	.refine((data) => Boolean(data.foodId) !== Boolean(data.food), {
		message: 'Each ingredient must provide either foodId or food, not both',
		path: ['foodId']
	});

export const supplementCreateSchema = z
	.object({
		name: z.string().min(1),
		scheduleType: z.enum(scheduleTypeValues),
		scheduleDays: z.array(z.coerce.number().int().min(0).max(6)).optional().nullable(),
		scheduleStartDate: z.string().optional().nullable(),
		isActive: z.coerce.boolean().optional(),
		sortOrder: z.coerce.number().int().optional(),
		timeOfDay: z.enum(['morning', 'noon', 'evening']).nullable().optional(),
		ingredients: z.array(ingredientSchema).min(1).max(50)
	})
	.meta({ id: 'SupplementCreate' })
	.refine(
		(data) => {
			if (data.scheduleType === 'weekly' || data.scheduleType === 'specific_days') {
				return data.scheduleDays && data.scheduleDays.length > 0;
			}
			return true;
		},
		{ message: 'scheduleDays required for weekly/specific_days schedules', path: ['scheduleDays'] }
	);

export const supplementUpdateSchema = z
	.object({
		name: z.string().min(1).optional(),
		scheduleType: z.enum(scheduleTypeValues).optional(),
		scheduleDays: z.array(z.coerce.number().int().min(0).max(6)).optional().nullable(),
		scheduleStartDate: z.string().optional().nullable(),
		isActive: z.coerce.boolean().optional(),
		sortOrder: z.coerce.number().int().optional(),
		timeOfDay: z.enum(['morning', 'noon', 'evening']).nullable().optional(),
		ingredients: z.array(ingredientSchema).min(1).max(50).optional()
	})
	.meta({ id: 'SupplementUpdate' });

export const supplementLogSchema = z
	.object({
		date: z.string().optional() // defaults to today server-side
	})
	.meta({ id: 'SupplementLogCreate' });
