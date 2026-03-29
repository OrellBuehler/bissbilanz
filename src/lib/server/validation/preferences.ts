import 'zod-openapi';
import { z } from 'zod';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';

const timeStringSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const favoriteMealTimeframeInputSchema = z
	.object({
		mealType: z.string().min(1),
		customMealTypeId: z.string().uuid().nullable().optional(),
		startTime: timeStringSchema,
		endTime: timeStringSchema
	})
	.strict()
	.meta({ id: 'FavoriteMealTimeframeInput' });

export const preferencesUpdateSchema = z
	.object({
		showChartWidget: z.boolean().optional(),
		showFavoritesWidget: z.boolean().optional(),
		showSupplementsWidget: z.boolean().optional(),
		showWeightWidget: z.boolean().optional(),
		showMealBreakdownWidget: z.boolean().optional(),
		showTopFoodsWidget: z.boolean().optional(),
		showSleepWidget: z.boolean().optional(),
		widgetOrder: z
			.array(
				z.enum([
					'chart',
					'streaks',
					'favorites',
					'supplements',
					'weight',
					'meal-breakdown',
					'top-foods',
					'sleep',
					'summary',
					'daylog'
				])
			)
			.optional(),
		startPage: z.enum(['dashboard', 'favorites']).optional(),
		favoriteTapAction: z.enum(['instant', 'picker']).optional(),
		favoriteMealAssignmentMode: z.enum(['time_based', 'ask_meal']).optional(),
		favoriteMealTimeframes: z.array(favoriteMealTimeframeInputSchema).optional(),
		visibleNutrients: z
			.array(z.string().refine((v) => ALL_NUTRIENT_KEYS.includes(v), 'Invalid nutrient key'))
			.optional(),
		locale: z.enum(['en', 'de']).optional(),
		caloricLagDaysOverride: z.number().int().min(1).max(7).nullable().optional(),
		navTabs: z
			.array(z.enum(['favorites', 'foods', 'insights', 'weight', 'supplements']))
			.length(3)
			.optional()
	})
	.strict()
	.meta({ id: 'PreferencesUpdate' });
