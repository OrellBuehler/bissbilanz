import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
	handleCreateFood,
	handleCreateRecipe,
	handleGetDailyStatus,
	handleLogFood,
	handleSearchFoods,
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
	handleFindFoodByBarcode
} from './handlers';
import { today } from '$lib/utils/dates';

const MCP_SERVER_NAME = 'bissbilanz';
const MCP_SERVER_VERSION = '0.1.0';

export function createMcpServer(userId: string): McpServer {
	const server = new McpServer({
		name: MCP_SERVER_NAME,
		version: MCP_SERVER_VERSION
	});

	const asText = (payload: unknown) => ({
		content: [
			{
				type: 'text' as const,
				text: JSON.stringify(payload, null, 2)
			}
		]
	});

	const safe = <T extends unknown[], R>(fn: (...args: T) => Promise<R>) => {
		return async (...args: T) => {
			try {
				return asText(await fn(...args));
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				return asText({ error: message });
			}
		};
	};

	server.registerTool(
		'get_daily_status',
		{
			description:
				"Get today's nutrition status including total calories, protein, carbs, fat, fiber consumed and daily goals.",
			inputSchema: {
				date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.')
			}
		},
		safe(({ date }) => handleGetDailyStatus(userId, date))
	);

	server.registerTool(
		'search_foods',
		{
			description:
				"Search the user's food database by name. Returns matching foods with nutritional information.",
			inputSchema: {
				query: z.string().describe('Search query to match against food names')
			}
		},
		safe(({ query }) => handleSearchFoods(userId, query))
	);

	server.registerTool(
		'create_food',
		{
			description:
				"Create a new food item in the user's food database with nutritional information per serving.",
			inputSchema: {
				name: z.string().describe('Food name'),
				brand: z.string().optional().describe('Brand name'),
				servingSize: z.number().describe('Serving size amount'),
				servingUnit: z.string().describe('Serving unit (e.g., "g", "ml", "piece")'),
				calories: z.number().describe('Calories per serving'),
				protein: z.number().describe('Protein in grams per serving'),
				carbs: z.number().describe('Carbohydrates in grams per serving'),
				fat: z.number().describe('Fat in grams per serving'),
				fiber: z.number().describe('Fiber in grams per serving'),
				barcode: z.string().optional().describe('Barcode number')
			}
		},
		safe((args) => handleCreateFood(userId, args))
	);

	server.registerTool(
		'create_recipe',
		{
			description:
				'Create a new recipe with multiple food ingredients. Each ingredient references a food ID from the database.',
			inputSchema: {
				name: z.string().describe('Recipe name'),
				totalServings: z.number().describe('Number of servings the recipe makes'),
				ingredients: z
					.array(
						z.object({
							foodId: z.string().describe('Food ID from the database'),
							quantity: z.number().describe('Quantity of the food'),
							servingUnit: z.string().describe('Unit for the quantity')
						})
					)
					.describe('List of ingredients')
			}
		},
		safe((args) => handleCreateRecipe(userId, args))
	);

	server.registerTool(
		'log_food',
		{
			description:
				"Log a food entry to the user's daily diary. Specify either a foodId or recipeId. If no date is provided, the entry is logged for today.",
			inputSchema: {
				foodId: z.string().optional().describe('Food ID to log'),
				recipeId: z.string().optional().describe('Recipe ID to log'),
				mealType: z.string().describe('Meal type (e.g., "Breakfast", "Lunch", "Dinner", "Snacks")'),
				servings: z.number().describe('Number of servings'),
				notes: z.string().optional().describe('Optional notes for the entry'),
				date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.')
			}
		},
		safe((args) => handleLogFood(userId, { ...args, date: args.date ?? today() }))
	);

	server.registerTool(
		'get_supplement_status',
		{
			description:
				"Get today's supplement checklist showing which supplements are due and whether they've been taken.",
			inputSchema: {}
		},
		safe(() => handleGetSupplementStatus(userId))
	);

	server.registerTool(
		'log_supplement',
		{
			description:
				'Mark a supplement as taken. Search by name or provide a specific supplement ID.',
			inputSchema: {
				name: z.string().optional().describe('Supplement name to search for (fuzzy match)'),
				supplementId: z.string().optional().describe('Exact supplement ID'),
				date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.')
			}
		},
		safe((args) => handleLogSupplement(userId, args))
	);

	server.registerTool(
		'list_entries',
		{
			description:
				'List all food entries for a given date with food names, meal types, servings, and macros.',
			inputSchema: {
				date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.')
			}
		},
		safe(({ date }) => handleListEntries(userId, date))
	);

	server.registerTool(
		'update_entry',
		{
			description: 'Update an existing food entry. Can change servings, meal type, or notes.',
			inputSchema: {
				entryId: z.string().describe('ID of the entry to update'),
				servings: z.number().optional().describe('New number of servings'),
				mealType: z
					.string()
					.optional()
					.describe('New meal type (e.g., "Breakfast", "Lunch", "Dinner", "Snacks")'),
				notes: z.string().optional().describe('New notes')
			}
		},
		safe((args) => handleUpdateEntry(userId, args))
	);

	server.registerTool(
		'delete_entry',
		{
			description: 'Delete a food entry from the diary.',
			inputSchema: {
				entryId: z.string().describe('ID of the entry to delete')
			}
		},
		safe(({ entryId }) => handleDeleteEntry(userId, entryId))
	);

	server.registerTool(
		'get_goals',
		{
			description:
				"Get the user's daily nutrition goals for calories, protein, carbs, fat, and fiber.",
			inputSchema: {}
		},
		safe(() => handleGetGoals(userId))
	);

	server.registerTool(
		'update_goals',
		{
			description: 'Set or update daily nutrition goals.',
			inputSchema: {
				calorieGoal: z.number().describe('Daily calorie goal'),
				proteinGoal: z.number().describe('Daily protein goal in grams'),
				carbGoal: z.number().describe('Daily carbohydrate goal in grams'),
				fatGoal: z.number().describe('Daily fat goal in grams'),
				fiberGoal: z.number().describe('Daily fiber goal in grams')
			}
		},
		safe((args) => handleUpdateGoals(userId, args))
	);

	server.registerTool(
		'list_recipes',
		{
			description: "List all recipes in the user's database with total macros per serving.",
			inputSchema: {}
		},
		safe(() => handleListRecipes(userId))
	);

	server.registerTool(
		'get_recipe',
		{
			description: 'Get a recipe with its full ingredient list and macros.',
			inputSchema: {
				recipeId: z.string().describe('ID of the recipe')
			}
		},
		safe(({ recipeId }) => handleGetRecipe(userId, recipeId))
	);

	server.registerTool(
		'get_food',
		{
			description: 'Get full nutritional details for a specific food by ID.',
			inputSchema: {
				foodId: z.string().describe('ID of the food')
			}
		},
		safe(({ foodId }) => handleGetFood(userId, foodId))
	);

	server.registerTool(
		'list_favorites',
		{
			description: "List the user's favorite foods and recipes, sorted by most frequently logged.",
			inputSchema: {}
		},
		safe(() => handleListFavorites(userId))
	);

	server.registerTool(
		'log_weight',
		{
			description: 'Log a body weight measurement.',
			inputSchema: {
				weightKg: z.number().describe('Weight in kilograms'),
				date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.'),
				notes: z.string().optional().describe('Optional notes')
			}
		},
		safe((args) => handleLogWeight(userId, args))
	);

	server.registerTool(
		'get_weight',
		{
			description: 'Get the latest weight entry, or weight trend over a date range.',
			inputSchema: {
				from: z.string().optional().describe('Start date in YYYY-MM-DD format (for trend)'),
				to: z.string().optional().describe('End date in YYYY-MM-DD format (for trend)')
			}
		},
		safe((args) => handleGetWeight(userId, args))
	);

	server.registerTool(
		'get_weekly_stats',
		{
			description: 'Get average daily nutrition over the past 7 days.',
			inputSchema: {}
		},
		safe(() => handleGetWeeklyStats(userId))
	);

	server.registerTool(
		'get_monthly_stats',
		{
			description: 'Get average daily nutrition over the past 30 days.',
			inputSchema: {}
		},
		safe(() => handleGetMonthlyStats(userId))
	);

	server.registerTool(
		'copy_entries',
		{
			description:
				"Copy all food entries from one date to another. Useful for repeating a day's meals.",
			inputSchema: {
				fromDate: z.string().describe('Source date in YYYY-MM-DD format'),
				toDate: z
					.string()
					.optional()
					.describe('Target date in YYYY-MM-DD format. Defaults to today.')
			}
		},
		safe((args) => handleCopyEntries(userId, args))
	);

	server.registerTool(
		'find_food_by_barcode',
		{
			description: "Look up a food in the user's database by barcode number.",
			inputSchema: {
				barcode: z.string().describe('Barcode number to search for')
			}
		},
		safe(({ barcode }) => handleFindFoodByBarcode(userId, barcode))
	);

	return server;
}
