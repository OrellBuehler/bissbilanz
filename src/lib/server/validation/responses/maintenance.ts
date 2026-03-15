import 'zod-openapi';
import { z } from 'zod';

export const maintenanceResponseSchema = z
	.object({
		result: z
			.object({
				maintenanceCalories: z.number(),
				deficit: z.number(),
				surplus: z.number()
			})
			.meta({ id: 'MaintenanceResult' }),
		meta: z
			.object({
				weightEntries: z.number().int(),
				foodEntryDays: z.number().int(),
				totalDays: z.number().int(),
				coverage: z.number(),
				firstWeight: z.number(),
				lastWeight: z.number(),
				startDate: z.string(),
				endDate: z.string()
			})
			.meta({ id: 'MaintenanceMeta' })
	})
	.meta({ id: 'MaintenanceResponse' });
