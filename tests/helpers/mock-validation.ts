/**
 * Complete validation schema stubs for vi.mock('$lib/server/validation').
 *
 * Every test file that mocks the validation module MUST include all exports,
 * because Bun's mock.module is process-global. If a mock is missing an export,
 * other test files that import it will fail with "Export named X not found".
 *
 * LIMITATION: These stubs only implement `safeParse` and `parse`. Other Zod
 * schema methods (e.g., `.optional()`, `.array()`, `.transform()`) are NOT
 * mocked. If a route handler calls a method beyond `safeParse`/`parse`, the
 * test will fail with "is not a function". In that case, either add the
 * method here or use a real Zod schema with `.passthrough()`.
 *
 * Usage in test files:
 *   import { allValidationSchemas } from '../helpers/mock-validation';
 *   vi.mock('$lib/server/validation', () => ({
 *       ...allValidationSchemas,
 *       // override specific schemas as needed
 *   }));
 */

const passthrough = {
	safeParse: (data: any) => ({ success: true, data: data ?? {} }),
	parse: (data: any) => {
		if (data === undefined) throw new Error('Mock schema received undefined input — likely missing request body');
		return data;
	}
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
