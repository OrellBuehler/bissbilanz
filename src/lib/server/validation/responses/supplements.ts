import 'zod-openapi';
import { z } from 'zod';

const supplementIngredientSchema = z
	.object({
		id: z.string().uuid(),
		supplementId: z.string().uuid(),
		name: z.string(),
		dosage: z.number(),
		dosageUnit: z.string(),
		sortOrder: z.number().int()
	})
	.meta({ id: 'SupplementIngredient' });

const supplementSchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		name: z.string(),
		dosage: z.number(),
		dosageUnit: z.string(),
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
		id: z.string().uuid(),
		supplementId: z.string().uuid(),
		userId: z.string().uuid(),
		date: z.string(),
		takenAt: z.string(),
		createdAt: z.string().optional()
	})
	.meta({ id: 'SupplementLog' });

const historyItemSchema = z
	.object({
		log: supplementLogSchema,
		supplementName: z.string(),
		dosage: z.number(),
		dosageUnit: z.string()
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
