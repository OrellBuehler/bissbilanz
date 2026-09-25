import type { ZodError } from 'zod';

export interface UserProfile {
	id: string;
	email: string | null;
	name: string | null;
	avatarUrl: string | null;
}

export type SuccessResult<T> = { success: true; data: T };
export type ErrorResult = { success: false; error: ZodError | Error };
export type Result<T> = SuccessResult<T> | ErrorResult;

export type DeleteResult =
	| {
			blocked: true;
			entryCount: number;
			ingredientCount?: number;
			// Distinct recipes referencing the food (ingredientCount counts rows,
			// which can exceed this if a food appears twice in one recipe).
			recipeCount?: number;
			supplementIngredientCount?: number;
	  }
	| { blocked: false };
