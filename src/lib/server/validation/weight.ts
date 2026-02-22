import { z } from 'zod';

export const weightCreateSchema = z.object({
	weightKg: z.coerce.number().positive().max(500),
	entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	notes: z.string().optional().nullable()
});

export const weightUpdateSchema = z.object({
	weightKg: z.coerce.number().positive().max(500).optional(),
	entryDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	notes: z.string().optional().nullable()
});
