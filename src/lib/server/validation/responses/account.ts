import { z } from 'zod';

export const accountResponseSchema = z
	.object({
		user: z
			.object({
				email: z.string().nullable(),
				name: z.string().nullable(),
				createdAt: z.string().nullable()
			})
			.meta({ id: 'AccountUser' }),
		dataRange: z
			.object({
				earliest: z.string().nullable(),
				latest: z.string().nullable()
			})
			.meta({ id: 'AccountDataRange' })
	})
	.meta({ id: 'AccountResponse' });
