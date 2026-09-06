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
		sugarGoal: z.coerce.number().nonnegative().optional().nullable(),
		// Body weight target (optional)
		targetWeightKg: z.coerce.number().positive().max(500).optional().nullable(),
		targetDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional()
			.nullable()
	})
	.meta({ id: 'GoalsUpdate' });
