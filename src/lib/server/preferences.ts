import { getDB } from '$lib/server/db';
import { ApiError } from '$lib/server/errors';
import { parseTimeToMinutes, validateFavoriteMealTimeframes } from '$lib/utils/meals';
import {
	customMealTypes,
	favoriteMealTimeframes,
	userPreferences,
	users
} from '$lib/server/schema';
import { preferencesUpdateSchema } from '$lib/server/validation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { ZodError } from 'zod';

type SuccessResult<T> = { success: true; data: T };
type ErrorResult = { success: false; error: ZodError | Error };
type Result<T> = SuccessResult<T> | ErrorResult;

type FavoriteMealTimeframePreference = {
	id: string;
	mealType: string;
	customMealTypeId: string | null;
	startMinute: number;
	endMinute: number;
	startTime: string;
	endTime: string;
	sortOrder: number;
};

type PreferencesResponse = typeof userPreferences.$inferSelect & {
	locale: string | null;
	favoriteMealTimeframes: FavoriteMealTimeframePreference[];
};

export const DEFAULT_PREFERENCES = {
	showFavoritesWidget: true,
	showSupplementsWidget: true,
	showWeightWidget: true,
	widgetOrder: ['chart', 'favorites', 'supplements', 'weight', 'summary', 'daylog'] as string[],
	startPage: 'dashboard' as const,
	locale: 'en' as const,
	favoriteTapAction: 'instant' as const,
	favoriteMealAssignmentMode: 'time_based' as const,
	favoriteMealTimeframes: [] as FavoriteMealTimeframePreference[]
};

const ALL_SECTION_KEYS = ['chart', 'favorites', 'supplements', 'weight', 'summary', 'daylog'];

const normalizeSectionOrder = (order: string[]): string[] => {
	const result = order.filter((k) => ALL_SECTION_KEYS.includes(k));
	if (!result.includes('chart')) result.unshift('chart');
	if (!result.includes('daylog')) result.push('daylog');
	return result;
};

const formatMinutesToTime = (minute: number) => {
	const hours = Math.floor(minute / 60)
		.toString()
		.padStart(2, '0');
	const minutes = (minute % 60).toString().padStart(2, '0');
	return `${hours}:${minutes}`;
};

const serializeFavoriteMealTimeframe = (
	row: typeof favoriteMealTimeframes.$inferSelect
): FavoriteMealTimeframePreference => ({
	id: row.id,
	mealType: row.mealType,
	customMealTypeId: row.customMealTypeId,
	startMinute: row.startMinute,
	endMinute: row.endMinute,
	startTime: formatMinutesToTime(row.startMinute),
	endTime: formatMinutesToTime(row.endMinute),
	sortOrder: row.sortOrder
});

const mapPreferencesPersistenceError = (error: unknown): Error => {
	const dbError = error as { code?: string; constraint?: string; message?: string };

	if (
		dbError.code === '23P01' ||
		dbError.constraint === 'favorite_meal_timeframes_no_overlap_per_user'
	) {
		return new ApiError(409, 'Favorite meal timeframes overlap');
	}

	if (dbError.code === '23503') {
		return new ApiError(
			409,
			'Favorite meal timeframe references a missing or protected custom meal type'
		);
	}

	if (dbError.code === '23514') {
		return new ApiError(400, 'Invalid favorite meal timeframe range');
	}

	return error as Error;
};

const buildNormalizedTimeframeRows = async (
	db: ReturnType<typeof getDB>,
	userId: string,
	inputs:
		| Array<{
				mealType: string;
				customMealTypeId?: string | null;
				startTime: string;
				endTime: string;
		  }>
		| undefined
) => {
	if (inputs === undefined) return undefined;

	const validation = validateFavoriteMealTimeframes(
		inputs.map((input) => ({
			mealType: input.mealType,
			startTime: input.startTime,
			endTime: input.endTime
		}))
	);

	if (!validation.valid) {
		const messageByError: Record<typeof validation.error, string> = {
			'invalid-time': 'Invalid favorite meal timeframe time format',
			'invalid-range': 'Invalid favorite meal timeframe range',
			overlap: 'Favorite meal timeframes overlap',
			'missing-meal-type': 'Meal type is required for favorite meal timeframe'
		};
		throw new ApiError(400, messageByError[validation.error]);
	}

	const customIds = [
		...new Set(inputs.map((input) => input.customMealTypeId).filter(Boolean))
	] as string[];
	const customMealsById = new Map<string, { id: string; name: string }>();

	if (customIds.length > 0) {
		const rows = await db
			.select({ id: customMealTypes.id, name: customMealTypes.name })
			.from(customMealTypes)
			.where(and(eq(customMealTypes.userId, userId), inArray(customMealTypes.id, customIds)));

		for (const row of rows) customMealsById.set(row.id, row);

		if (customMealsById.size !== customIds.length) {
			throw new ApiError(400, 'One or more custom meal types are invalid');
		}
	}

	const prepared = inputs.map((input) => {
		const startMinute = parseTimeToMinutes(input.startTime);
		const endMinute = parseTimeToMinutes(input.endTime);
		if (startMinute === null || endMinute === null) {
			throw new ApiError(400, 'Invalid favorite meal timeframe time format');
		}

		const customMeal = input.customMealTypeId ? customMealsById.get(input.customMealTypeId) : null;
		return {
			mealType: customMeal?.name ?? input.mealType.trim(),
			customMealTypeId: customMeal?.id ?? null,
			startMinute,
			endMinute
		};
	});

	prepared.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

	return prepared.map((row, index) => ({
		userId,
		mealType: row.mealType,
		customMealTypeId: row.customMealTypeId,
		startMinute: row.startMinute,
		endMinute: row.endMinute,
		sortOrder: index,
		updatedAt: new Date()
	}));
};

export const getPreferences = async (userId: string) => {
	const db = getDB();
	const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));

	const timeframeRows = await db
		.select()
		.from(favoriteMealTimeframes)
		.where(eq(favoriteMealTimeframes.userId, userId))
		.orderBy(asc(favoriteMealTimeframes.startMinute), asc(favoriteMealTimeframes.sortOrder));

	if (!prefs) return null;

	// Also fetch locale from users table
	const [user] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId));

	return {
		...prefs,
		widgetOrder: normalizeSectionOrder(prefs.widgetOrder),
		locale: user?.locale ?? 'en',
		favoriteMealTimeframes: timeframeRows.map(serializeFavoriteMealTimeframe)
	};
};

export const updatePreferences = async (
	userId: string,
	payload: unknown
): Promise<Result<PreferencesResponse>> => {
	const result = preferencesUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const {
			locale,
			favoriteMealTimeframes: favoriteMealTimeframesInput,
			...prefsData
		} = result.data;
		const normalizedTimeframes = await buildNormalizedTimeframeRows(
			db,
			userId,
			favoriteMealTimeframesInput
		);

		await db.transaction(async (tx) => {
			if (locale !== undefined) {
				await tx.update(users).set({ locale, updatedAt: new Date() }).where(eq(users.id, userId));
			}

			if (normalizedTimeframes !== undefined) {
				await tx.delete(favoriteMealTimeframes).where(eq(favoriteMealTimeframes.userId, userId));

				if (normalizedTimeframes.length > 0) {
					await tx.insert(favoriteMealTimeframes).values(normalizedTimeframes);
				}
			}

			const hasPrefsData = Object.keys(prefsData).length > 0;
			if (hasPrefsData) {
				await tx
					.insert(userPreferences)
					.values({ userId, ...prefsData, updatedAt: new Date() })
					.onConflictDoUpdate({
						target: userPreferences.userId,
						set: { ...prefsData, updatedAt: new Date() }
					});
			} else {
				const [existing] = await tx
					.select()
					.from(userPreferences)
					.where(eq(userPreferences.userId, userId));

				if (!existing) {
					await tx.insert(userPreferences).values({ userId, updatedAt: new Date() });
				}
			}
		});

		const fullPreferences = await getPreferences(userId);
		if (!fullPreferences) {
			return { success: false, error: new Error('Failed to load updated preferences') };
		}

		return { success: true, data: fullPreferences };
	} catch (error) {
		return { success: false, error: mapPreferencesPersistenceError(error) };
	}
};
