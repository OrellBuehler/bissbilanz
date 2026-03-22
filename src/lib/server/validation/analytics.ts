import 'zod-openapi';
import { z } from 'zod';

export const analyticsDateRangeSchema = z
	.object({
		startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
	})
	.meta({ id: 'AnalyticsDateRange' });
