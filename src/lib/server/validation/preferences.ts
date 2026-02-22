import { z } from 'zod';

const timeStringSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const favoriteMealTimeframeInputSchema = z
	.object({
		mealType: z.string().min(1),
		customMealTypeId: z.string().uuid().nullable().optional(),
		startTime: timeStringSchema,
		endTime: timeStringSchema
	})
	.strict();

export const preferencesUpdateSchema = z
	.object({
		showFavoritesWidget: z.boolean().optional(),
		showSupplementsWidget: z.boolean().optional(),
		showWeightWidget: z.boolean().optional(),
		widgetOrder: z.array(z.enum(['chart', 'favorites', 'supplements', 'weight', 'summary', 'daylog'])).optional(),
		startPage: z.enum(['dashboard', 'favorites']).optional(),
		favoriteTapAction: z.enum(['instant', 'picker']).optional(),
		favoriteMealAssignmentMode: z.enum(['time_based', 'ask_meal']).optional(),
		favoriteMealTimeframes: z.array(favoriteMealTimeframeInputSchema).optional(),
		locale: z.enum(['en', 'de']).optional()
	})
	.strict();
