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
	// Utils
	formatDailyStatus: typeof formatDailyStatus;
	today: typeof today;
};

export function createHandlers(d: HandlerDeps) {
	const handleGetDailyStatus = async (userId: string, date?: string) => {
		const targetDate = date ?? d.today();
		const { items: entries } = await d.listEntriesByDate(userId, targetDate);
		const goals = await d.getGoals(userId);
		return d.formatDailyStatus({ entries, goals });
	};

	const handleSearchFoods = async (userId: string, query: string) => {
		const { items: foods } = await d.listFoods(userId, { query });
		return { foods };
	};

	const handleCreateFood = async (userId: string, payload: unknown) => {
		const result = await d.createFood(userId, payload);
		if (!result.success) return { error: result.error.message };
		return { foodId: result.data.id, success: true };
	};

	const handleCreateRecipe = async (userId: string, payload: unknown) => {
		const result = await d.createRecipe(userId, payload);
		if (!result.success) return { error: result.error.message };
		return { recipeId: result.data.id, success: true };
	};

	const handleLogFood = async (userId: string, payload: unknown) => {
		const result = await d.createEntry(userId, payload);
		if (!result.success) return { error: result.error.message };
		return { entryId: result.data.id, success: true };
	};

	const handleGetSupplementStatus = async (userId: string) => {
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
	};

	const handleLogSupplement = async (
		userId: string,
		args: { name?: string; supplementId?: string; date?: string }
	) => {
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
		return {
			success: true,
			logged: {
				name: supplement?.name ?? 'Unknown',
				dosage: supplement?.dosage,
				dosageUnit: supplement?.dosageUnit,
				ingredients: supplement?.ingredients ?? [],
				date: targetDate
			}
		};
	};

	const handleListEntries = async (userId: string, date?: string) => {
		const targetDate = date ?? d.today();
		const { items: entries } = await d.listEntriesByDate(userId, targetDate);
		return { date: targetDate, entries };
	};

	const handleUpdateEntry = async (
		userId: string,
		args: {
			entryId: string;
			servings?: number;
			mealType?: string;
			notes?: string;
			eatenAt?: string | null;
			quickName?: string | null;
			quickCalories?: number | null;
			quickProtein?: number | null;
			quickCarbs?: number | null;
			quickFat?: number | null;
			quickFiber?: number | null;
		}
	) => {
		const { entryId, ...rest } = args;
		const result = await d.updateEntry(userId, entryId, rest);
		if (!result.success) return { error: result.error.message };
		return { success: true, entryId };
	};

	const handleDeleteEntry = async (userId: string, entryId: string) => {
		await d.deleteEntry(userId, entryId);
		return { success: true };
	};

	const handleGetGoals = async (userId: string) => {
		const goals = await d.getGoals(userId);
		return { goals };
	};

	const handleUpdateGoals = async (userId: string, payload: unknown) => {
		const result = await d.upsertGoals(userId, payload);
		if (!result.success) return { error: result.error.message };
		return { success: true };
	};

	const handleListRecipes = async (userId: string) => {
		const { items: recipes } = await d.listRecipes(userId);
		return { recipes };
	};

	const handleGetRecipe = async (userId: string, recipeId: string) => {
		const recipe = await d.getRecipe(userId, recipeId);
		if (!recipe) return { error: 'Recipe not found' };
		return recipe;
	};

	const handleGetFood = async (userId: string, foodId: string) => {
		const food = await d.getFood(userId, foodId);
		if (!food) return { error: 'Food not found' };
		return food;
	};

	const handleListFavorites = async (userId: string) => {
		const [foods, recipes] = await Promise.all([
			d.listFavoriteFoods(userId),
			d.listFavoriteRecipes(userId)
		]);
		return { foods, recipes };
	};

	const handleLogWeight = async (
		userId: string,
		args: { weightKg: number; date?: string; notes?: string }
	) => {
		const result = await d.createWeightEntry(userId, {
			weightKg: args.weightKg,
			date: args.date,
			notes: args.notes
		});
		if (!result.success) return { error: result.error.message };
		return { success: true, entryId: result.data.id };
	};

	const handleGetWeight = async (userId: string, args: { from?: string; to?: string }) => {
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
	};

	const handleGetWeeklyStats = async (userId: string) => {
		return await d.getWeeklyStats(userId);
	};

	const handleGetMonthlyStats = async (userId: string) => {
		return await d.getMonthlyStats(userId);
	};

	const handleCopyEntries = async (userId: string, args: { fromDate: string; toDate?: string }) => {
		const targetDate = args.toDate ?? d.today();
		const copied = await d.copyEntries(userId, args.fromDate, targetDate);
		return { success: true, copiedCount: copied.length };
	};

	const handleFindFoodByBarcode = async (userId: string, barcode: string) => {
		const food = await d.findFoodByBarcode(userId, barcode);
		if (!food) return { found: false };
		return { found: true, ...food };
	};

	const handleUpdateFood = async (
		userId: string,
		args: { foodId: string; [key: string]: unknown }
	) => {
		const { foodId, ...rest } = args;
		const result = await d.updateFood(userId, foodId, rest);
		if (!result.success) return { error: result.error.message };
		return { success: true, foodId };
	};

	const handleDeleteFood = async (userId: string, args: { foodId: string; force?: boolean }) => {
		const result = await d.deleteFood(userId, args.foodId, args.force ?? false);
		if (result.blocked)
			return {
				blocked: true,
				entryCount: result.entryCount,
				hint: 'Use force=true to delete with all entries'
			};
		return { success: true };
	};

	const handleListRecentFoods = async (userId: string, args: { limit?: number }) => {
		return d.listRecentFoods(userId, args.limit ?? 25);
	};

	const handleUpdateRecipe = async (
		userId: string,
		args: { recipeId: string; [key: string]: unknown }
	) => {
		const { recipeId, ...rest } = args;
		const result = await d.updateRecipe(userId, recipeId, rest);
		if (!result.success) return { error: result.error.message };
		return { success: true, recipeId };
	};

	const handleDeleteRecipe = async (
		userId: string,
		args: { recipeId: string; force?: boolean }
	) => {
		const result = await d.deleteRecipe(userId, args.recipeId, args.force ?? false);
		if (result.blocked)
			return {
				blocked: true,
				entryCount: result.entryCount,
				hint: 'Use force=true to delete with all entries'
			};
		return { success: true };
	};

	const handleCreateSupplement = async (userId: string, args: unknown) => {
		const result = await d.createSupplement(userId, args);
		if (!result.success) return { error: result.error.message };
		return { success: true, supplementId: result.data.id };
	};

	const handleListSupplements = async (userId: string, args: { activeOnly?: boolean }) => {
		return { supplements: await d.listSupplements(userId, args.activeOnly ?? true) };
	};

	const handleUpdateSupplement = async (
		userId: string,
		args: { supplementId: string; [key: string]: unknown }
	) => {
		const { supplementId, ...rest } = args;
		const result = await d.updateSupplement(userId, supplementId, rest);
		if (!result.success) return { error: result.error.message };
		return { success: true, supplementId };
	};

	const handleDeleteSupplement = async (userId: string, args: { supplementId: string }) => {
		await d.deleteSupplement(userId, args.supplementId);
		return { success: true };
	};

	const handleUnlogSupplement = async (
		userId: string,
		args: { supplementId: string; date?: string }
	) => {
		await d.unlogSupplement(userId, args.supplementId, args.date ?? d.today());
		return { success: true };
	};

	const handleUpdateWeight = async (
		userId: string,
		args: { weightId: string; [key: string]: unknown }
	) => {
		const { weightId, ...rest } = args;
		const result = await d.updateWeightEntry(userId, weightId, rest);
		if (!result.success) return { error: result.error.message };
		return { success: true, weightId };
	};

	const handleDeleteWeight = async (userId: string, args: { weightId: string }) => {
		const deleted = await d.deleteWeightEntry(userId, args.weightId);
		if (!deleted) return { error: 'Weight entry not found' };
		return { success: true };
	};

	const handleGetDailyBreakdown = async (
		userId: string,
		args: { startDate: string; endDate: string }
	) => {
		return d.getDailyBreakdown(userId, args.startDate, args.endDate);
	};

	const handleGetMealBreakdown = async (
		userId: string,
		args: { startDate: string; endDate: string }
	) => {
		return d.getMealBreakdown(userId, args.startDate, args.endDate);
	};

	const handleGetTopFoods = async (userId: string, args: { days?: number; limit?: number }) => {
		return d.getTopFoods(userId, args.days ?? 7, args.limit ?? 10);
	};

	const handleGetStreaks = async (userId: string) => {
		return d.getStreaks(userId);
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
		handleGetStreaks
	};
}
