import 'zod-openapi';
import { z } from 'zod';

export const goalsSchema = z
	.object({
		calorieGoal: z.coerce.number().positive(),
		proteinGoal: z.coerce.number().nonnegative(),
		carbGoal: z.coerce.number().nonnegative(),
		fatGoal: z.coerce.number().nonnegative(),
		fiberGoal: z.coerce.number().nonnegative(),
		// Advanced nutrient goals (optional)
		sodiumGoal: z.coerce.number().nonnegative().optional().nullable(),
		sugarGoal: z.coerce.number().nonnegative().optional().nullable()
	})
	.meta({ id: 'GoalsUpdate' });
