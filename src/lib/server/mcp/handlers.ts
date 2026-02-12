import { createFood, listFoods } from '$lib/server/foods';
import { createRecipe } from '$lib/server/recipes';
import { createEntry, listEntriesByDate } from '$lib/server/entries';
import { getGoals } from '$lib/server/goals';
import { formatDailyStatus } from '$lib/server/mcp/format';
import { today } from '$lib/utils/dates';

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
	if (!result.success) throw result.error;
	return { foodId: result.data.id, success: true };
};

export const handleCreateRecipe = async (userId: string, payload: unknown) => {
	const result = await createRecipe(userId, payload);
	if (!result.success) throw result.error;
	return { recipeId: result.data.id, success: true };
};

export const handleLogFood = async (userId: string, payload: unknown) => {
	const result = await createEntry(userId, payload);
	if (!result.success) throw result.error;
	return { entryId: result.data.id, success: true };
};
