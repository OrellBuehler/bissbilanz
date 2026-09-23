import 'zod-openapi';
import { z } from 'zod';

export const MAX_WATER_ML = 20000;
export const MAX_ACTIVITY_CALORIES = 20000;

export const activityCaloriesSourceValues = ['manual', 'apple_health', 'health_connect'] as const;
export type ActivityCaloriesSource = (typeof activityCaloriesSourceValues)[number];

// PATCH-style: an omitted field is left unchanged, an explicit null clears it.
export const dayPropertiesSetSchema = z
	.object({
		date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		isFastingDay: z.boolean().optional(),
		notes: z.string().max(2000).optional().nullable(),
		waterMl: z.coerce.number().int().min(0).max(MAX_WATER_ML).optional().nullable(),
		activityCalories: z.coerce
			.number()
			.int()
			.min(0)
			.max(MAX_ACTIVITY_CALORIES)
			.optional()
			.nullable(),
		// Where activityCalories came from. Omitted keeps the stored value (or
		// defaults to 'manual' when activityCalories is set in the same patch);
		// explicit null clears it back to unset/manual.
		activityCaloriesSource: z.enum(activityCaloriesSourceValues).optional().nullable(),
		activityNote: z.string().max(200).optional().nullable()
	})
	.meta({ id: 'DayPropertiesSet' });

export type DayPropertiesPatch = Omit<z.infer<typeof dayPropertiesSetSchema>, 'date'>;
