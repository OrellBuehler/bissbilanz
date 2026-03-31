import 'zod-openapi';
import { z } from 'zod';

const favoriteMealTimeframeSchema = z
	.object({
		id: z.string().uuid(),
		mealType: z.string(),
		customMealTypeId: z.string().uuid().nullable().optional(),
		startMinute: z.number().int(),
		endMinute: z.number().int(),
		startTime: z.string(),
		endTime: z.string(),
		sortOrder: z.number().int()
	})
	.meta({ id: 'FavoriteMealTimeframe' });

const preferencesSchema = z
	.object({
		showChartWidget: z.boolean(),
		showFavoritesWidget: z.boolean(),
		showSupplementsWidget: z.boolean(),
		showWeightWidget: z.boolean(),
		showMealBreakdownWidget: z.boolean(),
		showTopFoodsWidget: z.boolean(),
		showSleepWidget: z.boolean(),
		widgetOrder: z.array(z.string()),
		mealOrder: z.array(z.string()),
		startPage: z.string(),
		favoriteTapAction: z.string(),
		favoriteMealAssignmentMode: z.string(),
		visibleNutrients: z.array(z.string()),
		caloricLagDaysOverride: z.number().int().min(1).max(7).nullable().optional(),
		locale: z.string().nullable(),
		updatedAt: z.string().optional(),
		favoriteMealTimeframes: z.array(favoriteMealTimeframeSchema)
	})
	.meta({ id: 'Preferences' });

export const preferencesResponseSchema = z
	.object({
		preferences: preferencesSchema
	})
	.meta({ id: 'PreferencesResponse' });
