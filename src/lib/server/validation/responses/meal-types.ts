import 'zod-openapi';
import { z } from 'zod';

const mealTypeSchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		name: z.string(),
		sortOrder: z.number().int(),
		createdAt: z.string().optional()
	})
	.meta({ id: 'MealType' });

export const mealTypesListResponseSchema = z
	.object({
		mealTypes: z.array(mealTypeSchema)
	})
	.meta({ id: 'MealTypesListResponse' });

export const mealTypeResponseSchema = z
	.object({
		mealType: mealTypeSchema
	})
	.meta({ id: 'MealTypeResponse' });
