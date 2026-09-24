import 'zod-openapi';
import { z } from 'zod';
import { reminderKindValues } from '../schema';

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM (24h)');

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

const dedupeSortWeekdays = (days: number[]) => [...new Set(days)].sort((a, b) => a - b);

/** Not sent → every day. Sent → deduped, sorted, and must not be empty. */
const weekdaysCreateSchema = z
	.array(z.coerce.number().int().min(0).max(6))
	.max(7)
	.optional()
	.transform((days) => dedupeSortWeekdays(days && days.length > 0 ? days : ALL_WEEKDAYS));

const weekdaysUpdateSchema = z
	.array(z.coerce.number().int().min(0).max(6))
	.min(1, 'Select at least one day')
	.max(7)
	.transform(dedupeSortWeekdays)
	.optional();

const mealTypeSchema = z.string().min(1).max(50).optional().nullable();

const MEAL_TYPE_MESSAGE = "mealType is required when kind is 'meal', and must be omitted otherwise";

export const reminderCreateSchema = z
	.object({
		kind: z.enum(reminderKindValues),
		mealType: mealTypeSchema,
		time: timeSchema,
		weekdays: weekdaysCreateSchema,
		enabled: z.coerce.boolean().optional()
	})
	.meta({ id: 'ReminderCreate' })
	.refine((data) => (data.kind === 'meal' ? !!data.mealType : data.mealType == null), {
		message: MEAL_TYPE_MESSAGE,
		path: ['mealType']
	});

export const reminderUpdateSchema = z
	.object({
		kind: z.enum(reminderKindValues).optional(),
		mealType: mealTypeSchema,
		time: timeSchema.optional(),
		weekdays: weekdaysUpdateSchema,
		enabled: z.coerce.boolean().optional()
	})
	.meta({ id: 'ReminderUpdate' })
	.refine(
		(data) => {
			if (data.kind === undefined) return true;
			return data.kind === 'meal' ? !!data.mealType : data.mealType == null;
		},
		{ message: MEAL_TYPE_MESSAGE, path: ['mealType'] }
	);
