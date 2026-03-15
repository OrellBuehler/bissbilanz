import 'zod-openapi';
import { z } from 'zod';

export const goalsResponseSchema = z
	.object({
		goals: z
			.object({
				id: z.string().uuid().optional(),
				userId: z.string().uuid().optional(),
				calorieGoal: z.number(),
				proteinGoal: z.number(),
				carbGoal: z.number(),
				fatGoal: z.number(),
				fiberGoal: z.number(),
				sodiumGoal: z.number().nullable().optional(),
				sugarGoal: z.number().nullable().optional(),
				createdAt: z.string().optional(),
				updatedAt: z.string().optional()
			})
			.meta({ id: 'Goals' })
			.nullable()
	})
	.meta({ id: 'GoalsResponse' });

export const goalsSetResponseSchema = z
	.object({
		goals: goalsResponseSchema.shape.goals.unwrap()
	})
	.meta({ id: 'GoalsSetResponse' });
