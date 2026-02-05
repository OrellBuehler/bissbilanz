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
	const food = await createFood(userId, payload);
	return { foodId: food.id, success: true };
};

export const handleCreateRecipe = async (userId: string, payload: unknown) => {
	const recipe = await createRecipe(userId, payload);
	return { recipeId: recipe.id, success: true };
};

export const handleLogFood = async (userId: string, payload: unknown) => {
	const entry = await createEntry(userId, payload);
	return { entryId: entry.id, success: true };
};
