import 'zod-openapi';
import { z } from 'zod';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { INSIGHT_CARD_IDS, MAX_PINNED_INSIGHTS } from '$lib/insights/card-ids';

const timeStringSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const favoriteMealTimeframeInputSchema = z
	.object({
		mealType: z.string().min(1).max(100),
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
		favoriteMealTimeframes: z.array(favoriteMealTimeframeInputSchema).max(50).optional(),
		mealOrder: z.array(z.string().min(1).max(100)).max(50).optional(),
		pinnedInsights: z.array(z.enum(INSIGHT_CARD_IDS)).max(MAX_PINNED_INSIGHTS).optional(),
		visibleNutrients: z
			.array(z.string().refine((v) => ALL_NUTRIENT_KEYS.includes(v), 'Invalid nutrient key'))
			.optional(),
		locale: z.enum(['en', 'de']).optional(),
		caloricLagDaysOverride: z.number().int().min(1).max(7).nullable().optional(),
		biologicalSex: z.enum(['male', 'female']).nullable().optional(),
		// IANA timezone reported by the client (e.g. 'Europe/Zurich'). Validated
		// against Intl so a bad value can't break server-side AT TIME ZONE queries.
		timeZone: z
			.string()
			.max(64)
			.refine(
				(tz) => {
					try {
						new Intl.DateTimeFormat('en-US', { timeZone: tz });
						return true;
					} catch {
						return false;
					}
				},
				{ message: 'Invalid IANA time zone' }
			)
			.optional()
	})
	.strict()
	.meta({ id: 'PreferencesUpdate' });
