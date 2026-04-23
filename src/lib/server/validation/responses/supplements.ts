import 'zod-openapi';
import { z } from 'zod';

const backingFoodSchema = z
	.object({
		id: z.string().uuid(),
		name: z.string(),
		brand: z.string().nullable(),
		kind: z.enum(['food', 'supplement']),
		servingSize: z.number(),
		servingUnit: z.string(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		ingredientsText: z.string().nullable().optional()
	})
	.passthrough()
	.meta({ id: 'SupplementBackingFood' });

const supplementIngredientSchema = z
	.object({
		id: z.string().uuid(),
		supplementId: z.string().uuid(),
		foodId: z.string().uuid(),
		servings: z.number(),
		sortOrder: z.number().int(),
		food: backingFoodSchema
	})
	.meta({ id: 'SupplementIngredient' });

const supplementSchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		name: z.string(),
		scheduleType: z.enum(['daily', 'every_other_day', 'weekly', 'specific_days']),
		scheduleDays: z.array(z.number().int()).nullable(),
		scheduleStartDate: z.string().nullable(),
		isActive: z.boolean().default(true),
		sortOrder: z.number().int(),
		timeOfDay: z.enum(['morning', 'noon', 'evening']).nullable(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
		ingredients: z.array(supplementIngredientSchema)
	})
	.meta({ id: 'Supplement' });

const checklistItemSchema = z
	.object({
		supplement: supplementSchema,
		taken: z.boolean(),
		takenAt: z.string().nullable()
	})
	.meta({ id: 'SupplementChecklistItem' });

const supplementLogSchema = z
	.object({
		supplementId: z.string().uuid(),
		date: z.string(),
		takenAt: z.string(),
		entryIds: z.array(z.string().uuid())
	})
	.meta({ id: 'SupplementLog' });

const historyItemSchema = z
	.object({
		supplementId: z.string().uuid(),
		supplementName: z.string(),
		date: z.string(),
		takenAt: z.string()
	})
	.meta({ id: 'SupplementHistoryItem' });

export const supplementsListResponseSchema = z
	.object({
		supplements: z.array(supplementSchema)
	})
	.meta({ id: 'SupplementsListResponse' });

export const supplementResponseSchema = z
	.object({
		supplement: supplementSchema
	})
	.meta({ id: 'SupplementResponse' });

export const supplementChecklistResponseSchema = z
	.object({
		checklist: z.array(checklistItemSchema),
		date: z.string()
	})
	.meta({ id: 'SupplementChecklistResponse' });

export const supplementLogResponseSchema = z
	.object({
		log: supplementLogSchema
	})
	.meta({ id: 'SupplementLogResponse' });

export const supplementHistoryResponseSchema = z
	.object({
		history: z.array(historyItemSchema)
	})
	.meta({ id: 'SupplementHistoryResponse' });
