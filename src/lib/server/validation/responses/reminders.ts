import 'zod-openapi';
import { z } from 'zod';

const reminderSchema = z
	.object({
		id: z.string().uuid(),
		userId: z.string().uuid(),
		kind: z.enum(['weight', 'meal', 'sleep']),
		mealType: z.string().nullable(),
		time: z.string(),
		weekdays: z.array(z.number().int()),
		enabled: z.boolean(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional()
	})
	.meta({ id: 'Reminder' });

export const remindersListResponseSchema = z
	.object({
		reminders: z.array(reminderSchema)
	})
	.meta({ id: 'RemindersListResponse' });

export const reminderResponseSchema = z
	.object({
		reminder: reminderSchema
	})
	.meta({ id: 'ReminderResponse' });
