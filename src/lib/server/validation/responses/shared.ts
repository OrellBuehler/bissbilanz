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

// SvelteKit's `error(status, 'message')` helper serializes to `{ message }`,
// not the `{ error }` shape the rest of the API returns via json({ error }).
// Routes that throw error() directly (the mobile sign-in endpoints) document
// their failures with this schema instead of errorResponseSchema.
export const messageErrorResponseSchema = z
	.object({
		message: z.string()
	})
	.meta({ id: 'MessageErrorResponse' });
