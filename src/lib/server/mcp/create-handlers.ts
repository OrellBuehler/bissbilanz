/**
 * Pure factory for MCP handler functions.
 *
 * Type-only imports from service modules are erased at compile time, so this
 * module can be imported in tests without triggering database connections or
 * requiring mock.module — eliminating cross-file mock pollution in Bun's test runner.
 *
 * Production code uses handlers.ts which creates a default instance with real deps.
 */

import type {
	listFoods,
	createFood,
	updateFood,
	deleteFood,
	getFood,
	findFoodByBarcode,
	listRecentFoods
} from '$lib/server/foods';
import type {
	createRecipe,
	updateRecipe,
	deleteRecipe,
	listRecipes,
	getRecipe
} from '$lib/server/recipes';
import type {
	createEntry,
	listEntriesByDate,
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
	getWeightWithTrend
} from '$lib/server/weight';
import type {
	getWeeklyStats,
	getMonthlyStats,
	getDailyBreakdown,
	getMealBreakdown,
	getTopFoods,
	getStreaks
} from '$lib/server/stats';
import type {
	createSupplement,
	listSupplements,
	updateSupplement,
	deleteSupplement,
	unlogSupplement,
	getLogsForDate,
	logSupplement,
	getSupplementById,
	getSupplementChecklist
} from '$lib/server/supplements';
import type { formatDailyStatus } from '$lib/server/mcp/format';
import type { today } from '$lib/utils/dates';
import type { fetchProduct, searchProducts } from '$lib/server/openfoodfacts';
import type {
	createSleepEntry,
	getSleepEntriesByDateRange,
	getLatestSleep,
	updateSleepEntry,
	deleteSleepEntry
} from '$lib/server/sleep';

export type HandlerDeps = {
	// Foods
	listFoods: typeof listFoods;
	createFood: typeof createFood;
	updateFood: typeof updateFood;
	deleteFood: typeof deleteFood;
	getFood: typeof getFood;
	findFoodByBarcode: typeof findFoodByBarcode;
	listRecentFoods: typeof listRecentFoods;
	// Recipes
	createRecipe: typeof createRecipe;
	updateRecipe: typeof updateRecipe;
	deleteRecipe: typeof deleteRecipe;
	listRecipes: typeof listRecipes;
	getRecipe: typeof getRecipe;
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
	// Utils
	formatDailyStatus: typeof formatDailyStatus;
	today: typeof today;
	// Open Food Facts
	fetchProduct: typeof fetchProduct;
	searchProducts: typeof searchProducts;
};

export function createHandlers(d: HandlerDeps) {
	function wrapError(op: string, e: unknown): never {
		throw new Error(`Failed to ${op}: ${e instanceof Error ? e.message : String(e)}`);
	}

	const getDailyStatusForDate = async (userId: string, date: string) => {
		const { items: entries } = await d.listEntriesByDate(userId, date);
		const goals = await d.getGoals(userId);
		return d.formatDailyStatus({ entries, goals });
	};

	const handleGetDailyStatus = async (userId: string, date?: string, includeEntries?: boolean) => {
		try {
			const targetDate = date ?? d.today();
			const { items: entries } = await d.listEntriesByDate(userId, targetDate);
			const goals = await d.getGoals(userId);
			const status = d.formatDailyStatus({ entries, goals });
			if (includeEntries) {
				return { ...status, date: targetDate, entries };
			}
			return { ...status, date: targetDate };
		} catch (e) {
			wrapError('get daily status', e);
		}
	};

	const handleSearchFoods = async (userId: string, query: string) => {
		try {
			const [{ items: foods }, recentFoods] = await Promise.all([
				d.listFoods(userId, { query }),
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
			if (!result.success) return { error: result.error.message };
			return { foodId: result.data.id, success: true, food: result.data };
		} catch (e) {
			wrapError('create food', e);
		}
	};

	const handleCreateRecipe = async (userId: string, payload: unknown) => {
		try {
			const result = await d.createRecipe(userId, payload);
			if (!result.success) return { error: result.error.message };
			return { recipeId: result.data.id, success: true, recipe: result.data };
		} catch (e) {
			wrapError('create recipe', e);
		}
	};

	const handleLogFood = async (userId: string, payload: unknown) => {
		try {
			const result = await d.createEntry(userId, payload);
			if (!result.success) return { error: result.error.message };
			const date = result.data.date ?? d.today();
			const dailyStatus = await getDailyStatusForDate(userId, date);
			return { entryId: result.data.id, success: true, dailyStatus };
		} catch (e) {
			wrapError('log food', e);
		}
	};

	const handleGetSupplementStatus = async (userId: string) => {
		try {
			const targetDate = d.today();
			const items = await d.getSupplementChecklist(userId, targetDate);

			const checklist = items.map((item) => ({
				id: item.supplement.id,
				name: item.supplement.name,
				dosage: item.supplement.dosage,
				dosageUnit: item.supplement.dosageUnit,
				ingredients: item.supplement.ingredients ?? [],
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
			const targetDate = args.date ?? d.today();
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

			const result = await d.logSupplement(userId, id, targetDate);
			if (!result.success) {
				return { success: false, error: result.error.message };
			}

			const supplement = await d.getSupplementById(userId, id);
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
					name: supplement?.name ?? 'Unknown',
					dosage: supplement?.dosage,
					dosageUnit: supplement?.dosageUnit,
					ingredients: supplement?.ingredients ?? [],
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
			const targetDate = date ?? d.today();
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
			servings?: number;
			mealType?: string;
			notes?: string;
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
			if (!result.success) return { error: result.error.message };
			const date = result.data?.date ?? d.today();
			const dailyStatus = await getDailyStatusForDate(userId, date);
			return { success: true, entryId, dailyStatus };
		} catch (e) {
			wrapError('update entry', e);
		}
	};

	const handleDeleteEntry = async (userId: string, entryId: string, date?: string) => {
		try {
			await d.deleteEntry(userId, entryId);
			const targetDate = date ?? d.today();
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
			if (!result.success) return { error: result.error.message };
			return { success: true, goals: result.data };
		} catch (e) {
			wrapError('update goals', e);
		}
	};

	const handleListRecipes = async (userId: string) => {
		try {
			const { items: recipes } = await d.listRecipes(userId);
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
		args: { weightKg: number; date?: string; notes?: string }
	) => {
		try {
			const previous = await d.getLatestWeight(userId);
			const result = await d.createWeightEntry(userId, {
				weightKg: args.weightKg,
				entryDate: args.date,
				notes: args.notes
			});
			if (!result.success) return { error: result.error.message };
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

	const handleGetWeeklyStats = async (userId: string) => {
		try {
			return await d.getWeeklyStats(userId);
		} catch (e) {
			wrapError('get weekly stats', e);
		}
	};

	const handleGetMonthlyStats = async (userId: string) => {
		try {
			return await d.getMonthlyStats(userId);
		} catch (e) {
			wrapError('get monthly stats', e);
		}
	};

	const handleCopyEntries = async (userId: string, args: { fromDate: string; toDate?: string }) => {
		try {
			const targetDate = args.toDate ?? d.today();
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
			if (!result.success) return { error: result.error.message };
			return { success: true, foodId };
		} catch (e) {
			wrapError('update food', e);
		}
	};

	const handleDeleteFood = async (userId: string, args: { foodId: string; force?: boolean }) => {
		try {
			const result = await d.deleteFood(userId, args.foodId, args.force ?? false);
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

	const handleUpdateRecipe = async (
		userId: string,
		args: { recipeId: string; [key: string]: unknown }
	) => {
		try {
			const { recipeId, ...rest } = args;
			const result = await d.updateRecipe(userId, recipeId, rest);
			if (!result.success) return { error: result.error.message };
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

	const handleCreateSupplement = async (userId: string, args: unknown) => {
		try {
			const result = await d.createSupplement(userId, args);
			if (!result.success) return { error: result.error.message };
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
			const result = await d.updateSupplement(userId, supplementId, rest);
			if (!result.success) return { error: result.error.message };
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
			await d.unlogSupplement(userId, args.supplementId, args.date ?? d.today());
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
			if (!result.success) return { error: result.error.message };
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
			return d.getDailyBreakdown(userId, args.startDate, args.endDate);
		} catch (e) {
			wrapError('get daily breakdown', e);
		}
	};

	const handleGetMealBreakdown = async (
		userId: string,
		args: { startDate: string; endDate: string }
	) => {
		try {
			return d.getMealBreakdown(userId, args.startDate, args.endDate);
		} catch (e) {
			wrapError('get meal breakdown', e);
		}
	};

	const handleGetTopFoods = async (userId: string, args: { days?: number; limit?: number }) => {
		try {
			return d.getTopFoods(userId, args.days ?? 7, args.limit ?? 10);
		} catch (e) {
			wrapError('get top foods', e);
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
			const results = await d.searchProducts(query, limit ?? 5);
			return { products: results, count: results.length };
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
			bedtime?: string;
			wakeTime?: string;
			wakeUps?: number;
			notes?: string;
		}
	) => {
		try {
			const result = await d.createSleepEntry(userId, {
				durationMinutes: args.durationMinutes,
				quality: args.quality,
				entryDate: args.date ?? d.today(),
				bedtime: args.bedtime ?? null,
				wakeTime: args.wakeTime ?? null,
				wakeUps: args.wakeUps ?? null,
				notes: args.notes ?? null
			});
			if (!result.success) return { error: result.error.message };
			return { success: true, entryId: result.data.id, entry: result.data };
		} catch (e) {
			wrapError('log sleep', e);
		}
	};

	const handleGetSleep = async (userId: string, args: { from?: string; to?: string }) => {
		try {
			if (args.from || args.to) {
				if (!args.from || !args.to) {
					return {
						error: 'Provide both "from" and "to" for a date range, or omit both for latest entry'
					};
				}
				const entries = await d.getSleepEntriesByDateRange(userId, args.from, args.to);
				return { entries };
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
			bedtime?: string | null;
			wakeTime?: string | null;
			wakeUps?: number | null;
			notes?: string | null;
		}
	) => {
		try {
			const { id, ...rest } = args;
			const result = await d.updateSleepEntry(userId, id, rest);
			if (!result.success) return { error: result.error.message };
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
		handleSearchOpenFoodFacts,
		handleLogSleep,
		handleGetSleep,
		handleUpdateSleep,
		handleDeleteSleep
	};
}
