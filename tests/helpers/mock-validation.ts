/**
 * Complete validation schema stubs for mock.module('$lib/server/validation').
 *
 * Every test file that mocks the validation module MUST include all exports,
 * because Bun's mock.module is process-global. If a mock is missing an export,
 * other test files that import it will fail with "Export named X not found".
 *
 * Usage in test files:
 *   import { allValidationSchemas } from '../helpers/mock-validation';
 *   mock.module('$lib/server/validation', () => ({
 *       ...allValidationSchemas,
 *       // override specific schemas as needed
 *   }));
 */

const passthrough = {
	safeParse: (data: any) => ({ success: true, data: data ?? {} }),
	parse: (data: any) => data ?? {}
};

export const allValidationSchemas = {
	foodCreateSchema: passthrough,
	foodUpdateSchema: passthrough,
	entryCreateSchema: passthrough,
	entryUpdateSchema: passthrough,
	goalsSchema: passthrough,
	mealTypeCreateSchema: passthrough,
	mealTypeUpdateSchema: passthrough,
	paginationSchema: {
		safeParse: (data: any) => ({
			success: true,
			data: {
				limit: Number(data?.limit) || 50,
				offset: Number(data?.offset) || 0
			}
		}),
		parse: (data: any) => ({
			limit: Number(data?.limit) || 50,
			offset: Number(data?.offset) || 0
		})
	},
	recipeIngredientSchema: passthrough,
	recipeCreateSchema: passthrough,
	recipeUpdateSchema: passthrough,
	ingredientSchema: passthrough,
	supplementCreateSchema: passthrough,
	supplementUpdateSchema: passthrough,
	supplementLogSchema: passthrough,
	favoriteMealTimeframeInputSchema: passthrough,
	preferencesUpdateSchema: passthrough,
	weightCreateSchema: passthrough,
	weightUpdateSchema: passthrough
};
