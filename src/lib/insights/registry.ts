import type { Component } from 'svelte';
import * as m from '$lib/paraglide/messages';
import { INSIGHT_CARD_IDS } from './card-ids';
import type { InsightCardId } from './card-ids';
import type { AnalyticsBundle, AnalyticsSourceId } from './sources';
import type { InsightGroupId } from './groups';

import NOVAScoreCard from '$lib/components/analytics/NOVAScoreCard.svelte';
import OmegaRatioCard from '$lib/components/analytics/OmegaRatioCard.svelte';
import ProteinDistributionCard from '$lib/components/analytics/ProteinDistributionCard.svelte';
import WeekdayWeekendCard from '$lib/components/analytics/WeekdayWeekendCard.svelte';
import CalorieFrontLoadingCard from '$lib/components/analytics/CalorieFrontLoadingCard.svelte';
import DIIScoreCard from '$lib/components/analytics/DIIScoreCard.svelte';
import TEFCard from '$lib/components/analytics/TEFCard.svelte';
import CalorieCyclingCard from '$lib/components/analytics/CalorieCyclingCard.svelte';
import MealRegularityCard from '$lib/components/analytics/MealRegularityCard.svelte';
import FoodDiversityCard from '$lib/components/analytics/FoodDiversityCard.svelte';
import EatingWindowCard from '$lib/components/analytics/EatingWindowCard.svelte';
import MealSpacingCard from '$lib/components/analytics/MealSpacingCard.svelte';
import NutrientAdequacyCard from '$lib/components/analytics/NutrientAdequacyCard.svelte';
import AdaptiveTDEECard from '$lib/components/analytics/AdaptiveTDEECard.svelte';
import PlateauDetectionCard from '$lib/components/analytics/PlateauDetectionCard.svelte';
import WeightForecastCard from '$lib/components/analytics/WeightForecastCard.svelte';
import SodiumWeightCard from '$lib/components/analytics/SodiumWeightCard.svelte';
import CaloricLagCard from '$lib/components/analytics/CaloricLagCard.svelte';
import MacroImpactCard from '$lib/components/analytics/MacroImpactCard.svelte';
import MealTimingWeightCard from '$lib/components/analytics/MealTimingWeightCard.svelte';
import MicronutrientGapsCard from '$lib/components/analytics/MicronutrientGapsCard.svelte';
import FoodSleepCard from '$lib/components/analytics/FoodSleepCard.svelte';
import NutrientSleepCard from '$lib/components/analytics/NutrientSleepCard.svelte';
import PreSleepWindowCard from '$lib/components/analytics/PreSleepWindowCard.svelte';
import CaffeineSleepCard from '$lib/components/analytics/CaffeineSleepCard.svelte';

export type InsightCardDefinition = {
	id: InsightCardId;
	group: InsightGroupId;
	title: () => string;
	sources: readonly AnalyticsSourceId[];
	component: Component<Record<string, unknown>>;
	props: (bundle: AnalyticsBundle, loading: boolean) => Record<string, unknown>;
};

const def = <P extends Record<string, unknown>>(
	entry: Omit<InsightCardDefinition, 'component' | 'props'> & {
		component: Component<P>;
		props: (bundle: AnalyticsBundle, loading: boolean) => P;
	}
): InsightCardDefinition => entry as unknown as InsightCardDefinition;

export const INSIGHT_CARDS: Record<InsightCardId, InsightCardDefinition> = {
	'nova-score': def({
		id: 'nova-score',
		group: 'nutrition-patterns',
		title: m.analytics_nova,
		sources: ['nutrientsExtended90'],
		component: NOVAScoreCard,
		props: (b, loading) => ({ nutrientEntries: b.nutrientsExtended90, loading })
	}),
	'omega-ratio': def({
		id: 'omega-ratio',
		group: 'nutrition-patterns',
		title: m.analytics_omega,
		sources: ['nutrientsExtended90'],
		component: OmegaRatioCard,
		props: (b, loading) => ({ nutrientEntries: b.nutrientsExtended90, loading })
	}),
	'protein-distribution': def({
		id: 'protein-distribution',
		group: 'nutrition-patterns',
		title: m.analytics_protein_dist,
		sources: ['nutrientsExtended90'],
		component: ProteinDistributionCard,
		props: (b, loading) => ({ nutrientEntries: b.nutrientsExtended90, loading })
	}),
	'weekday-weekend': def({
		id: 'weekday-weekend',
		group: 'nutrition-patterns',
		title: m.analytics_weekday_weekend,
		sources: ['nutrientsExtended90'],
		component: WeekdayWeekendCard,
		props: (b, loading) => ({ nutrientEntries: b.nutrientsExtended90, loading })
	}),
	'calorie-front-loading': def({
		id: 'calorie-front-loading',
		group: 'nutrition-patterns',
		title: m.analytics_front_loading,
		sources: ['nutrientsExtended90'],
		component: CalorieFrontLoadingCard,
		props: (b, loading) => ({ nutrientEntries: b.nutrientsExtended90, loading })
	}),
	'dii-score': def({
		id: 'dii-score',
		group: 'nutrition-patterns',
		title: m.analytics_dii,
		sources: ['nutrientsExtended90'],
		component: DIIScoreCard,
		props: (b, loading) => ({ nutrientEntries: b.nutrientsExtended90, loading })
	}),
	tef: def({
		id: 'tef',
		group: 'nutrition-patterns',
		title: m.analytics_tef,
		sources: ['nutrientsExtended90'],
		component: TEFCard,
		props: (b, loading) => ({ nutrientEntries: b.nutrientsExtended90, loading })
	}),
	'calorie-cycling': def({
		id: 'calorie-cycling',
		group: 'nutrition-patterns',
		title: m.analytics_cycling,
		sources: ['nutrientsExtended90'],
		component: CalorieCyclingCard,
		props: (b, loading) => ({ nutrientEntries: b.nutrientsExtended90, loading })
	}),
	'meal-regularity': def({
		id: 'meal-regularity',
		group: 'nutrition-patterns',
		title: m.analytics_regularity,
		sources: ['mealTiming90'],
		component: MealRegularityCard,
		props: (b, loading) => ({ mealEntries: b.mealTiming90, loading })
	}),
	'food-diversity': def({
		id: 'food-diversity',
		group: 'nutrition-patterns',
		title: m.analytics_diversity,
		sources: ['foodDiversity90'],
		component: FoodDiversityCard,
		props: (b, loading) => ({ diversityData: b.foodDiversity90, loading })
	}),
	'eating-window': def({
		id: 'eating-window',
		group: 'nutrition-correlations',
		title: m.analytics_eating_window,
		sources: ['mealTiming30'],
		component: EatingWindowCard,
		props: (b, loading) => ({ mealTimingData: b.mealTiming30, loading })
	}),
	'meal-spacing': def({
		id: 'meal-spacing',
		group: 'nutrition-correlations',
		title: m.analytics_meal_spacing,
		sources: ['mealTiming30'],
		component: MealSpacingCard,
		props: (b, loading) => ({ mealTimingData: b.mealTiming30, loading })
	}),
	'nutrient-adequacy': def({
		id: 'nutrient-adequacy',
		group: 'nutrition-correlations',
		title: m.analytics_nutrient_adequacy,
		sources: ['nutrientGaps30'],
		component: NutrientAdequacyCard,
		props: (b, loading) => ({ report: b.nutrientGaps30, loading })
	}),
	'adaptive-tdee': def({
		id: 'adaptive-tdee',
		group: 'weight-insights',
		title: m.analytics_tdee,
		sources: ['weightFood90'],
		component: AdaptiveTDEECard,
		props: (b, loading) => ({ weightFoodData: b.weightFood90, loading })
	}),
	'plateau-detection': def({
		id: 'plateau-detection',
		group: 'weight-insights',
		title: m.analytics_plateau,
		sources: ['weightFood90'],
		component: PlateauDetectionCard,
		props: (b, loading) => ({ weightFoodData: b.weightFood90, loading })
	}),
	'weight-forecast': def({
		id: 'weight-forecast',
		group: 'weight-insights',
		title: m.analytics_forecast,
		sources: ['weightFood90'],
		component: WeightForecastCard,
		props: (b, loading) => ({ weightFoodData: b.weightFood90, loading })
	}),
	'sodium-weight': def({
		id: 'sodium-weight',
		group: 'weight-insights',
		title: m.analytics_sodium,
		sources: ['weightFood90', 'nutrientsExtended90'],
		component: SodiumWeightCard,
		props: (b, loading) => ({
			weightFoodData: b.weightFood90,
			nutrientData: b.nutrientsExtended90,
			loading
		})
	}),
	'caloric-lag': def({
		id: 'caloric-lag',
		group: 'weight-correlations',
		title: m.analytics_caloric_lag,
		sources: ['weightFood30'],
		component: CaloricLagCard,
		props: (b, loading) => ({ weightFoodData: b.weightFood30, loading })
	}),
	'macro-impact': def({
		id: 'macro-impact',
		group: 'weight-correlations',
		title: m.analytics_macro_impact,
		sources: ['weightFood30', 'nutrientsDaily30'],
		component: MacroImpactCard,
		props: (b, loading) => ({
			weightFoodData: b.weightFood30,
			nutrientDailyData: b.nutrientsDaily30,
			loading
		})
	}),
	'meal-timing-weight': def({
		id: 'meal-timing-weight',
		group: 'weight-correlations',
		title: m.analytics_meal_timing_weight,
		sources: ['weightFood30', 'mealTiming30'],
		component: MealTimingWeightCard,
		props: (b, loading) => ({
			weightFoodData: b.weightFood30,
			mealTimingData: b.mealTiming30,
			loading
		})
	}),
	'micronutrient-gaps': def({
		id: 'micronutrient-gaps',
		group: 'weight-correlations',
		title: m.analytics_micronutrient_gaps,
		sources: ['weightFood30', 'nutrientsDaily30'],
		component: MicronutrientGapsCard,
		props: (b, loading) => ({
			weightFoodData: b.weightFood30,
			nutrientDailyData: b.nutrientsDaily30,
			loading
		})
	}),
	'food-sleep': def({
		id: 'food-sleep',
		group: 'sleep-insights',
		title: m.analytics_food_sleep,
		sources: ['sleepFood60', 'mealTiming60'],
		component: FoodSleepCard,
		props: (b, loading) => ({
			sleepFoodData: b.sleepFood60,
			mealEntries: b.mealTiming60,
			loading
		})
	}),
	'nutrient-sleep': def({
		id: 'nutrient-sleep',
		group: 'sleep-insights',
		title: m.analytics_nutrient_sleep,
		sources: ['sleepFood60', 'nutrientsDaily30'],
		component: NutrientSleepCard,
		props: (b, loading) => ({
			sleepFoodData: b.sleepFood60,
			nutrientSeries: b.nutrientsDaily30,
			loading
		})
	}),
	'pre-sleep-window': def({
		id: 'pre-sleep-window',
		group: 'sleep-insights',
		title: m.analytics_presleep_window,
		sources: ['sleepFood60', 'mealTiming60', 'sleepBedtimes60'],
		component: PreSleepWindowCard,
		props: (b, loading) => ({
			sleepFoodData: b.sleepFood60,
			mealEntries: b.mealTiming60,
			sleepWithBedtime: b.sleepBedtimes60,
			loading
		})
	}),
	'caffeine-sleep': def({
		id: 'caffeine-sleep',
		group: 'sleep-insights',
		title: m.analytics_caffeine_sleep,
		sources: ['nutrientsExtended90', 'sleepFood90'],
		component: CaffeineSleepCard,
		props: (b, loading) => ({
			nutrientEntries: b.nutrientsExtended90,
			sleepFoodData: b.sleepFood90,
			loading
		})
	})
};

export const INSIGHT_CARD_LIST: InsightCardDefinition[] = INSIGHT_CARD_IDS.map(
	(id) => INSIGHT_CARDS[id]
);

export const cardsForGroup = (group: InsightGroupId): InsightCardDefinition[] =>
	INSIGHT_CARD_LIST.filter((card) => card.group === group);

export const sourcesForCards = (ids: readonly InsightCardId[]): AnalyticsSourceId[] => [
	...new Set(ids.flatMap((id) => INSIGHT_CARDS[id].sources))
];
