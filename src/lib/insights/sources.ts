import * as Sentry from '@sentry/sveltekit';
import { browser } from '$app/environment';
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

/**
 * A source's request completed but the server reported a failure (non-2xx) —
 * a real service error, never to be conflated with "the account legitimately
 * has no rows yet" (which loaders keep representing as `[]`/`null`).
 */
export class AnalyticsSourceError extends Error {
	readonly sourceId: AnalyticsSourceId;
	constructor(sourceId: AnalyticsSourceId, cause?: unknown) {
		super(`Failed to load analytics source "${sourceId}"`, { cause });
		this.name = 'AnalyticsSourceError';
		this.sourceId = sourceId;
	}
}

/** Throws `AnalyticsSourceError` on a non-2xx response; otherwise hands back `res.data` (which is legitimately `undefined` only for a 204-style empty success). */
function unwrap<T>(sourceId: AnalyticsSourceId, res: { data?: T; error?: unknown }): T | undefined {
	if (res.error !== undefined) {
		throw new AnalyticsSourceError(sourceId, res.error);
	}
	return res.data;
}

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
			return unwrap('nutrientsExtended90', res)?.data ?? [];
		}
	},
	mealTiming90: {
		days: 90,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/meal-timing', {
				params: { query: { startDate, endDate } },
				signal
			});
			return unwrap('mealTiming90', res)?.data ?? [];
		}
	},
	mealTiming60: {
		days: 60,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/meal-timing', {
				params: { query: { startDate, endDate } },
				signal
			});
			return unwrap('mealTiming60', res)?.data ?? [];
		}
	},
	mealTiming30: {
		days: 30,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/meal-timing', {
				params: { query: { startDate, endDate } },
				signal
			});
			return unwrap('mealTiming30', res)?.data ?? [];
		}
	},
	nutrientsDaily30: {
		days: 30,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/nutrients-daily', {
				params: { query: { startDate, endDate } },
				signal
			});
			return unwrap('nutrientsDaily30', res)?.data ?? [];
		}
	},
	foodDiversity90: {
		days: 90,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/food-diversity', {
				params: { query: { startDate, endDate } },
				signal
			});
			return unwrap('foodDiversity90', res)?.data ?? [];
		}
	},
	weightFood90: {
		days: 90,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/weight-food', {
				params: { query: { startDate, endDate } },
				signal
			});
			return unwrap('weightFood90', res)?.data ?? [];
		}
	},
	weightFood30: {
		days: 30,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/weight-food', {
				params: { query: { startDate, endDate } },
				signal
			});
			return unwrap('weightFood30', res)?.data ?? [];
		}
	},
	sleepFood90: {
		days: 90,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/sleep-food', {
				params: { query: { startDate, endDate } },
				signal
			});
			return unwrap('sleepFood90', res)?.data ?? [];
		}
	},
	sleepFood60: {
		days: 60,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/sleep-food', {
				params: { query: { startDate, endDate } },
				signal
			});
			return unwrap('sleepFood60', res)?.data ?? [];
		}
	},
	nutrientGaps30: {
		days: 30,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/analytics/nutrient-gaps', {
				params: { query: { startDate, endDate } },
				signal
			});
			return unwrap('nutrientGaps30', res) ?? null;
		}
	},
	sleepBedtimes60: {
		days: 60,
		load: async (startDate, endDate, signal) => {
			const res = await api.GET('/api/sleep', {
				params: { query: { from: startDate, to: endDate } },
				signal
			});
			const data = unwrap('sleepBedtimes60', res);
			return (data?.entries ?? [])
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
			const data = unwrap('fasts30', res);
			return data && 'sessions' in data ? data.sessions : [];
		}
	},
	weightTarget: {
		days: 1,
		load: async (_startDate, _endDate, signal) => {
			const res = await api.GET('/api/goals', { signal });
			const data = unwrap('weightTarget', res);
			return {
				targetWeightKg: data?.goals?.targetWeightKg ?? null,
				targetDate: data?.goals?.targetDate ?? null
			};
		}
	}
};

function reportSourceError(sourceId: AnalyticsSourceId, err: unknown): void {
	// A network failure while offline is expected, not a service incident.
	if (!(browser && !navigator.onLine)) {
		Sentry.captureException(err, {
			extra: { context: 'insights.loadAnalyticsSources', source: sourceId }
		});
	}
}

export type AnalyticsLoadResult = {
	bundle: AnalyticsBundle;
	/**
	 * Sources that failed to load — a service error, a network failure, or
	 * offline — as opposed to a source that legitimately came back empty.
	 * Callers should treat cards depending on any of these as "unavailable",
	 * never as "insufficient data".
	 */
	failedSources: AnalyticsSourceId[];
};

/**
 * Loads exactly the requested sources — Home only ever pulls what the pinned
 * cards declare, never the full analytics surface. One source failing does
 * not take the others down with it: successful sources still populate the
 * bundle, and every failure is reported (Sentry, unless offline) and named in
 * `failedSources` rather than silently collapsing into an empty array that
 * would read as "not enough data logged yet".
 */
export const loadAnalyticsSources = async (
	sources: readonly AnalyticsSourceId[],
	signal: AbortSignal
): Promise<AnalyticsLoadResult> => {
	const unique = [...new Set(sources)];
	const bundle: AnalyticsBundle = { ...EMPTY_ANALYTICS_BUNDLE };
	const failedSources: AnalyticsSourceId[] = [];

	const settled = await Promise.all(
		unique.map(async (id) => {
			const spec = ANALYTICS_SOURCES[id];
			const { startDate, endDate } = range(spec.days);
			try {
				return { id, value: await spec.load(startDate, endDate, signal) };
			} catch (err) {
				return { id, error: err };
			}
		})
	);

	// An aborted load (component unmounted, filters changed) is neither a
	// success nor a service failure — surface it the same way the previous
	// implementation did, instead of reporting every in-flight source as failed.
	if (signal.aborted) {
		throw new DOMException('Aborted', 'AbortError');
	}

	for (const result of settled) {
		if ('error' in result) {
			failedSources.push(result.id);
			reportSourceError(result.id, result.error);
		} else {
			Object.assign(bundle, { [result.id]: result.value });
		}
	}

	return { bundle, failedSources };
};
