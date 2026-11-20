/**
 * Pure factory for MCP handler functions.
 *
 * Type-only imports from service modules are erased at compile time, so this
 * module can be imported in tests without triggering database connections or
 * requiring mock.module — eliminating cross-file mock pollution in Bun's test runner.
 *
 * Production code uses handlers.ts which creates a default instance with real deps.
 */

import { shiftDate } from '$lib/utils/dates';
import { buildMaintenanceReport } from '$lib/utils/maintenance';
import { MIN_NUTRIENT_COVERAGE } from '$lib/analytics/constants.generated';
import { RDA_VALUES } from '$lib/analytics/rda';
import { buildNutrientGapReport, type NutrientGapRow } from '$lib/server/nutrient-gaps';
import { scoreNutrientCandidates, type NutrientGapInput } from '$lib/server/nutrient-scoring';
import { buildEatingPatterns } from '$lib/server/eating-patterns';
import type {
	getRdaNutrientEntries,
	getNutrientCandidates,
	getBiologicalSex
} from '$lib/server/nutrient-insights';
import type {
	listFoods,
	createFood,
	updateFood,
	deleteFood,
	getFood,
	findFoodByBarcode,
	listRecentFoods,
	listFoodBrands
} from '$lib/server/foods';
import type { mergeFoods } from '$lib/server/food-merge';
import type { findDuplicateGroups } from '$lib/server/food-duplicates';
import type {
	createRecipe,
	updateRecipe,
	deleteRecipe,
	listRecipes,
	getRecipe,
	listRecipeIngredientNames,
	expandIncludedRecipes
} from '$lib/server/recipes';
import type {
	createEntry,
	listEntriesByDate,
	listEntriesByDateRange,
	updateEntry,
	deleteEntry,
	copyEntries
} from '$lib/server/entries';
import type { getGoals, upsertGoals } from '$lib/server/goals';
import type { listFavoriteFoods, listFavoriteRecipes } from '$lib/server/favorites';
import type {
	createWeightEntry,
	updateWeightEntry,
	deleteWeightEntry,
	getLatestWeight,
	getWeightWithTrend,
	getWeightEntriesByDateRange
} from '$lib/server/weight';
import type {
	getWeeklyStats,
	getMonthlyStats,
	getDailyBreakdown,
	getMealBreakdown,
	getTopFoods,
	getStreaks,
	computeAverages
} from '$lib/server/stats';
import type {
	createSupplement,
	listSupplements,
	updateSupplement,
	deleteSupplement,
	unlogSupplement,
	getLogsForDate,
	getLogsForRange,
	logSupplement,
	getSupplementById,
	getSupplementChecklist
} from '$lib/server/supplements';
import type { formatDailyStatus } from '$lib/server/mcp/format';
import type { fetchProduct, searchProductsResult } from '$lib/server/openfoodfacts';
import type {
	createSleepEntry,
	getSleepEntriesByDateRange,
	getLatestSleep,
	updateSleepEntry,
	deleteSleepEntry
} from '$lib/server/sleep';
import type {
	getFoodDiversityData,
	getMealTimingData,
	getSleepFoodCorrelationData,
	getWeightFoodSeries,
	getExtendedNutrientEntries,
	getDailyNutrientTotals
} from '$lib/server/analytics';
import type {
	listMealTypes,
	createMealType,
	updateMealType,
	renameMealType,
	deleteMealType
} from '$lib/server/meal-types';
import type {
	getPreferences,
	getUserLocale,
	updatePreferences,
	DEFAULT_PREFERENCES
} from '$lib/server/preferences';
import type {
	listFastingSessions,
	getFastingSession,
	findOverlappingFast,
	upsertFastingSession,
	updateFastingSession,
	deleteFastingSession,
	FastingSessionRow
} from '$lib/server/fasting';
import type {
	listReminders,
	getReminderById,
	createReminder,
	updateReminder,
	deleteReminder,
	ReminderRow
} from '$lib/server/reminders';
import type { getFoodUsage, getRecipeUsage } from '$lib/server/usage';
import { NutrientDatabaseError, type searchFdcFoods } from '$lib/server/fooddata-central';
import { DEFAULT_MEAL_TYPES, normalizeMealType } from '$lib/utils/meals';
import {
	canonicalMeal,
	dedupe,
	needsMealTypes,
	resolvePreferencePatch,
	unknownMeal
} from './meal-names';
import type { getClaudeCapabilitySafe } from '$lib/server/claude/capability';
import type {
	getDayProperties,
	getDayPropertiesRange,
	setDayProperties,
	deleteDayProperties,
	getFastingDays
} from '$lib/server/day-properties';
import type { DayPropertiesPatch } from '$lib/server/validation/day-properties';
import type { preferencesUpdateSchema } from '$lib/server/validation/preferences';
import type { TopFoodsSort } from '$lib/server/validation/stats';
import type { getCalendarStats } from '$lib/server/stats';
import type {
	listAiTasks,
	getAiTask,
	updateAiTask,
	dismissAiTaskByAgent
} from '$lib/server/ai-tasks';
import type { listLabelStats, setFoodLabels, setFoodLabelsBatch } from '$lib/server/food-labels';
import type { setRecipeLabels, setRecipeLabelsBatch } from '$lib/server/recipe-labels';
import type { AiTask, AiTaskStatus } from '$lib/server/schema';
import * as Sentry from '@sentry/sveltekit';
import { ApiError, McpUserError, isZodError, pgConstraintName } from '$lib/server/errors';
import { asText, type McpResult } from './safe';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_RECIPE_INGREDIENTS, type IncludeRecipes } from './include-recipes';
import { RECIPE_STEP_MAX_DIM, UPLOAD_DIR } from '$lib/server/images';
import type { discardImportedImages, importImageFromUrl } from '$lib/server/image-download';

export type HandlerDeps = {
	// Foods
	listFoods: typeof listFoods;
	createFood: typeof createFood;
	updateFood: typeof updateFood;
	deleteFood: typeof deleteFood;
	getFood: typeof getFood;
	findFoodByBarcode: typeof findFoodByBarcode;
	listRecentFoods: typeof listRecentFoods;
	mergeFoods: typeof mergeFoods;
	findDuplicateGroups: typeof findDuplicateGroups;
	// Food labels
	setFoodLabels: typeof setFoodLabels;
	setFoodLabelsBatch: typeof setFoodLabelsBatch;
	listLabelStats: typeof listLabelStats;
	setRecipeLabels: typeof setRecipeLabels;
	setRecipeLabelsBatch: typeof setRecipeLabelsBatch;
	listRecipeIngredientNames: typeof listRecipeIngredientNames;
	// Recipes
	createRecipe: typeof createRecipe;
	updateRecipe: typeof updateRecipe;
	deleteRecipe: typeof deleteRecipe;
	listRecipes: typeof listRecipes;
	getRecipe: typeof getRecipe;
	expandIncludedRecipes: typeof expandIncludedRecipes;
	// Entries
	createEntry: typeof createEntry;
	listEntriesByDate: typeof listEntriesByDate;
	updateEntry: typeof updateEntry;
	deleteEntry: typeof deleteEntry;
	copyEntries: typeof copyEntries;
	// Goals
	getGoals: typeof getGoals;
	upsertGoals: typeof upsertGoals;
	// Favorites
	listFavoriteFoods: typeof listFavoriteFoods;
	listFavoriteRecipes: typeof listFavoriteRecipes;
	// Weight
	createWeightEntry: typeof createWeightEntry;
	updateWeightEntry: typeof updateWeightEntry;
	deleteWeightEntry: typeof deleteWeightEntry;
	getLatestWeight: typeof getLatestWeight;
	getWeightWithTrend: typeof getWeightWithTrend;
	// Stats
	getWeeklyStats: typeof getWeeklyStats;
	getMonthlyStats: typeof getMonthlyStats;
	getDailyBreakdown: typeof getDailyBreakdown;
	getMealBreakdown: typeof getMealBreakdown;
	getTopFoods: typeof getTopFoods;
	getStreaks: typeof getStreaks;
	// Supplements
	createSupplement: typeof createSupplement;
	listSupplements: typeof listSupplements;
	updateSupplement: typeof updateSupplement;
	deleteSupplement: typeof deleteSupplement;
	unlogSupplement: typeof unlogSupplement;
	getLogsForDate: typeof getLogsForDate;
	logSupplement: typeof logSupplement;
	getSupplementById: typeof getSupplementById;
	getSupplementChecklist: typeof getSupplementChecklist;
	// Sleep
	createSleepEntry: typeof createSleepEntry;
	getSleepEntriesByDateRange: typeof getSleepEntriesByDateRange;
	getLatestSleep: typeof getLatestSleep;
	updateSleepEntry: typeof updateSleepEntry;
	deleteSleepEntry: typeof deleteSleepEntry;
	// Supplement history
	getLogsForRange: typeof getLogsForRange;
	// Custom range stats
	computeAverages: typeof computeAverages;
	listEntriesByDateRange: typeof listEntriesByDateRange;
	getWeightEntriesByDateRange: typeof getWeightEntriesByDateRange;
	getFastingDays: typeof getFastingDays;
	// Analytics
	getFoodDiversityData: typeof getFoodDiversityData;
	getMealTimingData: typeof getMealTimingData;
	getSleepFoodCorrelationData: typeof getSleepFoodCorrelationData;
	getWeightFoodSeries: typeof getWeightFoodSeries;
	getExtendedNutrientEntries: typeof getExtendedNutrientEntries;
	getDailyNutrientTotals: typeof getDailyNutrientTotals;
	// Nutrient adequacy & planning
	getRdaNutrientEntries: typeof getRdaNutrientEntries;
	getNutrientCandidates: typeof getNutrientCandidates;
	getBiologicalSex: typeof getBiologicalSex;
	getUserTimeZone: (userId: string) => Promise<string>;
	// Meal types
	listMealTypes: typeof listMealTypes;
	createMealType: typeof createMealType;
	updateMealType: typeof updateMealType;
	renameMealType: typeof renameMealType;
	deleteMealType: typeof deleteMealType;
	// Preferences
	getPreferences: typeof getPreferences;
	getUserLocale: typeof getUserLocale;
	updatePreferences: typeof updatePreferences;
	defaultPreferences: typeof DEFAULT_PREFERENCES;
	getClaudeCapabilitySafe: typeof getClaudeCapabilitySafe;
	// Fasting sessions
	listFastingSessions: typeof listFastingSessions;
	getFastingSession: typeof getFastingSession;
	findOverlappingFast: typeof findOverlappingFast;
	upsertFastingSession: typeof upsertFastingSession;
	updateFastingSession: typeof updateFastingSession;
	deleteFastingSession: typeof deleteFastingSession;
	// Reminders
	listReminders: typeof listReminders;
	getReminderById: typeof getReminderById;
	createReminder: typeof createReminder;
	updateReminder: typeof updateReminder;
	deleteReminder: typeof deleteReminder;
	// Where-used, brands, nutrient database
	getFoodUsage: typeof getFoodUsage;
	getRecipeUsage: typeof getRecipeUsage;
	listFoodBrands: typeof listFoodBrands;
	searchFdcFoods: typeof searchFdcFoods;
	// Day properties
	getDayProperties: typeof getDayProperties;
	getDayPropertiesRange: typeof getDayPropertiesRange;
	setDayProperties: typeof setDayProperties;
	deleteDayProperties: typeof deleteDayProperties;
	// Calendar stats
	getCalendarStats: typeof getCalendarStats;
	// AI tasks
	listAiTasks: typeof listAiTasks;
	getAiTask: typeof getAiTask;
	updateAiTask: typeof updateAiTask;
	dismissAiTaskByAgent: typeof dismissAiTaskByAgent;
	// Utils
	formatDailyStatus: typeof formatDailyStatus;
	// Resolves "today" in the user's stored timezone (server-side day bucketing).
	todayForUser: (userId: string) => Promise<string>;
	// Downloads external step image links into normal uploads
	importImageFromUrl: typeof importImageFromUrl;
	discardImportedImages: typeof discardImportedImages;
	// Open Food Facts
	fetchProduct: typeof fetchProduct;
	searchProductsResult: typeof searchProductsResult;
};

/**
 * The preferences an assistant may change: what the app shows and how logging
 * a favourite behaves. Language, time zone, biological sex, AI-task routing
 * (which decides what server-side Claude is billed for), the caloric-lag
 * override of one insight card and the legacy combined day-details toggle
 * stay with the user's own settings screen.
 */
export const ASSISTANT_PREFERENCE_FIELDS = [
	'showChartWidget',
	'showFavoritesWidget',
	'showSupplementsWidget',
	'showWeightWidget',
	'showMealBreakdownWidget',
	'showTopFoodsWidget',
	'showSleepWidget',
	'showFastingWidget',
	'showWaterWidget',
	'showActivityWidget',
	'showNotesWidget',
	'showRecipeSuggestionsWidget',
	'widgetOrder',
	'startPage',
	'favoriteTapAction',
	'favoriteMealAssignmentMode',
	'favoriteMealTimeframes',
	'mealOrder',
	'pinnedInsights',
	'visibleNutrients',
	'waterGoalMl',
	'activityGoalAdjustment',
	'activityCreditPercent'
] as const satisfies readonly (keyof (typeof preferencesUpdateSchema)['shape'])[];

// Checks a partial update can trip although each field it sends is valid.
const CONSTRAINT_ERRORS: Record<string, string> = {
	fasting_sessions_range_valid: 'endedAt must be after startedAt',
	reminders_meal_type_required:
		"mealType is required when kind is 'meal', and must be omitted otherwise"
};

function errorPayload(e: unknown): {
	error: string;
	issues?: Array<{ path: string; message: string }>;
} {
	if (isZodError(e)) {
		return {
			error: 'validation_failed',
			issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
		};
	}
	const constraint = pgConstraintName(e);
	if (constraint && Object.hasOwn(CONSTRAINT_ERRORS, constraint)) {
		return { error: CONSTRAINT_ERRORS[constraint]! };
	}
	// Only messages written for the caller reach the model; anything else may
	// carry internals and is an unexpected failure worth reporting.
	if (e instanceof McpUserError || (e instanceof ApiError && e.status < 500)) {
		return { error: e.message };
	}
	Sentry.captureException(e, { tags: { source: 'mcp' } });
	return { error: 'Internal error. The request could not be completed.' };
}

export function createHandlers(d: HandlerDeps) {
	function wrapError(op: string, e: unknown): never {
		if (e instanceof McpUserError || (e instanceof ApiError && e.status < 500)) {
			throw new McpUserError(`Failed to ${op}: ${e.message}`);
		}
		throw new McpUserError(`Failed to ${op}`, { cause: e });
	}

	const MAX_RANGE_DAYS = 366;

	function guardDateRange(startDate: string, endDate: string) {
		const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
		if (diffMs < 0) return { error: 'startDate must be before endDate' };
		if (diffMs > MAX_RANGE_DAYS * 86_400_000)
			return { error: `Date range exceeds maximum of ${MAX_RANGE_DAYS} days` };
		return null;
	}

	const getDailyStatusForDate = async (userId: string, date: string) => {
		const [{ items: entries }, goals, dayProperties, preferences] = await Promise.all([
			d.listEntriesByDate(userId, date),
			d.getGoals(userId),
			d.getDayProperties(userId, date),
			d.getPreferences(userId)
		]);
		return d.formatDailyStatus({ entries, goals, dayProperties, preferences });
	};

	const handleGetDailyStatus = async (userId: string, date?: string, includeEntries?: boolean) => {
		try {
			const targetDate = date ?? (await d.todayForUser(userId));
			const [{ items: entries }, goals, dayProperties, preferences] = await Promise.all([
				d.listEntriesByDate(userId, targetDate),
				d.getGoals(userId),
				d.getDayProperties(userId, targetDate),
				d.getPreferences(userId)
			]);
			const status = d.formatDailyStatus({ entries, goals, dayProperties, preferences });
			if (includeEntries) {
				return { ...status, date: targetDate, entries };
			}
			return { ...status, date: targetDate };
		} catch (e) {
			wrapError('get daily status', e);
		}
	};

	const handleSearchFoods = async (
		userId: string,
		query: string,
		limit?: number,
		offset?: number
	) => {
		try {
			const [{ items: foods }, recentFoods] = await Promise.all([
				d.listFoods(userId, { query, limit: limit ?? 50, offset }),
				d.listRecentFoods(userId, 100)
			]);
			const recentIds = new Set(recentFoods.map((f: { id: string }) => f.id));
			const annotated = foods.map((f: { id: string }) => ({
				...f,
				recentlyUsed: recentIds.has(f.id)
			}));
			annotated.sort((a: { recentlyUsed: boolean }, b: { recentlyUsed: boolean }) => {
				if (a.recentlyUsed !== b.recentlyUsed) return a.recentlyUsed ? -1 : 1;
				return 0;
			});
			return { foods: annotated };
		} catch (e) {
			wrapError('search foods', e);
		}
	};

	const handleCreateFood = async (userId: string, payload: unknown) => {
		try {
			const result = await d.createFood(userId, payload);
			if (!result.success) return errorPayload(result.error);
			return { foodId: result.data.id, success: true, food: result.data };
		} catch (e) {
			wrapError('create food', e);
		}
	};

	const discardImported = async (urls: string[], userId: string) => {
		if (urls.length > 0) await d.discardImportedImages(urls, userId);
	};

	const MAX_STEP_IMAGE_DOWNLOADS = 20;
	const STEP_IMAGE_CONCURRENCY = 4;
	const isExternalImageLink = (value: unknown): value is string =>
		typeof value === 'string' && /^https?:\/\//i.test(value);

	/**
	 * Agents pass step photos as external links. Each one is downloaded once and
	 * stored like an upload, and the step gets the resulting `/uploads/...` URL.
	 * A link that fails is an error for the whole call — never a silently missing
	 * photo. Links in `keep` (already stored on the recipe being updated) are left
	 * as they are. `imported` lists the files created so a failed write can drop them.
	 */
	const importStepImages = async (
		userId: string,
		payload: unknown,
		keep: Set<string> = new Set()
	): Promise<{ payload: unknown; imported: string[] }> => {
		const steps = (payload as { steps?: unknown } | null)?.steps;
		if (!Array.isArray(steps)) return { payload, imported: [] };

		const links = [
			...new Set(
				steps
					.map((step) => (step as { imageUrl?: unknown } | null)?.imageUrl)
					.filter(isExternalImageLink)
					.filter((url) => !keep.has(url))
			)
		];
		if (links.length === 0) return { payload, imported: [] };
		if (links.length > MAX_STEP_IMAGE_DOWNLOADS) {
			throw new McpUserError(
				`Too many step images to download in one call (${links.length}, max ${MAX_STEP_IMAGE_DOWNLOADS})`
			);
		}

		const stored = new Map<string, string>();
		const failures: { url: string; error: unknown }[] = [];
		for (let i = 0; i < links.length && failures.length === 0; i += STEP_IMAGE_CONCURRENCY) {
			await Promise.all(
				links.slice(i, i + STEP_IMAGE_CONCURRENCY).map(async (url) => {
					try {
						stored.set(
							url,
							await d.importImageFromUrl(url, userId, {
								maxDim: RECIPE_STEP_MAX_DIM,
								fit: 'inside'
							})
						);
					} catch (error) {
						failures.push({ url, error });
					}
				})
			);
		}
		if (failures.length > 0) {
			await d.discardImportedImages([...stored.values()], userId);
			const { url, error } = failures[0];
			const step =
				steps.findIndex((s) => (s as { imageUrl?: unknown } | null)?.imageUrl === url) + 1;
			throw new McpUserError(
				`Step ${step} image could not be imported from ${url}: ${error instanceof Error ? error.message : String(error)}`
			);
		}

		return {
			payload: {
				...(payload as object),
				steps: steps.map((step) => {
					const url = (step as { imageUrl?: unknown } | null)?.imageUrl;
					return isExternalImageLink(url) && stored.has(url)
						? { ...(step as object), imageUrl: stored.get(url) }
						: step;
				})
			},
			imported: [...stored.values()]
		};
	};

	const withIncludedRecipes = async (
		userId: string,
		payload: Record<string, unknown>,
		baseIngredients: () => Promise<unknown[]>
	) => {
		const { includeRecipes, ...rest } = payload as Record<string, unknown> & {
			includeRecipes?: IncludeRecipes;
		};
		if (!includeRecipes?.length) return rest;
		const expanded = await d.expandIncludedRecipes(userId, includeRecipes);
		const ingredients = [...(await baseIngredients()), ...expanded];
		if (ingredients.length > MAX_RECIPE_INGREDIENTS) {
			throw new McpUserError(
				`A recipe can have at most ${MAX_RECIPE_INGREDIENTS} ingredients; the combined list has ${ingredients.length}`
			);
		}
		return { ...rest, ingredients };
	};

	const handleCreateRecipe = async (userId: string, rawPayload: unknown) => {
		try {
			const payload = await withIncludedRecipes(
				userId,
				(rawPayload ?? {}) as Record<string, unknown>,
				async () => {
					const own = (rawPayload as { ingredients?: unknown[] } | undefined)?.ingredients;
					return Array.isArray(own) ? own : [];
				}
			);
			if (!Array.isArray(payload.ingredients) || payload.ingredients.length === 0) {
				return { error: 'A recipe needs at least one ingredient (ingredients or includeRecipes)' };
			}
			const prepared = await importStepImages(userId, payload);
			let result;
			try {
				result = await d.createRecipe(userId, prepared.payload);
			} catch (e) {
				await discardImported(prepared.imported, userId);
				throw e;
			}
			if (!result.success) {
				await discardImported(prepared.imported, userId);
				return errorPayload(result.error);
			}
			return { recipeId: result.data.id, success: true, recipe: result.data };
		} catch (e) {
			wrapError('create recipe', e);
		}
	};

	const handleLogFood = async (userId: string, payload: unknown) => {
		try {
			const result = await d.createEntry(userId, payload);
			if (!result.success) return errorPayload(result.error);
			const date = result.data.date ?? (await d.todayForUser(userId));
			const dailyStatus = await getDailyStatusForDate(userId, date);
			return { entryId: result.data.id, success: true, dailyStatus };
		} catch (e) {
			wrapError('log food', e);
		}
	};

	const handleGetSupplementStatus = async (userId: string, date?: string) => {
		try {
			const targetDate = date ?? (await d.todayForUser(userId));
			const items = await d.getSupplementChecklist(userId, targetDate);

			const checklist = items.map((item) => ({
				id: item.supplement.id,
				name: item.supplement.name,
				ingredients: (item.supplement.ingredients ?? []).map((ing) => ({
					foodId: ing.foodId,
					name: ing.food.name,
					servings: ing.servings
				})),
				taken: item.taken,
				takenAt: item.takenAt
			}));

			const taken = checklist.filter((c) => c.taken).length;
			return {
				date: targetDate,
				total: checklist.length,
				taken,
				pending: checklist.length - taken,
				supplements: checklist
			};
		} catch (e) {
			wrapError('get supplement status', e);
		}
	};

	const handleLogSupplement = async (
		userId: string,
		args: { name?: string; supplementId?: string; date?: string }
	) => {
		try {
			const targetDate = args.date ?? (await d.todayForUser(userId));
			let id = args.supplementId;

			if (!id && args.name) {
				const allSupplements = await d.listSupplements(userId, true);
				const match = allSupplements.find((s) =>
					s.name.toLowerCase().includes(args.name!.toLowerCase())
				);
				if (!match) {
					return { success: false, error: `No supplement found matching "${args.name}"` };
				}
				id = match.id;
			}

			if (!id) {
				return { success: false, error: 'Provide either name or supplementId' };
			}

			const supplement = await d.getSupplementById(userId, id);
			if (!supplement) return { success: false, error: 'Supplement not found' };

			const result = await d.logSupplement(userId, id, targetDate);
			if (!result.success) {
				return { success: false, ...errorPayload(result.error) };
			}

			const items = await d.getSupplementChecklist(userId, targetDate);
			const checklist = items.map((item) => ({
				id: item.supplement.id,
				name: item.supplement.name,
				taken: item.taken
			}));
			const takenCount = checklist.filter((c) => c.taken).length;

			return {
				success: true,
				logged: {
					name: supplement.name,
					ingredients: (supplement.ingredients ?? []).map((ing) => ({
						foodId: ing.foodId,
						name: ing.food.name,
						servings: ing.servings
					})),
					date: targetDate
				},
				status: {
					total: checklist.length,
					taken: takenCount,
					pending: checklist.length - takenCount
				}
			};
		} catch (e) {
			wrapError('log supplement', e);
		}
	};

	const handleListEntries = async (userId: string, date?: string) => {
		try {
			const targetDate = date ?? (await d.todayForUser(userId));
			const { items: entries } = await d.listEntriesByDate(userId, targetDate);
			return { date: targetDate, entries };
		} catch (e) {
			wrapError('list entries', e);
		}
	};

	const handleUpdateEntry = async (
		userId: string,
		args: {
			entryId: string;
			foodId?: string;
			recipeId?: string;
			date?: string;
			servings?: number;
			mealType?: string;
			notes?: string | null;
			eatenAt?: string;
			quickName?: string | null;
			quickCalories?: number | null;
			quickProtein?: number | null;
			quickCarbs?: number | null;
			quickFat?: number | null;
			quickFiber?: number | null;
		}
	) => {
		try {
			const { entryId, ...rest } = args;
			const result = await d.updateEntry(userId, entryId, rest);
			if (!result.success) return errorPayload(result.error);
			if (!result.data) return { error: 'Entry not found' };
			const dailyStatus = await getDailyStatusForDate(userId, result.data.date);
			return { success: true, entryId, dailyStatus };
		} catch (e) {
			wrapError('update entry', e);
		}
	};

	const handleDeleteEntry = async (userId: string, entryId: string, date?: string) => {
		try {
			const deleted = await d.deleteEntry(userId, entryId);
			if (!deleted) return { error: 'Entry not found' };
			const targetDate = date ?? deleted.date;
			const dailyStatus = await getDailyStatusForDate(userId, targetDate);
			return { success: true, dailyStatus };
		} catch (e) {
			wrapError('delete entry', e);
		}
	};

	const handleGetGoals = async (userId: string) => {
		try {
			const goals = await d.getGoals(userId);
			return { goals };
		} catch (e) {
			wrapError('get goals', e);
		}
	};

	const handleUpdateGoals = async (userId: string, payload: unknown) => {
		try {
			const result = await d.upsertGoals(userId, payload);
			if (!result.success) return errorPayload(result.error);
			return { success: true, goals: result.data };
		} catch (e) {
			wrapError('update goals', e);
		}
	};

	const handleListRecipes = async (userId: string, args: { query?: string } = {}) => {
		try {
			const { items: recipes } = await d.listRecipes(userId, { query: args.query });
			return { recipes };
		} catch (e) {
			wrapError('list recipes', e);
		}
	};

	const handleGetRecipe = async (userId: string, recipeId: string) => {
		try {
			const recipe = await d.getRecipe(userId, recipeId);
			if (!recipe) return { error: 'Recipe not found' };
			return recipe;
		} catch (e) {
			wrapError('get recipe', e);
		}
	};

	const handleGetFood = async (userId: string, foodId: string) => {
		try {
			const food = await d.getFood(userId, foodId);
			if (!food) return { error: 'Food not found' };
			return food;
		} catch (e) {
			wrapError('get food', e);
		}
	};

	const handleListFavorites = async (userId: string) => {
		try {
			const [foods, recipes] = await Promise.all([
				d.listFavoriteFoods(userId),
				d.listFavoriteRecipes(userId)
			]);
			return { foods, recipes };
		} catch (e) {
			wrapError('list favorites', e);
		}
	};

	const handleLogWeight = async (
		userId: string,
		args: { weightKg: number; date?: string; notes?: string | null }
	) => {
		try {
			const previous = await d.getLatestWeight(userId);
			const result = await d.createWeightEntry(userId, {
				weightKg: args.weightKg,
				entryDate: args.date,
				notes: args.notes
			});
			if (!result.success) return errorPayload(result.error);
			return {
				success: true,
				entryId: result.data.id,
				weightKg: result.data.weightKg,
				date: result.data.entryDate,
				change: previous
					? {
							previousKg: previous.weightKg,
							previousDate: previous.entryDate,
							deltaKg: Math.round((result.data.weightKg - previous.weightKg) * 100) / 100
						}
					: null
			};
		} catch (e) {
			wrapError('log weight', e);
		}
	};

	const handleGetWeight = async (userId: string, args: { from?: string; to?: string }) => {
		try {
			if (args.from || args.to) {
				if (!args.from || !args.to) {
					return {
						error: 'Provide both "from" and "to" for a date range, or omit both for latest weight'
					};
				}
				return await d.getWeightWithTrend(userId, args.from, args.to);
			}
			const latest = await d.getLatestWeight(userId);
			return latest ?? { error: 'No weight entries found' };
		} catch (e) {
			wrapError('get weight', e);
		}
	};

	const handleGetWeeklyStats = async (userId: string, startDate?: string, endDate?: string) => {
		try {
			if (startDate && endDate) {
				const err = guardDateRange(startDate, endDate);
				if (err) return err;
				const [entries, fastingDaySet] = await Promise.all([
					d.listEntriesByDateRange(userId, startDate, endDate),
					d.getFastingDays(userId, startDate, endDate)
				]);
				return d.computeAverages(entries, fastingDaySet);
			}
			return await d.getWeeklyStats(userId);
		} catch (e) {
			wrapError('get weekly stats', e);
		}
	};

	const handleGetMonthlyStats = async (userId: string, startDate?: string, endDate?: string) => {
		try {
			if (startDate && endDate) {
				const err = guardDateRange(startDate, endDate);
				if (err) return err;
				const [entries, fastingDaySet] = await Promise.all([
					d.listEntriesByDateRange(userId, startDate, endDate),
					d.getFastingDays(userId, startDate, endDate)
				]);
				return d.computeAverages(entries, fastingDaySet);
			}
			return await d.getMonthlyStats(userId);
		} catch (e) {
			wrapError('get monthly stats', e);
		}
	};

	const handleCopyEntries = async (userId: string, args: { fromDate: string; toDate?: string }) => {
		try {
			const targetDate = args.toDate ?? (await d.todayForUser(userId));
			const copied = await d.copyEntries(userId, args.fromDate, targetDate);
			const dailyStatus = await getDailyStatusForDate(userId, targetDate);
			return { success: true, copiedCount: copied.length, dailyStatus };
		} catch (e) {
			wrapError('copy entries', e);
		}
	};

	const handleFindFoodByBarcode = async (userId: string, barcode: string) => {
		try {
			const food = await d.findFoodByBarcode(userId, barcode);
			if (food) return { found: true, source: 'database' as const, ...food };
			const offProduct = await d.fetchProduct(barcode);
			if (offProduct) {
				return {
					found: true,
					source: 'openfoodfacts' as const,
					...offProduct,
					hint: 'This food was found in Open Food Facts. Use create_food to save it to your database.'
				};
			}
			return { found: false };
		} catch (e) {
			wrapError('find food by barcode', e);
		}
	};

	const handleUpdateFood = async (
		userId: string,
		args: { foodId: string; [key: string]: unknown }
	) => {
		try {
			const { foodId, ...rest } = args;
			const result = await d.updateFood(userId, foodId, rest);
			if (!result.success) return errorPayload(result.error);
			if (!result.data) return { error: 'Food not found' };
			return { success: true, foodId };
		} catch (e) {
			wrapError('update food', e);
		}
	};

	const handleDeleteFood = async (userId: string, args: { foodId: string; force?: boolean }) => {
		try {
			const result = await d.deleteFood(userId, args.foodId, args.force ?? false);
			if (result.blocked && result.lastIngredientRecipes?.length)
				return {
					blocked: true,
					entryCount: result.entryCount,
					lastIngredientRecipes: result.lastIngredientRecipes,
					hint: 'The food is the only ingredient of these recipes; force cannot delete it. Add another ingredient to them or delete the recipes first'
				};
			if (result.blocked)
				return {
					blocked: true,
					entryCount: result.entryCount,
					hint: 'Use force=true to delete with all entries'
				};
			return { success: true };
		} catch (e) {
			wrapError('delete food', e);
		}
	};

	const handleListRecentFoods = async (userId: string, args: { limit?: number }) => {
		try {
			return d.listRecentFoods(userId, args.limit ?? 25);
		} catch (e) {
			wrapError('list recent foods', e);
		}
	};

	const handleMergeFoods = async (
		userId: string,
		args: { keeperId: string; sourceIds: string[]; overrides?: Record<string, unknown> }
	) => {
		try {
			const result = await d.mergeFoods(userId, args);
			if (!result.success) return errorPayload(result.error);
			return { success: true, food: result.data };
		} catch (e) {
			wrapError('merge foods', e);
		}
	};

	const handleFindDuplicateFoods = async (userId: string) => {
		try {
			const groups = await d.findDuplicateGroups(userId);
			return { total: groups.length, groups };
		} catch (e) {
			wrapError('find duplicate foods', e);
		}
	};

	const handleUpdateRecipe = async (
		userId: string,
		args: { recipeId: string; [key: string]: unknown }
	) => {
		try {
			const { recipeId, ...input } = args;
			const rest = await withIncludedRecipes(userId, input, async () => {
				if (Array.isArray(input.ingredients)) return input.ingredients;
				const current = await d.getRecipe(userId, recipeId);
				if (!current) throw new McpUserError('Recipe not found');
				return current.ingredients.map(({ foodId, quantity, servingUnit }) => ({
					foodId,
					quantity,
					servingUnit
				}));
			});
			let prepared: { payload: unknown; imported: string[] } = { payload: rest, imported: [] };
			if (
				Array.isArray(rest.steps) &&
				rest.steps.some((step) => isExternalImageLink(step?.imageUrl))
			) {
				const current = await d.getRecipe(userId, recipeId);
				if (!current) return { error: 'Recipe not found' };
				const keep = new Set(
					(current.steps ?? []).map((step) => step.imageUrl).filter((url): url is string => !!url)
				);
				prepared = await importStepImages(userId, rest, keep);
			}
			let result;
			try {
				result = await d.updateRecipe(userId, recipeId, prepared.payload);
			} catch (e) {
				await discardImported(prepared.imported, userId);
				throw e;
			}
			if (!result.success) {
				await discardImported(prepared.imported, userId);
				return errorPayload(result.error);
			}
			if (!result.data) {
				await discardImported(prepared.imported, userId);
				return { error: 'Recipe not found' };
			}
			return { success: true, recipeId };
		} catch (e) {
			wrapError('update recipe', e);
		}
	};

	const handleDeleteRecipe = async (
		userId: string,
		args: { recipeId: string; force?: boolean }
	) => {
		try {
			const result = await d.deleteRecipe(userId, args.recipeId, args.force ?? false);
			if (result.blocked)
				return {
					blocked: true,
					entryCount: result.entryCount,
					hint: 'Use force=true to delete with all entries'
				};
			return { success: true };
		} catch (e) {
			wrapError('delete recipe', e);
		}
	};

	/**
	 * Normalize a supplement ingredient payload for the validation layer. MCP
	 * agents pass abbreviated inline foods ({ name, ingredientsText, nutrients })
	 * — we fill in the macro defaults (zero calories/macros, servingSize=1,
	 * servingUnit='g') that `foodCreateSchema` requires.
	 */
	const normalizeSupplementIngredients = (ingredients: unknown): unknown => {
		if (!Array.isArray(ingredients)) return ingredients;
		return ingredients.map((raw) => {
			const ing = raw as { foodId?: unknown; food?: Record<string, unknown>; servings?: unknown };
			if (ing.food && typeof ing.food === 'object') {
				return {
					...ing,
					food: {
						servingSize: 1,
						servingUnit: 'g',
						calories: 0,
						protein: 0,
						carbs: 0,
						fat: 0,
						fiber: 0,
						...ing.food
					}
				};
			}
			return ing;
		});
	};

	const handleCreateSupplement = async (userId: string, args: unknown) => {
		try {
			const normalized =
				args && typeof args === 'object'
					? {
							...(args as Record<string, unknown>),
							ingredients: normalizeSupplementIngredients(
								(args as { ingredients?: unknown }).ingredients
							)
						}
					: args;
			const result = await d.createSupplement(userId, normalized);
			if (!result.success) return errorPayload(result.error);
			return { success: true, supplementId: result.data.id };
		} catch (e) {
			wrapError('create supplement', e);
		}
	};

	const handleListSupplements = async (userId: string, args: { activeOnly?: boolean }) => {
		try {
			return { supplements: await d.listSupplements(userId, args.activeOnly ?? true) };
		} catch (e) {
			wrapError('list supplements', e);
		}
	};

	const handleUpdateSupplement = async (
		userId: string,
		args: { supplementId: string; [key: string]: unknown }
	) => {
		try {
			const { supplementId, ...rest } = args;
			const normalized = {
				...rest,
				...(rest.ingredients !== undefined
					? { ingredients: normalizeSupplementIngredients(rest.ingredients) }
					: {})
			};
			const result = await d.updateSupplement(userId, supplementId, normalized);
			if (!result.success) return errorPayload(result.error);
			if (!result.data) return { error: 'Supplement not found' };
			return { success: true, supplementId };
		} catch (e) {
			wrapError('update supplement', e);
		}
	};

	const handleDeleteSupplement = async (userId: string, args: { supplementId: string }) => {
		try {
			await d.deleteSupplement(userId, args.supplementId);
			return { success: true };
		} catch (e) {
			wrapError('delete supplement', e);
		}
	};

	const handleUnlogSupplement = async (
		userId: string,
		args: { supplementId: string; date?: string }
	) => {
		try {
			await d.unlogSupplement(
				userId,
				args.supplementId,
				args.date ?? (await d.todayForUser(userId))
			);
			return { success: true };
		} catch (e) {
			wrapError('unlog supplement', e);
		}
	};

	const handleUpdateWeight = async (
		userId: string,
		args: { weightId: string; [key: string]: unknown }
	) => {
		try {
			const { weightId, ...rest } = args;
			const result = await d.updateWeightEntry(userId, weightId, rest);
			if (!result.success) return errorPayload(result.error);
			if (!result.data) return { error: 'Weight entry not found' };
			return { success: true, weightId };
		} catch (e) {
			wrapError('update weight', e);
		}
	};

	const handleDeleteWeight = async (userId: string, args: { weightId: string }) => {
		try {
			const deleted = await d.deleteWeightEntry(userId, args.weightId);
			if (!deleted) return { error: 'Weight entry not found' };
			return { success: true };
		} catch (e) {
			wrapError('delete weight', e);
		}
	};

	const handleGetDailyBreakdown = async (
		userId: string,
		args: { startDate: string; endDate: string }
	) => {
		try {
			const err = guardDateRange(args.startDate, args.endDate);
			if (err) return err;
			const [days, dayProps] = await Promise.all([
				d.getDailyBreakdown(userId, args.startDate, args.endDate),
				d.getDayPropertiesRange(userId, args.startDate, args.endDate)
			]);
			const byDate = new Map(dayProps.map((p) => [p.date, p]));
			return days.map((day) => {
				const props = byDate.get(day.date);
				return {
					...day,
					...(props?.waterMl != null ? { waterMl: props.waterMl } : {}),
					...(props?.activityCalories != null ? { activityCalories: props.activityCalories } : {}),
					...(props?.activityNote ? { activityNote: props.activityNote } : {})
				};
			});
		} catch (e) {
			wrapError('get daily breakdown', e);
		}
	};

	const handleGetMealBreakdown = async (
		userId: string,
		args: { startDate: string; endDate: string }
	) => {
		try {
			const err = guardDateRange(args.startDate, args.endDate);
			if (err) return err;
			return d.getMealBreakdown(userId, args.startDate, args.endDate);
		} catch (e) {
			wrapError('get meal breakdown', e);
		}
	};

	const handleGetTopFoods = async (
		userId: string,
		args: { days?: number; limit?: number; sort?: TopFoodsSort }
	) => {
		try {
			return d.getTopFoods(userId, args.days ?? 7, args.limit ?? 10, args.sort);
		} catch (e) {
			wrapError('get top foods', e);
		}
	};

	const handleGetMaintenanceCalories = async (
		userId: string,
		args: { startDate?: string; endDate?: string; muscleRatio?: number }
	) => {
		try {
			const endDate = args.endDate ?? (await d.todayForUser(userId));
			const startDate = args.startDate ?? shiftDate(endDate, -27);
			const err = guardDateRange(startDate, endDate);
			if (err) return err;
			const [entries, weights, fastingDays] = await Promise.all([
				d.listEntriesByDateRange(userId, startDate, endDate),
				d.getWeightEntriesByDateRange(userId, startDate, endDate),
				d.getFastingDays(userId, startDate, endDate)
			]);
			return buildMaintenanceReport({
				entries,
				weights,
				fastingDays,
				startDate,
				endDate,
				muscleRatio: args.muscleRatio
			});
		} catch (e) {
			wrapError('get maintenance calories', e);
		}
	};

	const RDA_KEY_SET = new Set(RDA_VALUES.map((rda) => rda.nutrientKey));
	const DEFAULT_GAP_WINDOW_DAYS = 30;

	/** Resolves the analysis window shared by every nutrient tool. */
	const resolveWindow = async (
		userId: string,
		startDate?: string,
		endDate?: string,
		span = DEFAULT_GAP_WINDOW_DAYS
	) => {
		const end = endDate ?? (await d.todayForUser(userId));
		return { startDate: startDate ?? shiftDate(end, -(span - 1)), endDate: end };
	};

	/**
	 * `entries` can be passed in by a caller that already needs them, so the 31-nutrient
	 * entry query runs once per tool call rather than once per consumer.
	 */
	const gapReportFor = async (
		userId: string,
		window: { startDate: string; endDate: string },
		overrides: {
			biologicalSex?: 'male' | 'female';
			minCoverage?: number;
			topContributors?: number;
		},
		prefetchedEntries?: Awaited<ReturnType<typeof d.getRdaNutrientEntries>>
	) => {
		const [entries, goals, prefSex] = await Promise.all([
			prefetchedEntries ?? d.getRdaNutrientEntries(userId, window.startDate, window.endDate),
			d.getGoals(userId),
			d.getBiologicalSex(userId)
		]);
		const sex = overrides.biologicalSex ?? prefSex;
		const report = buildNutrientGapReport({
			entries,
			sex,
			goals,
			minCoverage: overrides.minCoverage ?? MIN_NUTRIENT_COVERAGE,
			topContributors: overrides.topContributors ?? 3,
			window
		});
		return {
			report,
			biologicalSexSource: overrides.biologicalSex
				? ('argument' as const)
				: prefSex
					? ('preference' as const)
					: ('unknown' as const)
		};
	};

	const handleGetNutrientGaps = async (
		userId: string,
		args: {
			startDate?: string;
			endDate?: string;
			biologicalSex?: 'male' | 'female';
			minCoverage?: number;
			includeAdequate?: boolean;
			topContributors?: number;
		}
	) => {
		try {
			const window = await resolveWindow(userId, args.startDate, args.endDate);
			const err = guardDateRange(window.startDate, window.endDate);
			if (err) return err;
			const { report, biologicalSexSource } = await gapReportFor(userId, window, args);
			return {
				...report,
				biologicalSexSource,
				nutrients:
					args.includeAdequate === false
						? report.nutrients.filter((row) => row.verdict !== 'likely_adequate')
						: report.nutrients
			};
		} catch (e) {
			wrapError('get nutrient gaps', e);
		}
	};

	/** Turns a gap row into the scoring input, honouring an explicit per-nutrient deficit. */
	const toGapInput = (row: NutrientGapRow, deficitOverride?: number): NutrientGapInput => ({
		key: row.key,
		unit: row.unit,
		label: row.label,
		deficitPerDay: deficitOverride ?? row.deficitPerDay,
		target: row.target,
		deficitFraction: Math.min(1, Math.max(0, 1 - row.pct / 100))
	});

	const handleFindNutrientSources = async (
		userId: string,
		args: {
			nutrients: string[];
			deficits?: Record<string, number>;
			includeFoods?: boolean;
			includeRecipes?: boolean;
			catalogQuery?: string;
			limit?: number;
		}
	) => {
		try {
			const unknown = args.nutrients.filter((key) => !RDA_KEY_SET.has(key));
			if (unknown.length > 0) {
				return {
					error: `Unknown nutrient key(s): ${unknown.join(', ')}. Valid keys: ${[...RDA_KEY_SET].join(', ')}`
				};
			}

			const window = await resolveWindow(userId);
			const { report } = await gapReportFor(userId, window, { topContributors: 0 });
			const byKey = new Map(report.nutrients.map((row) => [row.key, row]));

			const gaps: NutrientGapInput[] = [];
			const unmeasured: string[] = [];
			for (const key of args.nutrients) {
				const row = byKey.get(key);
				const override = args.deficits?.[key];
				if (!row) {
					// No intake data, so no measured shortfall: fall back to the whole reference
					// value as the target when the caller has not supplied one.
					const rda = RDA_VALUES.find((r) => r.nutrientKey === key);
					if (!rda || override === undefined) {
						unmeasured.push(key);
						continue;
					}
					gaps.push({
						key,
						unit: rda.unit,
						label: rda.label,
						deficitPerDay: override,
						target: override,
						deficitFraction: 1
					});
					continue;
				}
				gaps.push(toGapInput(row, override));
			}

			const targeted = gaps.filter((gap) => gap.deficitPerDay > 0);
			if (targeted.length === 0) {
				return {
					nutrients: gaps,
					avgCalories: report.avgCalories,
					candidates: [],
					notes: [
						unmeasured.length > 0
							? `No intake data for ${unmeasured.join(', ')} — pass an explicit deficit to rank sources for them.`
							: 'None of the requested nutrients is currently short, so there is nothing to close.'
					]
				};
			}

			const candidates = await d.getNutrientCandidates(userId, {
				keys: targeted.map((gap) => gap.key),
				includeFoods: args.includeFoods,
				includeRecipes: args.includeRecipes,
				catalogQuery: args.catalogQuery
			});

			const scored = scoreNutrientCandidates(candidates, targeted, {
				avgCalories: report.avgCalories,
				today: window.endDate
			}).slice(0, args.limit ?? 10);

			const notes: string[] = [];
			if (scored.some((candidate) => candidate.kind === 'catalog')) {
				notes.push(
					'Catalog results are not in the user\u2019s food database yet — create them with create_food before logging.'
				);
			}
			if (unmeasured.length > 0) {
				notes.push(`No intake data for ${unmeasured.join(', ')}; they were skipped.`);
			}

			return { nutrients: targeted, avgCalories: report.avgCalories, candidates: scored, notes };
		} catch (e) {
			wrapError('find nutrient sources', e);
		}
	};

	const handleGetEatingPatterns = async (
		userId: string,
		args: { startDate?: string; endDate?: string }
	) => {
		try {
			const window = await resolveWindow(userId, args.startDate, args.endDate, 90);
			const err = guardDateRange(window.startDate, window.endDate);
			if (err) return err;
			const [entries, days, timeZone, latestWeight] = await Promise.all([
				d.getRdaNutrientEntries(userId, window.startDate, window.endDate),
				d.getDailyNutrientTotals(userId, window.startDate, window.endDate),
				d.getUserTimeZone(userId),
				d.getLatestWeight(userId)
			]);
			return {
				startDate: window.startDate,
				endDate: window.endDate,
				...buildEatingPatterns({
					entries,
					days,
					timeZone,
					bodyWeightKg: latestWeight?.weightKg ?? null
				})
			};
		} catch (e) {
			wrapError('get eating patterns', e);
		}
	};

	const handleGetMealPlanContext = async (
		userId: string,
		args: {
			planDays?: number;
			analysisDays?: number;
			maxFoods?: number;
			maxRecipes?: number;
			maxGapNutrients?: number;
		}
	) => {
		try {
			const analysisDays = args.analysisDays ?? DEFAULT_GAP_WINDOW_DAYS;
			const window = await resolveWindow(userId, undefined, undefined, analysisDays);
			const maxFoods = args.maxFoods ?? 40;
			const maxRecipes = args.maxRecipes ?? 20;
			const maxGapNutrients = args.maxGapNutrients ?? 8;

			const nutrientEntries = await d.getRdaNutrientEntries(
				userId,
				window.startDate,
				window.endDate
			);

			const [
				{ report },
				timeZone,
				goals,
				entries,
				weights,
				fastingDays,
				latestWeight,
				favoriteFoods,
				favoriteRecipes,
				topFoods,
				recipeList,
				mealTypes,
				dailyTotals
			] = await Promise.all([
				gapReportFor(userId, window, { topContributors: 0 }, nutrientEntries),
				d.getUserTimeZone(userId),
				d.getGoals(userId),
				d.listEntriesByDateRange(userId, window.startDate, window.endDate),
				d.getWeightEntriesByDateRange(userId, window.startDate, window.endDate),
				d.getFastingDays(userId, window.startDate, window.endDate),
				d.getLatestWeight(userId),
				d.listFavoriteFoods(userId, 15),
				d.listFavoriteRecipes(userId, 10),
				d.getTopFoods(userId, analysisDays, maxFoods),
				d.listRecipes(userId, { limit: maxRecipes }),
				d.listMealTypes(userId),
				d.getDailyNutrientTotals(userId, window.startDate, window.endDate)
			]);

			const patterns = buildEatingPatterns({
				entries: nutrientEntries,
				days: dailyTotals,
				timeZone,
				bodyWeightKg: latestWeight?.weightKg ?? null
			});

			const maintenance = buildMaintenanceReport({
				entries,
				weights,
				fastingDays,
				startDate: window.startDate,
				endDate: window.endDate
			});

			const trim = (name: string) => (name.length > 80 ? `${name.slice(0, 77)}...` : name);

			return {
				today: window.endDate,
				timeZone,
				planDays: args.planDays ?? 7,
				goals,
				maintenance,
				latestWeightKg: latestWeight?.weightKg ?? null,
				biologicalSex: report.biologicalSex,
				gaps: {
					window: { startDate: window.startDate, endDate: window.endDate, days: report.days },
					priority: report.nutrients
						.filter((row) => row.verdict !== 'likely_adequate')
						.slice(0, maxGapNutrients)
						.map((row) => ({
							key: row.key,
							label: row.label,
							unit: row.unit,
							avgIntake: row.avgIntake,
							target: row.target,
							pct: row.pct,
							verdict: row.verdict,
							deficitPerDay: row.deficitPerDay
						})),
					unmeasuredKeys: report.unmeasured.map((row) => row.key),
					adequateCount: report.summary.likelyAdequate
				},
				patterns: {
					avgFirstMealTime: patterns.mealTiming.avgFirstMealTime,
					avgLastMealTime: patterns.mealTiming.avgLastMealTime,
					avgWindowMinutes: patterns.mealTiming.avgWindowMinutes,
					mealRegularityScore: patterns.mealRegularity.overallScore,
					frontLoadingPct: patterns.calorieFrontLoading.avgMorningPct,
					proteinThresholdG: patterns.proteinThresholdG,
					avgUniqueFoodsPerWeek: patterns.foodDiversity.avgUniqueFoodsPerWeek
				},
				mealSlots: patterns.mealSlots.slice(0, 8),
				favorites: {
					foods: favoriteFoods.map((food) => ({
						id: food.id,
						name: trim(food.name),
						calories: food.calories,
						protein: food.protein
					})),
					recipes: favoriteRecipes.map((recipe) => ({
						id: recipe.id,
						name: trim(recipe.name)
					}))
				},
				topFoods: topFoods.map((food) => ({
					foodId: food.foodId,
					recipeId: food.recipeId,
					name: trim(food.foodName),
					count: food.count,
					calories: food.calories,
					protein: food.protein
				})),
				recipes: recipeList.items.map((recipe) => ({
					id: recipe.id,
					name: trim(recipe.name),
					totalServings: recipe.totalServings,
					isFavorite: recipe.isFavorite,
					labels: recipe.labels,
					perServing: {
						calories: recipe.calories / (recipe.totalServings || 1),
						protein: recipe.protein / (recipe.totalServings || 1),
						carbs: recipe.carbs / (recipe.totalServings || 1),
						fat: recipe.fat / (recipe.totalServings || 1),
						fiber: recipe.fiber / (recipe.totalServings || 1)
					}
				})),
				mealTypes,
				notes: [
					`${report.unmeasured.length} of ${RDA_VALUES.length} reference nutrients have no usable data — treat them as unknown, not adequate.`,
					'Recipes carry per-serving macros only; call get_recipe for ingredients.'
				]
			};
		} catch (e) {
			wrapError('get meal plan context', e);
		}
	};

	const handleGetStreaks = async (userId: string) => {
		try {
			return d.getStreaks(userId);
		} catch (e) {
			wrapError('get streaks', e);
		}
	};

	const handleSearchOpenFoodFacts = async (query: string, limit?: number) => {
		try {
			const { products, unavailable } = await d.searchProductsResult(query, limit ?? 5);
			if (unavailable) {
				return {
					products,
					count: 0,
					unavailable: true,
					hint: 'Open Food Facts did not answer. This is not an empty result: search again, or use find_food_by_barcode when a barcode is known.'
				};
			}
			return { products, count: products.length };
		} catch (e) {
			wrapError('search Open Food Facts', e);
		}
	};

	const handleLogSleep = async (
		userId: string,
		args: {
			durationMinutes: number;
			quality: number;
			date?: string;
			bedtime?: string | null;
			wakeTime?: string | null;
			wakeUps?: number | null;
			notes?: string | null;
		}
	) => {
		try {
			const result = await d.createSleepEntry(userId, {
				durationMinutes: args.durationMinutes,
				quality: args.quality,
				entryDate: args.date ?? (await d.todayForUser(userId)),
				bedtime: args.bedtime ?? null,
				wakeTime: args.wakeTime ?? null,
				wakeUps: args.wakeUps ?? null,
				notes: args.notes ?? null
			});
			if (!result.success) return errorPayload(result.error);
			return { success: true, entryId: result.data.id, entry: result.data };
		} catch (e) {
			wrapError('log sleep', e);
		}
	};

	const handleGetSleep = async (
		userId: string,
		args: { from?: string; to?: string; limit?: number }
	) => {
		try {
			if (args.from || args.to) {
				if (!args.from || !args.to) {
					return {
						error: 'Provide both "from" and "to" for a date range, or omit both for latest entry'
					};
				}
				const entries = await d.getSleepEntriesByDateRange(userId, args.from, args.to);
				return { entries: entries.slice(0, args.limit ?? 100) };
			}
			const latest = await d.getLatestSleep(userId);
			return latest ?? { error: 'No sleep entries found' };
		} catch (e) {
			wrapError('get sleep', e);
		}
	};

	const handleUpdateSleep = async (
		userId: string,
		args: {
			id: string;
			durationMinutes?: number;
			quality?: number;
			entryDate?: string;
			bedtime?: string | null;
			wakeTime?: string | null;
			wakeUps?: number | null;
			notes?: string | null;
		}
	) => {
		try {
			const { id, ...rest } = args;
			const result = await d.updateSleepEntry(userId, id, rest);
			if (!result.success) return errorPayload(result.error);
			if (!result.data) return { error: 'Sleep entry not found' };
			return { success: true, entryId: id };
		} catch (e) {
			wrapError('update sleep', e);
		}
	};

	const handleDeleteSleep = async (userId: string, args: { id: string }) => {
		try {
			const deleted = await d.deleteSleepEntry(userId, args.id);
			if (!deleted) return { error: 'Sleep entry not found' };
			return { success: true };
		} catch (e) {
			wrapError('delete sleep', e);
		}
	};

	// Analytics handlers
	const handleGetFoodDiversity = async (
		userId: string,
		args: { startDate: string; endDate: string }
	) => {
		try {
			const err = guardDateRange(args.startDate, args.endDate);
			if (err) return err;
			return d.getFoodDiversityData(userId, args.startDate, args.endDate);
		} catch (e) {
			wrapError('get food diversity', e);
		}
	};

	const handleGetMealTiming = async (
		userId: string,
		args: { startDate: string; endDate: string }
	) => {
		try {
			const err = guardDateRange(args.startDate, args.endDate);
			if (err) return err;
			return d.getMealTimingData(userId, args.startDate, args.endDate);
		} catch (e) {
			wrapError('get meal timing', e);
		}
	};

	const handleGetSleepFoodCorrelation = async (
		userId: string,
		args: { startDate: string; endDate: string }
	) => {
		try {
			const err = guardDateRange(args.startDate, args.endDate);
			if (err) return err;
			return d.getSleepFoodCorrelationData(userId, args.startDate, args.endDate);
		} catch (e) {
			wrapError('get sleep-food correlation', e);
		}
	};

	const handleGetWeightFoodSeries = async (
		userId: string,
		args: { startDate: string; endDate: string }
	) => {
		try {
			const err = guardDateRange(args.startDate, args.endDate);
			if (err) return err;
			return d.getWeightFoodSeries(userId, args.startDate, args.endDate);
		} catch (e) {
			wrapError('get weight-food series', e);
		}
	};

	const handleGetExtendedNutrients = async (
		userId: string,
		args: { startDate: string; endDate: string }
	) => {
		try {
			const err = guardDateRange(args.startDate, args.endDate);
			if (err) return err;
			return d.getExtendedNutrientEntries(userId, args.startDate, args.endDate);
		} catch (e) {
			wrapError('get extended nutrients', e);
		}
	};

	const handleGetDailyNutrients = async (
		userId: string,
		args: { startDate: string; endDate: string }
	) => {
		try {
			const err = guardDateRange(args.startDate, args.endDate);
			if (err) return err;
			return d.getDailyNutrientTotals(userId, args.startDate, args.endDate);
		} catch (e) {
			wrapError('get daily nutrients', e);
		}
	};

	// Meal types handler
	const handleListMealTypes = async (userId: string) => {
		try {
			const mealTypes = await d.listMealTypes(userId);
			return { mealTypes };
		} catch (e) {
			wrapError('list meal types', e);
		}
	};

	// Supplement history handler
	const handleGetSupplementHistory = async (userId: string, args: { from: string; to: string }) => {
		try {
			const err = guardDateRange(args.from, args.to);
			if (err) return err;
			const history = await d.getLogsForRange(userId, args.from, args.to);
			return { history };
		} catch (e) {
			wrapError('get supplement history', e);
		}
	};

	// Day properties handlers
	const handleGetDayProperties = async (userId: string, args: { date: string }) => {
		try {
			const properties = await d.getDayProperties(userId, args.date);
			return { date: args.date, properties };
		} catch (e) {
			wrapError('get day properties', e);
		}
	};

	const handleSetDayProperties = async (
		userId: string,
		args: { date: string } & DayPropertiesPatch
	) => {
		try {
			const { date, ...patch } = args;
			const properties = await d.setDayProperties(userId, date, patch);
			return { success: true, properties };
		} catch (e) {
			wrapError('set day properties', e);
		}
	};

	const handleDeleteDayProperties = async (userId: string, args: { date: string }) => {
		try {
			await d.deleteDayProperties(userId, args.date);
			return { success: true };
		} catch (e) {
			wrapError('delete day properties', e);
		}
	};

	// Calendar stats handler
	const handleGetCalendarStats = async (userId: string, args: { month: string }) => {
		try {
			const [yearStr, monthStr] = args.month.split('-');
			const year = parseInt(yearStr, 10);
			const month = parseInt(monthStr, 10) - 1;
			return d.getCalendarStats(userId, year, month);
		} catch (e) {
			wrapError('get calendar stats', e);
		}
	};

	// AI task queue handlers
	const AI_TASK_PHOTO_FILENAME_RE = /^[a-f0-9-]+\.webp$/;

	const serializeAiTask = (task: AiTask) => ({
		id: task.id,
		status: task.status,
		description: task.description,
		photoCount: task.photoUrls?.length ?? 0,
		date: task.date,
		mealType: task.mealType,
		eatenAt: task.eatenAt,
		source: task.source,
		resultSummary: task.resultSummary,
		createdEntryIds: task.createdEntryIds,
		createdAt: task.createdAt,
		completedAt: task.completedAt,
		dismissedAt: task.dismissedAt,
		processedBy: task.processedBy
	});

	// Shown once, above the task list, when the user has routed queued tasks to
	// their iPhone — so an assistant that gets asked to "check my tasks" doesn't
	// silently double-log meals the phone is already handling on its own.
	const DEVICE_PROCESSOR_NOTE =
		"The user has routed queued tasks to their iPhone's on-device model, so do not process them unless the user explicitly asks in this conversation.";

	const CLAUDE_PROCESSOR_NOTE =
		'The user has routed queued tasks to automatic server-side processing by Claude, so do not process them unless the user explicitly asks in this conversation.';

	const handleListAiTasks = async (
		userId: string,
		args: { status?: AiTaskStatus; limit?: number; offset?: number }
	) => {
		try {
			const status = args.status ?? 'pending';
			const { tasks, total } = await d.listAiTasks(userId, {
				status,
				limit: args.limit,
				offset: args.offset
			});

			let note: string | undefined;
			if (status === 'pending') {
				const preferences = await d.getPreferences(userId);
				if (preferences?.aiTaskProcessor === 'device') {
					note = DEVICE_PROCESSOR_NOTE;
				} else if (preferences?.aiTaskProcessorKind === 'claude') {
					const capability = await d.getClaudeCapabilitySafe(userId);
					if (capability.available) note = CLAUDE_PROCESSOR_NOTE;
				}
			}

			return { ...(note ? { note } : {}), tasks: tasks.map(serializeAiTask), total };
		} catch (e) {
			wrapError('list ai tasks', e);
		}
	};

	const handleGetAiTask = async (userId: string, id: string): Promise<McpResult> => {
		try {
			const task = await d.getAiTask(userId, id);
			if (!task) {
				return { ...asText({ error: 'AI task not found' }), isError: true };
			}

			const content: McpResult['content'] = [
				{ type: 'text', text: JSON.stringify(serializeAiTask(task), null, 2) }
			];

			// Every photo, in order — the user may have shot the plate, the
			// packaging and the nutrition label as one meal.
			for (const photoUrl of task.photoUrls ?? []) {
				const filename = photoUrl.replace(/^\/uploads\//, '');
				if (AI_TASK_PHOTO_FILENAME_RE.test(filename)) {
					try {
						const buffer = await readFile(join(UPLOAD_DIR, filename));
						content.push({
							type: 'image',
							data: buffer.toString('base64'),
							mimeType: 'image/webp'
						});
					} catch (err) {
						Sentry.captureException(err, { level: 'warning', tags: { source: 'mcp' } });
						content.push({ type: 'text', text: 'A photo is unavailable.' });
					}
				} else {
					content.push({ type: 'text', text: 'A photo is unavailable.' });
				}
			}

			return { content };
		} catch (e) {
			return {
				...asText({ error: e instanceof Error ? e.message : 'Unexpected error' }),
				isError: true
			};
		}
	};

	const handleCompleteAiTask = async (
		userId: string,
		args: { id: string; resultSummary: string; entryIds?: string[] }
	) => {
		try {
			const result = await d.updateAiTask(userId, args.id, {
				status: 'completed',
				resultSummary: args.resultSummary,
				createdEntryIds: args.entryIds,
				processedBy: 'assistant'
			});
			if (!result.success) return errorPayload(result.error);
			if (!result.data) return { error: 'AI task not found' };
			return { success: true, task: serializeAiTask(result.data) };
		} catch (e) {
			wrapError('complete ai task', e);
		}
	};

	const handleDismissAiTask = async (userId: string, args: { id: string; reason: string }) => {
		try {
			// Not updateAiTask: an agent dismissal must stay unacknowledged so the user
			// gets told about it, whereas a dismissal they tapped themselves does not.
			const result = await d.dismissAiTaskByAgent(userId, args.id, args.reason, 'assistant');
			if (!result.success) return errorPayload(result.error);
			if (!result.data) return { error: 'AI task not found' };
			return { success: true, task: serializeAiTask(result.data) };
		} catch (e) {
			wrapError('dismiss ai task', e);
		}
	};

	// ── Food labels ────────────────────────────────────────────────
	// The model cannot see the food, so it gets the name, brand and a snippet of
	// the ingredient list — enough to decide that "Chiquita Banane" is a banana.
	const handleListUnlabeledFoods = async (
		userId: string,
		args: { minLabels?: number; limit?: number; offset?: number }
	) => {
		try {
			const { items, total } = await d.listFoods(userId, {
				minLabels: args.minLabels ?? 1,
				limit: args.limit ?? 50,
				offset: args.offset
			});
			return {
				total,
				foods: items.map((food) => ({
					id: food.id,
					name: food.name,
					brand: food.brand,
					ingredientsText: food.ingredientsText?.slice(0, 200) ?? null,
					labels: food.labels
				}))
			};
		} catch (e) {
			wrapError('list unlabeled foods', e);
		}
	};

	const handleSetFoodLabels = async (
		userId: string,
		args: { foodId: string; labels: string[] }
	) => {
		try {
			// Source is forced server-side: an MCP client cannot write as 'user'.
			const result = await d.setFoodLabels(userId, args.foodId, args.labels, 'llm');
			if (result.status !== 'ok') return { error: 'Food not found' };
			return { success: true, foodId: args.foodId, labels: result.labels, dropped: result.dropped };
		} catch (e) {
			wrapError('set food labels', e);
		}
	};

	const handleSetFoodLabelsBatch = async (
		userId: string,
		args: { items: Array<{ foodId: string; labels: string[] }>; mode?: 'replace' | 'extend' }
	) => {
		try {
			// Extend by default: a sweep that only sees thinly labelled foods must
			// add to them, and a re-run can then never shrink a set.
			const results = await d.setFoodLabelsBatch(userId, args.items, 'llm', {
				mode: args.mode ?? 'extend'
			});
			return { results, labeled: results.filter((r) => r.ok).length };
		} catch (e) {
			wrapError('set food labels batch', e);
		}
	};

	// A recipe is labelled from its name and what goes into it.
	const handleListUnlabeledRecipes = async (
		userId: string,
		args: { minLabels?: number; limit?: number; offset?: number }
	) => {
		try {
			const { items, total } = await d.listRecipes(userId, {
				minLabels: args.minLabels ?? 1,
				limit: args.limit ?? 50,
				offset: args.offset
			});
			const ingredients = await d.listRecipeIngredientNames(
				userId,
				items.map((recipe) => recipe.id)
			);
			return {
				total,
				recipes: items.map((recipe) => ({
					id: recipe.id,
					name: recipe.name,
					ingredients: ingredients.get(recipe.id) ?? [],
					imageUrl: recipe.imageUrl,
					labels: recipe.labels
				}))
			};
		} catch (e) {
			wrapError('list unlabeled recipes', e);
		}
	};

	const handleSetRecipeLabels = async (
		userId: string,
		args: { recipeId: string; labels: string[] }
	) => {
		try {
			// Source is forced server-side: an MCP client cannot write as 'user'.
			const result = await d.setRecipeLabels(userId, args.recipeId, args.labels, 'llm');
			if (result.status !== 'ok') return { error: 'Recipe not found' };
			return {
				success: true,
				recipeId: args.recipeId,
				labels: result.labels,
				dropped: result.dropped
			};
		} catch (e) {
			wrapError('set recipe labels', e);
		}
	};

	const handleSetRecipeLabelsBatch = async (
		userId: string,
		args: { items: Array<{ recipeId: string; labels: string[] }>; mode?: 'replace' | 'extend' }
	) => {
		try {
			const results = await d.setRecipeLabelsBatch(userId, args.items, 'llm', {
				mode: args.mode ?? 'extend'
			});
			return { results, labeled: results.filter((r) => r.ok).length };
		} catch (e) {
			wrapError('set recipe labels batch', e);
		}
	};

	const handleListLabels = async (userId: string) => {
		try {
			const labels = await d.listLabelStats(userId);
			return { total: labels.length, labels };
		} catch (e) {
			wrapError('list labels', e);
		}
	};

	// ── Fasting sessions ───────────────────────────────────────────
	// The server only holds finished fasts; a running one lives on the device.
	const DEFAULT_FASTS = 30;
	const MAX_FAST_MS = 14 * 24 * 60 * 60_000;
	const FUTURE_SLACK_MS = 5 * 60_000;

	const NOTHING_TO_CHANGE = { error: 'Nothing to change: pass at least one field to update' };
	const hasFields = (patch: Record<string, unknown>) =>
		Object.values(patch).some((value) => value !== undefined);

	const serializeFast = (row: FastingSessionRow) => {
		const durationMinutes = Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 60_000);
		return {
			id: row.id,
			startedAt: row.startedAt,
			endedAt: row.endedAt,
			targetHours: row.targetHours,
			durationMinutes,
			targetReached: durationMinutes >= row.targetHours * 60
		};
	};

	/** Why an assistant may not record this fast: not finished, too long, or overlapping another. */
	const fastProblem = async (
		userId: string,
		startedAt: Date,
		endedAt: Date,
		excludeId?: string
	): Promise<string | null> => {
		if (endedAt <= startedAt) return 'endedAt must be after startedAt';
		if (endedAt.getTime() > Date.now() + FUTURE_SLACK_MS) {
			return 'endedAt is in the future: only a finished fast can be recorded';
		}
		if (endedAt.getTime() - startedAt.getTime() > MAX_FAST_MS) {
			return 'A fast can last at most 14 days';
		}
		const overlap = await d.findOverlappingFast(userId, startedAt, endedAt, excludeId);
		return overlap
			? `This overlaps the recorded fast ${overlap.id} from ${overlap.startedAt.toISOString()} to ${overlap.endedAt.toISOString()}`
			: null;
	};

	const handleListFasts = async (
		userId: string,
		args: { from?: string; to?: string; limit?: number }
	) => {
		try {
			const sessions = await d.listFastingSessions(userId, {
				...args,
				limit: args.limit ?? DEFAULT_FASTS
			});
			return { fasts: sessions.map(serializeFast) };
		} catch (e) {
			wrapError('list fasts', e);
		}
	};

	const handleLogFast = async (
		userId: string,
		args: { startedAt: string; endedAt: string; targetHours: number }
	) => {
		try {
			const problem = await fastProblem(userId, new Date(args.startedAt), new Date(args.endedAt));
			if (problem) return { error: problem };
			const result = await d.upsertFastingSession(userId, {
				startedAt: args.startedAt,
				endedAt: args.endedAt,
				targetHours: args.targetHours
			});
			if (!result.success) return errorPayload(result.error);
			if (!result.data) return { error: 'The fast could not be saved' };
			return { success: true, fastId: result.data.id, fast: serializeFast(result.data) };
		} catch (e) {
			wrapError('log fast', e);
		}
	};

	const handleUpdateFast = async (
		userId: string,
		args: { fastId: string; startedAt?: string; endedAt?: string; targetHours?: number }
	) => {
		try {
			const { fastId, ...patch } = args;
			if (!hasFields(patch)) return NOTHING_TO_CHANGE;
			if (patch.startedAt !== undefined || patch.endedAt !== undefined) {
				const current = await d.getFastingSession(userId, fastId);
				if (!current) return { error: 'Fast not found' };
				const problem = await fastProblem(
					userId,
					new Date(patch.startedAt ?? current.startedAt),
					new Date(patch.endedAt ?? current.endedAt),
					fastId
				);
				if (problem) return { error: problem };
			}
			const result = await d.updateFastingSession(userId, fastId, patch);
			if (!result.success) return errorPayload(result.error);
			if (!result.data) return { error: 'Fast not found' };
			return { success: true, fastId, fast: serializeFast(result.data) };
		} catch (e) {
			wrapError('update fast', e);
		}
	};

	const handleDeleteFast = async (userId: string, args: { fastId: string }) => {
		try {
			const deleted = await d.deleteFastingSession(userId, args.fastId);
			if (!deleted) return { error: 'Fast not found' };
			return { success: true };
		} catch (e) {
			wrapError('delete fast', e);
		}
	};

	// ── Reminders ──────────────────────────────────────────────────
	const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

	const serializeReminder = (row: ReminderRow) => ({
		id: row.id,
		kind: row.kind,
		mealType: row.mealType,
		time: row.time,
		weekdays: row.weekdays,
		enabled: row.enabled
	});

	const days = (weekdays: number[]) =>
		dedupe(weekdays)
			.sort((a, b) => a - b)
			.join(',');

	// Entries file "lunch" as "Lunch"; a reminder must name the meal the same
	// way, and one the user has, or a logged meal never silences it.
	const withStoredMealName = async <T extends { mealType?: string | null }>(
		userId: string,
		args: T
	): Promise<{ args: T } | { error: string }> => {
		if (typeof args.mealType !== 'string') return { args };
		const meal = canonicalMeal(args.mealType, await d.listMealTypes(userId));
		return meal
			? { args: { ...args, mealType: meal.name } }
			: { error: unknownMeal(args.mealType) };
	};

	const identicalReminder = async (
		userId: string,
		reminder: { kind: string; mealType: string | null; time: string; weekdays: number[] },
		excludeId?: string
	) =>
		(await d.listReminders(userId)).find(
			(row) =>
				row.id !== excludeId &&
				row.kind === reminder.kind &&
				(row.mealType ?? null) === reminder.mealType &&
				row.time === reminder.time &&
				days(row.weekdays) === days(reminder.weekdays)
		);

	const duplicateError = (row: ReminderRow) => ({
		error: `An identical reminder already exists (${row.id}); change that one instead`
	});

	const handleListReminders = async (userId: string) => {
		try {
			const reminders = await d.listReminders(userId);
			return { reminders: reminders.map(serializeReminder) };
		} catch (e) {
			wrapError('list reminders', e);
		}
	};

	const handleCreateReminder = async (
		userId: string,
		input: {
			kind: string;
			mealType?: string | null;
			time: string;
			weekdays?: number[];
			enabled?: boolean;
		}
	) => {
		try {
			const named = await withStoredMealName(userId, input);
			if ('error' in named) return named;
			const { args } = named;
			const twin = await identicalReminder(userId, {
				kind: args.kind,
				mealType: args.kind === 'meal' ? (args.mealType ?? null) : null,
				time: args.time,
				weekdays: args.weekdays?.length ? args.weekdays : EVERY_DAY
			});
			if (twin) return duplicateError(twin);
			const result = await d.createReminder(userId, args);
			if (!result.success) return errorPayload(result.error);
			return {
				success: true,
				reminderId: result.data.id,
				reminder: serializeReminder(result.data)
			};
		} catch (e) {
			wrapError('create reminder', e);
		}
	};

	const handleUpdateReminder = async (
		userId: string,
		input: {
			reminderId: string;
			kind?: string;
			mealType?: string | null;
			time?: string;
			weekdays?: number[];
			enabled?: boolean;
		}
	) => {
		try {
			const { reminderId, ...rest } = input;
			if (!hasFields(rest)) return NOTHING_TO_CHANGE;
			const current = await d.getReminderById(userId, reminderId);
			if (!current) return { error: 'Reminder not found' };
			const named = await withStoredMealName(userId, rest);
			if ('error' in named) return named;
			const patch = named.args;
			const kind = patch.kind ?? current.kind;
			const twin = await identicalReminder(
				userId,
				{
					kind,
					mealType:
						kind !== 'meal'
							? null
							: patch.mealType !== undefined
								? patch.mealType
								: current.mealType,
					time: patch.time ?? current.time,
					weekdays: patch.weekdays ?? current.weekdays
				},
				reminderId
			);
			if (twin) return duplicateError(twin);
			const result = await d.updateReminder(userId, reminderId, patch);
			if (!result.success) return errorPayload(result.error);
			if (!result.data) return { error: 'Reminder not found' };
			return { success: true, reminderId, reminder: serializeReminder(result.data) };
		} catch (e) {
			wrapError('update reminder', e);
		}
	};

	const handleDeleteReminder = async (userId: string, args: { reminderId: string }) => {
		try {
			// deleteReminder reports nothing, so a foreign or unknown id is caught here.
			if (!(await d.getReminderById(userId, args.reminderId))) {
				return { error: 'Reminder not found' };
			}
			await d.deleteReminder(userId, args.reminderId);
			return { success: true };
		} catch (e) {
			wrapError('delete reminder', e);
		}
	};

	// ── Preferences ────────────────────────────────────────────────
	const handleGetPreferences = async (userId: string) => {
		try {
			const stored = await d.getPreferences(userId);
			if (!stored) {
				return {
					preferences: { ...d.defaultPreferences, locale: await d.getUserLocale(userId) }
				};
			}
			const { userId: _owner, ...preferences } = stored;
			return { preferences };
		} catch (e) {
			wrapError('get preferences', e);
		}
	};

	const handleUpdatePreferences = async (userId: string, args: Record<string, unknown>) => {
		try {
			const allowed = new Set<string>(ASSISTANT_PREFERENCE_FIELDS);
			const requested = Object.fromEntries(
				Object.entries(args).filter(([key, value]) => allowed.has(key) && value !== undefined)
			);
			if (Object.keys(requested).length === 0) {
				return { error: 'Pass at least one preference to change' };
			}
			const resolved = resolvePreferencePatch(
				requested,
				needsMealTypes(requested) ? await d.listMealTypes(userId) : []
			);
			if ('error' in resolved) return resolved;
			const result = await d.updatePreferences(userId, resolved.patch);
			if (!result.success) return errorPayload(result.error);
			const saved = (result.data ?? {}) as Record<string, unknown>;
			return {
				success: true,
				preferences: Object.fromEntries(Object.keys(resolved.patch).map((key) => [key, saved[key]]))
			};
		} catch (e) {
			wrapError('update preferences', e);
		}
	};

	// ── Custom meal types ──────────────────────────────────────────
	type MealTypeRow = Awaited<ReturnType<HandlerDeps['listMealTypes']>>[number];
	const INT4_MAX = 2_147_483_647;

	const mealTypeTaken = (name: string, others: MealTypeRow[]) => {
		const key = normalizeMealType(name).toLowerCase();
		return [...DEFAULT_MEAL_TYPES, ...others.map((mealType) => mealType.name)].some(
			(existing) => existing.toLowerCase() === key
		);
	};

	const handleCreateMealType = async (
		userId: string,
		args: { name: string; sortOrder?: number }
	) => {
		try {
			const existing = await d.listMealTypes(userId);
			const name = args.name.trim();
			if (name && mealTypeTaken(name, existing)) {
				return { error: `A meal type named "${name}" already exists` };
			}
			const last = Math.max(0, ...existing.map((mealType) => mealType.sortOrder));
			const result = await d.createMealType(userId, {
				name,
				sortOrder: args.sortOrder ?? Math.min(last + 1, INT4_MAX)
			});
			if (!result.success) return errorPayload(result.error);
			return { success: true, mealTypeId: result.data.id, mealType: result.data };
		} catch (e) {
			wrapError('create meal type', e);
		}
	};

	const handleUpdateMealType = async (
		userId: string,
		args: { mealTypeId: string; name?: string; sortOrder?: number }
	) => {
		try {
			const { mealTypeId, ...patch } = args;
			if (!hasFields(patch)) return NOTHING_TO_CHANGE;
			const mealTypes = await d.listMealTypes(userId);
			const current = mealTypes.find((mealType) => mealType.id === mealTypeId);
			if (!current) return { error: 'Meal type not found' };
			const name = patch.name?.trim();
			if (
				name &&
				name !== current.name &&
				mealTypeTaken(
					name,
					mealTypes.filter((mealType) => mealType.id !== current.id)
				)
			) {
				return { error: `A meal type named "${name}" already exists` };
			}
			const sortOrder = patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {};
			// A rename carries the reminders, time windows and meal order in one transaction.
			const result =
				name !== undefined
					? await d.renameMealType(userId, current.id, { name, ...sortOrder })
					: await d.updateMealType(userId, current.id, sortOrder);
			if (!result.success) return errorPayload(result.error);
			if (!result.data) return { error: 'Meal type not found' };
			return { success: true, mealTypeId: current.id, mealType: result.data };
		} catch (e) {
			wrapError('update meal type', e);
		}
	};

	const handleDeleteMealType = async (userId: string, args: { mealTypeId: string }) => {
		try {
			const mealTypes = await d.listMealTypes(userId);
			if (!mealTypes.some((mealType) => mealType.id === args.mealTypeId)) {
				return { error: 'Meal type not found' };
			}
			await d.deleteMealType(userId, args.mealTypeId);
			return { success: true };
		} catch (e) {
			wrapError('delete meal type', e);
		}
	};

	// ── Where-used, brands, nutrient database ──────────────────────
	// Defaults sized so a whole result fits the chat's tool-result limit.
	const DEFAULT_USAGE_ENTRIES = 20;
	const MAX_USAGE_ITEMS = 50;
	const DEFAULT_BRANDS = 100;

	const handleGetFoodUsage = async (userId: string, args: { foodId: string; limit?: number }) => {
		try {
			const usage = await d.getFoodUsage(userId, args.foodId);
			if (!usage) return { error: 'Food not found' };
			return {
				totalEntries: usage.totalEntries,
				entries: usage.entries.slice(0, args.limit ?? DEFAULT_USAGE_ENTRIES),
				totalRecipes: usage.recipes.length,
				recipes: usage.recipes.slice(0, MAX_USAGE_ITEMS),
				totalSupplements: usage.supplements.length,
				supplements: usage.supplements.slice(0, MAX_USAGE_ITEMS)
			};
		} catch (e) {
			wrapError('get food usage', e);
		}
	};

	const handleGetRecipeUsage = async (
		userId: string,
		args: { recipeId: string; limit?: number }
	) => {
		try {
			const usage = await d.getRecipeUsage(userId, args.recipeId);
			if (!usage) return { error: 'Recipe not found' };
			return {
				totalEntries: usage.totalEntries,
				entries: usage.entries.slice(0, args.limit ?? DEFAULT_USAGE_ENTRIES)
			};
		} catch (e) {
			wrapError('get recipe usage', e);
		}
	};

	const handleListFoodBrands = async (
		userId: string,
		args: { query?: string; limit?: number } = {}
	) => {
		try {
			const query = args.query?.trim().toLowerCase();
			const brands = (await d.listFoodBrands(userId)).filter(
				(brand) => !query || brand.brand.toLowerCase().includes(query)
			);
			return { total: brands.length, brands: brands.slice(0, args.limit ?? DEFAULT_BRANDS) };
		} catch (e) {
			wrapError('list food brands', e);
		}
	};

	const handleSearchNutrientDatabase = async (userId: string, args: { query: string }) => {
		try {
			const foods = await d.searchFdcFoods(userId, args.query);
			return {
				foods: foods.map((food) => ({
					fdcId: food.fdcId,
					description: food.description,
					dataType: food.dataType,
					per100g: food.per100g,
					nutrientsPer100g: food.nutrients
				})),
				...(foods.length === 0
					? { note: 'No records. Try a shorter English name, or use another source.' }
					: {})
			};
		} catch (e) {
			// Not configured, rate limited, unreachable or an unreadable query: the
			// model should use another source, as with Open Food Facts.
			if (e instanceof NutrientDatabaseError) {
				return { foods: [], unavailable: true, hint: e.message };
			}
			wrapError('search the nutrient database', e);
		}
	};

	return {
		handleGetDailyStatus,
		handleSearchFoods,
		handleCreateFood,
		handleCreateRecipe,
		handleLogFood,
		handleGetSupplementStatus,
		handleLogSupplement,
		handleListEntries,
		handleUpdateEntry,
		handleDeleteEntry,
		handleGetGoals,
		handleUpdateGoals,
		handleListRecipes,
		handleGetRecipe,
		handleGetFood,
		handleListFavorites,
		handleLogWeight,
		handleGetWeight,
		handleGetWeeklyStats,
		handleGetMonthlyStats,
		handleCopyEntries,
		handleFindFoodByBarcode,
		handleUpdateFood,
		handleDeleteFood,
		handleListRecentFoods,
		handleMergeFoods,
		handleFindDuplicateFoods,
		handleUpdateRecipe,
		handleDeleteRecipe,
		handleCreateSupplement,
		handleListSupplements,
		handleUpdateSupplement,
		handleDeleteSupplement,
		handleUnlogSupplement,
		handleUpdateWeight,
		handleDeleteWeight,
		handleGetDailyBreakdown,
		handleGetMealBreakdown,
		handleGetTopFoods,
		handleGetStreaks,
		handleGetMaintenanceCalories,
		handleSearchOpenFoodFacts,
		handleLogSleep,
		handleGetSleep,
		handleUpdateSleep,
		handleDeleteSleep,
		handleGetFoodDiversity,
		handleGetMealTiming,
		handleGetSleepFoodCorrelation,
		handleGetWeightFoodSeries,
		handleGetExtendedNutrients,
		handleGetDailyNutrients,
		handleGetNutrientGaps,
		handleFindNutrientSources,
		handleGetEatingPatterns,
		handleGetMealPlanContext,
		handleListMealTypes,
		handleGetSupplementHistory,
		handleGetDayProperties,
		handleSetDayProperties,
		handleDeleteDayProperties,
		handleGetCalendarStats,
		handleListUnlabeledFoods,
		handleListLabels,
		handleSetFoodLabels,
		handleSetFoodLabelsBatch,
		handleListUnlabeledRecipes,
		handleSetRecipeLabels,
		handleSetRecipeLabelsBatch,
		handleListAiTasks,
		handleGetAiTask,
		handleCompleteAiTask,
		handleDismissAiTask,
		handleListFasts,
		handleLogFast,
		handleUpdateFast,
		handleDeleteFast,
		handleListReminders,
		handleCreateReminder,
		handleUpdateReminder,
		handleDeleteReminder,
		handleGetPreferences,
		handleUpdatePreferences,
		handleCreateMealType,
		handleUpdateMealType,
		handleDeleteMealType,
		handleGetFoodUsage,
		handleGetRecipeUsage,
		handleListFoodBrands,
		handleSearchNutrientDatabase
	};
}
