import { api } from '$lib/api/client';
import { today, shiftDate } from '$lib/utils/dates';
import type { components } from '$lib/api/generated/schema';
import type { CompletedFast } from '$lib/utils/fasting';

export type ExtendedNutrientEntry = components['schemas']['ExtendedNutrientEntry'];
export type MealTimingEntry = components['schemas']['MealTimingEntry'];
export type DailyNutrients = components['schemas']['DailyNutrients'];
export type FoodDiversityEntry = components['schemas']['FoodDiversityEntry'];
export type DailyWeightFood = components['schemas']['DailyWeightFood'];
export type SleepFoodEntry = components['schemas']['SleepFoodCorrelationEntry'];
export type NutrientGapsReport = components['schemas']['NutrientGapsResponse'];
export type SleepBedtime = { entryDate: string; bedtime: string };
export type WeightTarget = { targetWeightKg: number | null; targetDate: string | null };

export type AnalyticsBundle = {
	nutrientsExtended90: ExtendedNutrientEntry[];
	mealTiming90: MealTimingEntry[];
	mealTiming30: MealTimingEntry[];
	mealTiming60: MealTimingEntry[];
	nutrientsDaily30: DailyNutrients[];
	foodDiversity90: FoodDiversityEntry[];
	weightFood90: DailyWeightFood[];
	weightFood30: DailyWeightFood[];
	sleepFood90: SleepFoodEntry[];
	sleepFood60: SleepFoodEntry[];
	nutrientGaps30: NutrientGapsReport | null;
	sleepBedtimes60: SleepBedtime[];
	fasts30: CompletedFast[];
	weightTarget: WeightTarget;
};

export type AnalyticsSourceId = keyof AnalyticsBundle;

type SourceSpec = {
	days: number;
	load: (
		startDate: string,
		endDate: string,
		signal: AbortSignal
	) => Promise<AnalyticsBundle[AnalyticsSourceId]>;
};

const range = (days: number) => {
	const endDate = today();
	return { startDate: shiftDate(endDate, -(days - 1)), endDate };
};

export const EMPTY_ANALYTICS_BUNDLE: AnalyticsBundle = {
	nutrientsExtended90: [],
	mealTiming90: [],
	mealTiming30: [],
	mealTiming60: [],
	nutrientsDaily30: [],
	foodDiversity90: [],
	weightFood90: [],
	weightFood30: [],
	sleepFood90: [],
	sleepFood60: [],
	nutrientGaps30: null,
	sleepBedtimes60: [],
	fasts30: [],
	weightTarget: { targetWeightKg: null, targetDate: null }
};

export const ANALYTICS_SOURCES: Record<AnalyticsSourceId, SourceSpec> = {
	nutrientsExtended90: {
		days: 90,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/nutrients-extended', {
				params: { query: { startDate, endDate } },
				signal
			});
			return res.data?.data ?? [];
		}
	},
	mealTiming90: {
		days: 90,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/meal-timing', {
				params: { query: { startDate, endDate } },
				signal
			});
			return res.data?.data ?? [];
		}
	},
	mealTiming60: {
		days: 60,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/meal-timing', {
				params: { query: { startDate, endDate } },
				signal
			});
			return res.data?.data ?? [];
		}
	},
	mealTiming30: {
		days: 30,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/meal-timing', {
				params: { query: { startDate, endDate } },
				signal
			});
			return res.data?.data ?? [];
		}
	},
	nutrientsDaily30: {
		days: 30,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/nutrients-daily', {
				params: { query: { startDate, endDate } },
				signal
			});
			return res.data?.data ?? [];
		}
	},
	foodDiversity90: {
		days: 90,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/food-diversity', {
				params: { query: { startDate, endDate } },
				signal
			});
			return res.data?.data ?? [];
		}
	},
	weightFood90: {
		days: 90,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/weight-food', {
				params: { query: { startDate, endDate } },
				signal
			});
			return res.data?.data ?? [];
		}
	},
	weightFood30: {
		days: 30,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/weight-food', {
				params: { query: { startDate, endDate } },
				signal
			});
			return res.data?.data ?? [];
		}
	},
	sleepFood90: {
		days: 90,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/sleep-food', {
				params: { query: { startDate, endDate } },
				signal
			});
			return res.data?.data ?? [];
		}
	},
	sleepFood60: {
		days: 60,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/sleep-food', {
				params: { query: { startDate, endDate } },
				signal
			});
			return res.data?.data ?? [];
		}
	},
	nutrientGaps30: {
		days: 30,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/nutrient-gaps', {
				params: { query: { startDate, endDate } },
				signal
			});
			return res.data ?? null;
		}
	},
	sleepBedtimes60: {
		days: 60,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/sleep', {
				params: { query: { from: startDate, to: endDate } },
				signal
			});
			return (res.data?.entries ?? [])
				.filter((e): e is typeof e & { bedtime: string } => e.bedtime !== null)
				.map((e) => ({ entryDate: e.entryDate, bedtime: e.bedtime }));
		}
	},
	fasts30: {
		days: 30,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/fasts', {
				params: { query: { from: `${startDate}T00:00:00Z`, to: `${endDate}T23:59:59Z` } },
				signal
			});
			return res.data && 'sessions' in res.data ? res.data.sessions : [];
		}
	},
	weightTarget: {
		days: 1,
		load: async (_startDate, _endDate, signal) => {
			const res = await api.GET('/api/goals', { signal });
			return {
				targetWeightKg: res.data?.goals?.targetWeightKg ?? null,
				targetDate: res.data?.goals?.targetDate ?? null
			};
		}
	}
};

/**
 * Loads exactly the requested sources — Home only ever pulls what the pinned
 * cards declare, never the full analytics surface.
 */
export const loadAnalyticsSources = async (
	sources: readonly AnalyticsSourceId[],
	signal: AbortSignal
): Promise<AnalyticsBundle> => {
	const unique = [...new Set(sources)];
	const bundle: AnalyticsBundle = { ...EMPTY_ANALYTICS_BUNDLE };
	const results = await Promise.all(
		unique.map(async (id) => {
			const spec = ANALYTICS_SOURCES[id];
			const { startDate, endDate } = range(spec.days);
			return [id, await spec.load(startDate, endDate, signal)] as const;
		})
	);
	for (const [id, value] of results) {
		Object.assign(bundle, { [id]: value });
	}
	return bundle;
};
