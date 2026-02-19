import { z } from 'zod';
import { scheduleTypeValues } from '../../supplement-units';

export const supplementCreateSchema = z
	.object({
		name: z.string().min(1),
		dosage: z.coerce.number().positive(),
		dosageUnit: z.string().min(1),
		scheduleType: z.enum(scheduleTypeValues),
		scheduleDays: z.array(z.coerce.number().int().min(0).max(6)).optional().nullable(),
		scheduleStartDate: z.string().optional().nullable(),
		isActive: z.coerce.boolean().optional(),
		sortOrder: z.coerce.number().int().optional(),
		timeOfDay: z.enum(['morning', 'noon', 'evening']).nullable().optional()
	})
	.refine(
		(data) => {
			if (data.scheduleType === 'weekly' || data.scheduleType === 'specific_days') {
				return data.scheduleDays && data.scheduleDays.length > 0;
			}
			return true;
		},
		{ message: 'scheduleDays required for weekly/specific_days schedules', path: ['scheduleDays'] }
	);

export const supplementUpdateSchema = z.object({
	name: z.string().min(1).optional(),
	dosage: z.coerce.number().positive().optional(),
	dosageUnit: z.string().min(1).optional(),
	scheduleType: z.enum(scheduleTypeValues).optional(),
	scheduleDays: z.array(z.coerce.number().int().min(0).max(6)).optional().nullable(),
	scheduleStartDate: z.string().optional().nullable(),
	isActive: z.coerce.boolean().optional(),
	sortOrder: z.coerce.number().int().optional(),
	timeOfDay: z.enum(['morning', 'noon', 'evening']).nullable().optional()
});

export const supplementLogSchema = z.object({
	date: z.string().optional() // defaults to today server-side
});
