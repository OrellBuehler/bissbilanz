import { getDB } from '$lib/server/db';
import { userPreferences, users } from '$lib/server/schema';
import { preferencesUpdateSchema } from '$lib/server/validation';
import { eq } from 'drizzle-orm';
import type { ZodError } from 'zod';

type SuccessResult<T> = { success: true; data: T };
type ErrorResult = { success: false; error: ZodError | Error };
type Result<T> = SuccessResult<T> | ErrorResult;

export const DEFAULT_PREFERENCES = {
	showFavoritesWidget: true,
	showSupplementsWidget: true,
	showWeightWidget: true,
	widgetOrder: ['chart', 'favorites', 'supplements', 'weight', 'summary', 'daylog'] as string[],
	startPage: 'dashboard' as const,
	locale: 'en' as const,
	favoriteTapAction: 'instant' as const
};

const ALL_SECTION_KEYS = ['chart', 'favorites', 'supplements', 'weight', 'summary', 'daylog'];

const normalizeSectionOrder = (order: string[]): string[] => {
	const result = order.filter((k) => ALL_SECTION_KEYS.includes(k));
	if (!result.includes('chart')) result.unshift('chart');
	if (!result.includes('daylog')) result.push('daylog');
	return result;
};

export const getPreferences = async (userId: string) => {
	const db = getDB();
	const [prefs] = await db
		.select()
		.from(userPreferences)
		.where(eq(userPreferences.userId, userId));

	if (!prefs) return null;

	// Also fetch locale from users table
	const [user] = await db
		.select({ locale: users.locale })
		.from(users)
		.where(eq(users.id, userId));

	return {
		...prefs,
		widgetOrder: normalizeSectionOrder(prefs.widgetOrder),
		locale: user?.locale ?? 'en'
	};
};

export const updatePreferences = async (
	userId: string,
	payload: unknown
): Promise<Result<typeof userPreferences.$inferSelect & { locale: string | null }>> => {
	const result = preferencesUpdateSchema.safeParse(payload);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	try {
		const db = getDB();
		const { locale, ...prefsData } = result.data;

		// Update locale on users table if provided
		if (locale !== undefined) {
			await db.update(users).set({ locale, updatedAt: new Date() }).where(eq(users.id, userId));
		}

		// Upsert preferences (only if there are preference fields to update)
		const hasPrefsData = Object.keys(prefsData).length > 0;
		let prefs: typeof userPreferences.$inferSelect;

		if (hasPrefsData) {
			const [upserted] = await db
				.insert(userPreferences)
				.values({ userId, ...prefsData, updatedAt: new Date() })
				.onConflictDoUpdate({
					target: userPreferences.userId,
					set: { ...prefsData, updatedAt: new Date() }
				})
				.returning();

			if (!upserted) {
				return { success: false, error: new Error('Failed to upsert preferences') };
			}
			prefs = upserted;
		} else {
			// No pref fields to update, just fetch current or create default
			const [existing] = await db
				.select()
				.from(userPreferences)
				.where(eq(userPreferences.userId, userId));

			if (existing) {
				prefs = existing;
			} else {
				// Create default row
				const [created] = await db
					.insert(userPreferences)
					.values({ userId, updatedAt: new Date() })
					.returning();

				if (!created) {
					return { success: false, error: new Error('Failed to create preferences') };
				}
				prefs = created;
			}
		}

		// Fetch current locale
		const [user] = await db
			.select({ locale: users.locale })
			.from(users)
			.where(eq(users.id, userId));

		return {
			success: true,
			data: { ...prefs, locale: user?.locale ?? 'en' }
		};
	} catch (error) {
		return { success: false, error: error as Error };
	}
};
