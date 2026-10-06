import { z } from 'zod';

const coerceOptionalNumber = (fallback: number) =>
	z.preprocess(
		(value) => (value === undefined || value === null || value === '' ? undefined : value),
		z.coerce.number().int().min(0).default(fallback)
	);

const pageSchema = (maxLimit: number) =>
	z.object({
		limit: z.preprocess(
			(value) => (value === undefined || value === null || value === '' ? undefined : value),
			z.coerce.number().int().min(1).max(maxLimit).default(100)
		),
		offset: coerceOptionalNumber(0)
	});

export const paginationSchema = pageSchema(200);

/** Delta-syncing a 100k-food account in 200-row pages would take 500 round trips. */
export const foodsPaginationSchema = pageSchema(1000);
