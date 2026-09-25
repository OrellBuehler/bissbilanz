import 'zod-openapi';
import { z } from 'zod';

export const errorResponseSchema = z
	.object({
		error: z.string()
	})
	.meta({ id: 'ErrorResponse' });

export const validationErrorResponseSchema = z
	.object({
		error: z.string(),
		details: z.record(z.string(), z.array(z.string())).optional()
	})
	.meta({ id: 'ValidationErrorResponse' });

export const conflictErrorResponseSchema = z
	.object({
		error: z.string(),
		entryCount: z.number().optional(),
		// `has_entries` on a food delete: rows in recipe_ingredients referencing
		// it, and the distinct recipes among them.
		ingredientCount: z.number().optional(),
		recipeCount: z.number().optional(),
		supplementIngredientCount: z.number().optional()
	})
	.meta({ id: 'ConflictErrorResponse' });
