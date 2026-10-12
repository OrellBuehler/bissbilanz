import 'zod-openapi';
import { z } from 'zod';
import { aiTaskProcessorKindValues, aiTaskProcessorValues } from '$lib/server/schema';

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
		showFastingWidget: z.boolean(),
		showDayPropertiesWidget: z.boolean(),
		showWaterWidget: z.boolean(),
		showActivityWidget: z.boolean(),
		showNotesWidget: z.boolean(),
		showRecipeSuggestionsWidget: z.boolean(),
		widgetOrder: z.array(z.string()),
		mealOrder: z.array(z.string()),
		startPage: z.string(),
		favoriteTapAction: z.string(),
		favoriteMealAssignmentMode: z.string(),
		visibleNutrients: z.array(z.string()),
		pinnedInsights: z.array(z.string()).optional(),
		caloricLagDaysOverride: z.number().int().min(1).max(7).nullable().optional(),
		waterGoalMl: z.number().int(),
		biologicalSex: z.enum(['male', 'female']).nullable().optional(),
		activityGoalAdjustment: z.boolean(),
		activityCreditPercent: z.number().int(),
		// Never 'claude': a stored claude choice reads as 'assistant' here so
		// shipped clients keep decoding. Read aiTaskProcessorKind for the real value.
		aiTaskProcessor: z.enum(aiTaskProcessorValues),
		aiTaskProcessorKind: z
			.string()
			.meta({
				description:
					"The stored processor, including values newer than the legacy aiTaskProcessor enum (e.g. 'claude'). Unknown values should be treated like aiTaskProcessor.",
				'x-extensible-enum': [...aiTaskProcessorKindValues]
			})
			.optional(),
		aiTaskAutoLog: z.boolean(),
		locale: z.string().nullable(),
		timeZone: z.string(),
		updatedAt: z.string().optional(),
		favoriteMealTimeframes: z.array(favoriteMealTimeframeSchema)
	})
	.meta({ id: 'Preferences' });

const claudeCapabilitySchema = z
	.object({
		available: z.boolean(),
		remainingBudgetUsd: z.number().optional()
	})
	.meta({
		id: 'ClaudeCapability',
		description:
			'Whether server-side Claude processing can run for this user right now. remainingBudgetUsd (USD, 2 decimals) is only present when available.'
	});

export const preferencesResponseSchema = z
	.object({
		preferences: preferencesSchema,
		claude: claudeCapabilitySchema.optional()
	})
	.meta({ id: 'PreferencesResponse' });
