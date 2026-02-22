import { z } from 'zod';

export const mealTypeCreateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(50, 'Name must be 50 characters or less'),
	sortOrder: z.number().int().min(0, 'Sort order must be 0 or greater')
});

export const mealTypeUpdateSchema = z.object({
	name: z
		.string()
		.min(1, 'Name is required')
		.max(50, 'Name must be 50 characters or less')
		.optional(),
	sortOrder: z.number().int().min(0, 'Sort order must be 0 or greater').optional()
});
