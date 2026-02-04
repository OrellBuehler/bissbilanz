import { z } from 'zod';

const coerceOptionalNumber = (fallback: number) =>
	z.preprocess(
		(value) => (value === undefined || value === null || value === '' ? undefined : value),
		z.coerce.number().int().min(0).default(fallback)
	);

export const paginationSchema = z.object({
	limit: z.preprocess(
		(value) => (value === undefined || value === null || value === '' ? undefined : value),
		z.coerce.number().int().min(1).max(200).default(100)
	),
	offset: coerceOptionalNumber(0)
});
