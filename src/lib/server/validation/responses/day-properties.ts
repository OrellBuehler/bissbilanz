import 'zod-openapi';
import { z } from 'zod';

const dayPropertiesSchema = z
	.object({
		date: z.string(),
		isFastingDay: z.boolean()
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
