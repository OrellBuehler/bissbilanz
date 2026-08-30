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
	listEntriesByDateRange,
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
	getWeightWithTrend,
	getWeightEntriesByDateRange
} from '$lib/server/weight';
import {
	getWeeklyStats,
	getMonthlyStats,
	getDailyBreakdown,
	getMealBreakdown,
	getTopFoods,
	getStreaks,
	computeAverages
} from '$lib/server/stats';
import { formatDailyStatus } from '$lib/server/mcp/format';
import { todayInTimeZone } from '$lib/utils/dates';
import { getUserTimeZone } from '$lib/server/preferences';
import {
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
import { fetchProduct, searchProducts } from '$lib/server/openfoodfacts';
import {
	createSleepEntry,
	getSleepEntriesByDateRange,
	getLatestSleep,
	updateSleepEntry,
	deleteSleepEntry
} from '$lib/server/sleep';
import {
	getFoodDiversityData,
	getMealTimingData,
	getSleepFoodCorrelationData,
	getWeightFoodSeries,
	getExtendedNutrientEntries,
	getDailyNutrientTotals
} from '$lib/server/analytics';
import {
	getRdaNutrientEntries,
	getNutrientCandidates,
	getBiologicalSex
} from '$lib/server/nutrient-insights';
import { setFoodLabels, setFoodLabelsBatch } from '$lib/server/food-labels';
import { listMealTypes } from '$lib/server/meal-types';
import {
	getDayProperties,
	setDayProperties,
	deleteDayProperties,
	getFastingDays
} from '$lib/server/day-properties';
import { getCalendarStats } from '$lib/server/stats';
import { listAiTasks, getAiTask, updateAiTask, dismissAiTaskByAgent } from '$lib/server/ai-tasks';
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
	handleSetFoodLabels,
	handleSetFoodLabelsBatch,
	handleListAiTasks,
	handleGetAiTask,
	handleCompleteAiTask,
	handleDismissAiTask
} = createHandlers({
	listFoods,
	createFood,
	updateFood,
	deleteFood,
	getFood,
	findFoodByBarcode,
	listRecentFoods,
	setFoodLabels,
	setFoodLabelsBatch,
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
	todayForUser: async (userId: string) => todayInTimeZone(await getUserTimeZone(userId)),
	createSupplement,
	listSupplements,
	updateSupplement,
	deleteSupplement,
	unlogSupplement,
	getLogsForDate,
	logSupplement,
	getSupplementById,
	getSupplementChecklist,
	fetchProduct,
	searchProducts,
	createSleepEntry,
	getSleepEntriesByDateRange,
	getLatestSleep,
	updateSleepEntry,
	deleteSleepEntry,
	getLogsForRange,
	computeAverages,
	listEntriesByDateRange,
	getWeightEntriesByDateRange,
	getFastingDays,
	getFoodDiversityData,
	getMealTimingData,
	getSleepFoodCorrelationData,
	getWeightFoodSeries,
	getExtendedNutrientEntries,
	getDailyNutrientTotals,
	getRdaNutrientEntries,
	getNutrientCandidates,
	getBiologicalSex,
	getUserTimeZone,
	listMealTypes,
	getDayProperties,
	setDayProperties,
	deleteDayProperties,
	getCalendarStats,
	listAiTasks,
	getAiTask,
	updateAiTask,
	dismissAiTaskByAgent
});
