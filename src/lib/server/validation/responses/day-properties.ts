import 'zod-openapi';
import { z } from 'zod';

const dayPropertiesSchema = z
	.object({
		date: z.string(),
		isFastingDay: z.boolean(),
		notes: z.string().nullable(),
		waterMl: z.number().int().nullable(),
		activityCalories: z.number().int().nullable(),
		activityNote: z.string().nullable()
	})
	.meta({ id: 'DayProperties' });

export const dayPropertiesResponseSchema = z
	.object({
		properties: dayPropertiesSchema.nullable()
	})
	.meta({ id: 'DayPropertiesResponse' });

export const dayPropertiesRangeResponseSchema = z
	.object({
		data: z.array(dayPropertiesSchema)
	})
	.meta({ id: 'DayPropertiesRangeResponse' });
