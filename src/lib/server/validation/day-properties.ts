import { z } from 'zod';

export const dayPropertiesSetSchema = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	isFastingDay: z.boolean()
});
