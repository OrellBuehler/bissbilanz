import { z } from 'zod';

export const maintenanceDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const maintenanceMuscleRatioSchema = z.coerce.number().min(0).max(1);
