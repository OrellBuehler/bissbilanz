import { z } from 'zod';

export const accountResponseSchema = z
	.object({
		user: z
			.object({
				email: z.string().nullable(),
				name: z.string().nullable(),
				createdAt: z.string().nullable()
			})
			.meta({ id: 'AccountUser' })
	})
	.meta({ id: 'AccountResponse' });
