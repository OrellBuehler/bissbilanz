import {
	createFood,
	updateFood,
	deleteFood,
	listFoods,
	listRecentFoods,
	getFood,
	findFoodByBarcode
} from '$lib/server/foods';
import {
	createRecipe,
	updateRecipe,
	deleteRecipe,
	listRecipes,
	getRecipe
} from '$lib/server/recipes';
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
	getSupplementById,
	getSupplementChecklist
} from '$lib/server/supplements';
import { createHandlers } from './create-handlers';

export { createHandlers, type HandlerDeps } from './create-handlers';

export const {
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
} = createHandlers({
	listFoods,
	createFood,
	updateFood,
	deleteFood,
	getFood,
	findFoodByBarcode,
	listRecentFoods,
	createRecipe,
	updateRecipe,
	deleteRecipe,
	listRecipes,
	getRecipe,
	createEntry,
	listEntriesByDate,
	updateEntry,
	deleteEntry,
	copyEntries,
	getGoals,
	upsertGoals,
	listFavoriteFoods,
	listFavoriteRecipes,
	createWeightEntry,
	updateWeightEntry,
	deleteWeightEntry,
	getLatestWeight,
	getWeightWithTrend,
	getWeeklyStats,
	getMonthlyStats,
	getDailyBreakdown,
	getMealBreakdown,
	getTopFoods,
	getStreaks,
	formatDailyStatus,
	today,
	createSupplement,
	listSupplements,
	updateSupplement,
	deleteSupplement,
	unlogSupplement,
	getLogsForDate,
	logSupplement,
	getSupplementById,
	getSupplementChecklist
});
