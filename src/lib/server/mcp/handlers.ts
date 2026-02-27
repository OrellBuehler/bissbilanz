import {
	createFood,
	updateFood,
	deleteFood,
	listFoods,
	listRecentFoods,
	getFood,
	findFoodByBarcode
} from '$lib/server/foods';
import { createRecipe, updateRecipe, deleteRecipe, listRecipes, getRecipe } from '$lib/server/recipes';
import {
	createEntry,
	listEntriesByDate,
	updateEntry,
	deleteEntry,
	copyEntries
} from '$lib/server/entries';
import { getGoals, upsertGoals } from '$lib/server/goals';
import { listFavoriteFoods, listFavoriteRecipes } from '$lib/server/favorites';
import {
	createWeightEntry,
	updateWeightEntry,
	deleteWeightEntry,
	getLatestWeight,
	getWeightWithTrend
} from '$lib/server/weight';
import {
	getWeeklyStats,
	getMonthlyStats,
	getDailyBreakdown,
	getMealBreakdown,
	getTopFoods,
	getStreaks
} from '$lib/server/stats';
import { formatDailyStatus } from '$lib/server/mcp/format';
import { today } from '$lib/utils/dates';
import {
	createSupplement,
	listSupplements,
	updateSupplement,
	deleteSupplement,
	unlogSupplement,
	getLogsForDate,
	logSupplement,
	getSupplementById
} from '$lib/server/supplements';
import { isSupplementDue } from '$lib/utils/supplements';

export const handleGetDailyStatus = async (userId: string, date?: string) => {
	const targetDate = date ?? today();
	const entries = await listEntriesByDate(userId, targetDate);
	const goals = await getGoals(userId);
	return formatDailyStatus({ entries, goals });
};

export const handleSearchFoods = async (userId: string, query: string) => {
	const foods = await listFoods(userId, { query });
	return { foods };
};

export const handleCreateFood = async (userId: string, payload: unknown) => {
	const result = await createFood(userId, payload);
	if (!result.success) return { error: result.error.message };
	return { foodId: result.data.id, success: true };
};

export const handleCreateRecipe = async (userId: string, payload: unknown) => {
	const result = await createRecipe(userId, payload);
	if (!result.success) return { error: result.error.message };
	return { recipeId: result.data.id, success: true };
};

export const handleLogFood = async (userId: string, payload: unknown) => {
	const result = await createEntry(userId, payload);
	if (!result.success) return { error: result.error.message };
	return { entryId: result.data.id, success: true };
};

export const handleGetSupplementStatus = async (userId: string) => {
	const targetDate = today();
	const now = new Date();

	const [allSupplements, logs] = await Promise.all([
		listSupplements(userId, true),
		getLogsForDate(userId, targetDate)
	]);

	const logMap = new Map(logs.map((l) => [l.supplementId, l]));

	const checklist = allSupplements
		.filter((s) => isSupplementDue(s.scheduleType, s.scheduleDays, s.scheduleStartDate, now))
		.map((s) => ({
			id: s.id,
			name: s.name,
			dosage: s.dosage,
			dosageUnit: s.dosageUnit,
			ingredients: s.ingredients ?? [],
			taken: logMap.has(s.id),
			takenAt: logMap.get(s.id)?.takenAt ?? null
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

export const handleLogSupplement = async (
	userId: string,
	args: { name?: string; supplementId?: string; date?: string }
) => {
	const targetDate = args.date ?? today();
	let id = args.supplementId;

	if (!id && args.name) {
		const allSupplements = await listSupplements(userId, true);
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

	const result = await logSupplement(userId, id, targetDate);
	if (!result.success) {
		return { success: false, error: result.error.message };
	}

	const supplement = await getSupplementById(userId, id);
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

export const handleListEntries = async (userId: string, date?: string) => {
	const targetDate = date ?? today();
	const entries = await listEntriesByDate(userId, targetDate);
	return { date: targetDate, entries };
};

export const handleUpdateEntry = async (
	userId: string,
	args: { entryId: string; servings?: number; mealType?: string; notes?: string }
) => {
	const { entryId, ...rest } = args;
	const result = await updateEntry(userId, entryId, rest);
	if (!result.success) return { error: result.error.message };
	return { success: true, entryId };
};

export const handleDeleteEntry = async (userId: string, entryId: string) => {
	await deleteEntry(userId, entryId);
	return { success: true };
};

export const handleGetGoals = async (userId: string) => {
	const goals = await getGoals(userId);
	return { goals };
};

export const handleUpdateGoals = async (userId: string, payload: unknown) => {
	const result = await upsertGoals(userId, payload);
	if (!result.success) return { error: result.error.message };
	return { success: true };
};

export const handleListRecipes = async (userId: string) => {
	const recipes = await listRecipes(userId);
	return { recipes };
};

export const handleGetRecipe = async (userId: string, recipeId: string) => {
	const recipe = await getRecipe(userId, recipeId);
	if (!recipe) return { error: 'Recipe not found' };
	return recipe;
};

export const handleGetFood = async (userId: string, foodId: string) => {
	const food = await getFood(userId, foodId);
	if (!food) return { error: 'Food not found' };
	return food;
};

export const handleListFavorites = async (userId: string) => {
	const [foods, recipes] = await Promise.all([
		listFavoriteFoods(userId),
		listFavoriteRecipes(userId)
	]);
	return { foods, recipes };
};

export const handleLogWeight = async (
	userId: string,
	args: { weightKg: number; date?: string; notes?: string }
) => {
	const result = await createWeightEntry(userId, {
		weightKg: args.weightKg,
		date: args.date,
		notes: args.notes
	});
	if (!result.success) return { error: result.error.message };
	return { success: true, entryId: result.data.id };
};

export const handleGetWeight = async (userId: string, args: { from?: string; to?: string }) => {
	if (args.from || args.to) {
		if (!args.from || !args.to) {
			return {
				error: 'Provide both "from" and "to" for a date range, or omit both for latest weight'
			};
		}
		return await getWeightWithTrend(userId, args.from, args.to);
	}
	const latest = await getLatestWeight(userId);
	return latest ?? { error: 'No weight entries found' };
};

export const handleGetWeeklyStats = async (userId: string) => {
	return await getWeeklyStats(userId);
};

export const handleGetMonthlyStats = async (userId: string) => {
	return await getMonthlyStats(userId);
};

export const handleCopyEntries = async (
	userId: string,
	args: { fromDate: string; toDate?: string }
) => {
	const targetDate = args.toDate ?? today();
	const copied = await copyEntries(userId, args.fromDate, targetDate);
	return { success: true, copiedCount: copied.length };
};

export const handleFindFoodByBarcode = async (userId: string, barcode: string) => {
	const food = await findFoodByBarcode(userId, barcode);
	if (!food) return { found: false };
	return { found: true, ...food };
};

export const handleUpdateFood = async (
	userId: string,
	args: { foodId: string; [key: string]: unknown }
) => {
	const { foodId, ...rest } = args;
	const result = await updateFood(userId, foodId, rest);
	if (!result.success) return { error: result.error.message };
	return { success: true, foodId };
};

export const handleDeleteFood = async (
	userId: string,
	args: { foodId: string; force?: boolean }
) => {
	const result = await deleteFood(userId, args.foodId, args.force ?? false);
	if (result.blocked) return { blocked: true, entryCount: result.entryCount, hint: 'Use force=true to delete with all entries' };
	return { success: true };
};

export const handleListRecentFoods = async (userId: string, args: { limit?: number }) => {
	return listRecentFoods(userId, args.limit ?? 25);
};

export const handleUpdateRecipe = async (
	userId: string,
	args: { recipeId: string; [key: string]: unknown }
) => {
	const { recipeId, ...rest } = args;
	const result = await updateRecipe(userId, recipeId, rest);
	if (!result.success) return { error: result.error.message };
	return { success: true, recipeId };
};

export const handleDeleteRecipe = async (
	userId: string,
	args: { recipeId: string; force?: boolean }
) => {
	const result = await deleteRecipe(userId, args.recipeId, args.force ?? false);
	if (result.blocked) return { blocked: true, entryCount: result.entryCount, hint: 'Use force=true to delete with all entries' };
	return { success: true };
};

export const handleCreateSupplement = async (userId: string, args: unknown) => {
	const result = await createSupplement(userId, args);
	if (!result.success) return { error: result.error.message };
	return { success: true, supplementId: result.data.id };
};

export const handleListSupplements = async (userId: string, args: { activeOnly?: boolean }) => {
	return { supplements: await listSupplements(userId, args.activeOnly ?? true) };
};

export const handleUpdateSupplement = async (
	userId: string,
	args: { supplementId: string; [key: string]: unknown }
) => {
	const { supplementId, ...rest } = args;
	const result = await updateSupplement(userId, supplementId, rest);
	if (!result.success) return { error: result.error.message };
	return { success: true, supplementId };
};

export const handleDeleteSupplement = async (
	userId: string,
	args: { supplementId: string }
) => {
	await deleteSupplement(userId, args.supplementId);
	return { success: true };
};

export const handleUnlogSupplement = async (
	userId: string,
	args: { supplementId: string; date?: string }
) => {
	await unlogSupplement(userId, args.supplementId, args.date ?? today());
	return { success: true };
};

export const handleUpdateWeight = async (
	userId: string,
	args: { weightId: string; [key: string]: unknown }
) => {
	const { weightId, ...rest } = args;
	const result = await updateWeightEntry(userId, weightId, rest);
	if (!result.success) return { error: result.error.message };
	return { success: true, weightId };
};

export const handleDeleteWeight = async (userId: string, args: { weightId: string }) => {
	const deleted = await deleteWeightEntry(userId, args.weightId);
	if (!deleted) return { error: 'Weight entry not found' };
	return { success: true };
};

export const handleGetDailyBreakdown = async (
	userId: string,
	args: { startDate: string; endDate: string }
) => {
	return getDailyBreakdown(userId, args.startDate, args.endDate);
};

export const handleGetMealBreakdown = async (
	userId: string,
	args: { startDate: string; endDate: string }
) => {
	return getMealBreakdown(userId, args.startDate, args.endDate);
};

export const handleGetTopFoods = async (
	userId: string,
	args: { days?: number; limit?: number }
) => {
	return getTopFoods(userId, args.days ?? 7, args.limit ?? 10);
};

export const handleGetStreaks = async (userId: string) => {
	return getStreaks(userId);
};
