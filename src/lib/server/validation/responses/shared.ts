import 'zod-openapi';
import { z } from 'zod';

export const errorResponseSchema = z
	.object({
		error: z.string()
	})
	.meta({ id: 'ErrorResponse' });

// KNOWN INACCURACY, deliberately not fixed: validationError() actually sends
// ZodError#format(), a recursive tree with `_errors: string[]` at every level
// rather than this flat Record<string, string[]>. Any schema wide enough to
// describe the real shape (tried z.unknown(), z.record(unknown), an object
// with a `_errors` array plus a catchall) makes oasdiff flag the `details`
// property as a breaking response-type change for every operation that
// references this shared schema (scripts/api/check-breaking.sh). Left as-is
// rather than ship a breaking change; see docs/api-stability.md.
export const validationErrorResponseSchema = z
	.object({
		error: z.string(),
		details: z.record(z.string(), z.array(z.string())).optional()
	})
	.meta({ id: 'ValidationErrorResponse' });

// Named so generated clients get a real type instead of an inline object.
const lastIngredientRecipeSchema = z
	.object({ id: z.string().uuid(), name: z.string() })
	.meta({ id: 'LastIngredientRecipe' });

export const conflictErrorResponseSchema = z
	.object({
		error: z.string(),
		entryCount: z.number().optional(),
		// `has_entries` on a food delete: rows in recipe_ingredients referencing
		// it, and the distinct recipes among them.
		ingredientCount: z.number().optional(),
		recipeCount: z.number().optional(),
		supplementIngredientCount: z.number().optional(),
		// `has_entries` on a food delete: recipes the food is the only ingredient
		// of. Such a delete is refused even with force=true.
		lastIngredientRecipes: z.array(lastIngredientRecipeSchema).optional()
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
