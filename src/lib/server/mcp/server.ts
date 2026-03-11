import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { servingUnitValues } from '$lib/units';
import {
	handleCreateFood,
	handleUpdateFood,
	handleDeleteFood,
	handleListRecentFoods,
	handleCreateRecipe,
	handleUpdateRecipe,
	handleDeleteRecipe,
	handleGetDailyStatus,
	handleLogFood,
	handleSearchFoods,
	handleGetSupplementStatus,
	handleLogSupplement,
	handleCreateSupplement,
	handleListSupplements,
	handleUpdateSupplement,
	handleDeleteSupplement,
	handleUnlogSupplement,
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
	handleUpdateWeight,
	handleDeleteWeight,
	handleGetWeight,
	handleGetWeeklyStats,
	handleGetMonthlyStats,
	handleGetDailyBreakdown,
	handleGetMealBreakdown,
	handleGetTopFoods,
	handleGetStreaks,
	handleCopyEntries,
	handleFindFoodByBarcode
} from './handlers';
import { today } from '$lib/utils/dates';
import { ALL_NUTRIENTS } from '$lib/nutrients';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false } as const;
const UPDATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true } as const;

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
			},
			annotations: READ_ONLY
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
			},
			annotations: READ_ONLY
		},
		safe(({ query }) => handleSearchFoods(userId, query))
	);

	// Build nutrient schema fields for MCP tools
	const nutrientInputSchema: Record<string, z.ZodType> = {};
	for (const n of ALL_NUTRIENTS) {
		nutrientInputSchema[n.key] = z
			.number()
			.nonnegative()
			.nullable()
			.optional()
			.describe(`${n.key} in ${n.unit} per serving`);
	}

	server.registerTool(
		'create_food',
		{
			description:
				"Create a new food item in the user's food database with nutritional information per serving. Supports extended nutrients (vitamins, minerals, etc.).",
			inputSchema: {
				name: z.string().describe('Food name'),
				brand: z.string().optional().describe('Brand name'),
				servingSize: z.number().describe('Serving size amount'),
				servingUnit: z.enum(servingUnitValues).describe('Serving unit (e.g., "g", "ml", "oz")'),
				calories: z.number().nonnegative().describe('Calories per serving'),
				protein: z.number().nonnegative().describe('Protein in grams per serving'),
				carbs: z.number().nonnegative().describe('Carbohydrates in grams per serving'),
				fat: z.number().nonnegative().describe('Fat in grams per serving'),
				fiber: z.number().nonnegative().describe('Fiber in grams per serving'),
				barcode: z.string().optional().describe('Barcode number'),
				isFavorite: z.boolean().optional().describe('Mark as favorite'),
				nutriScore: z
					.enum(['a', 'b', 'c', 'd', 'e'])
					.nullable()
					.optional()
					.describe('Nutri-Score grade (null to clear)'),
				novaGroup: z
					.number()
					.int()
					.min(1)
					.max(4)
					.nullable()
					.optional()
					.describe('NOVA food processing group 1-4 (null to clear)'),
				additives: z
					.array(z.string())
					.nullable()
					.optional()
					.describe('List of additives (null to clear)'),
				ingredientsText: z
					.string()
					.nullable()
					.optional()
					.describe('Full ingredients text (null to clear)'),
				imageUrl: z
					.string()
					.nullable()
					.optional()
					.describe('Image URL or relative path (null to clear)'),
				...nutrientInputSchema
			},
			annotations: WRITE
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
							servingUnit: z.enum(servingUnitValues).describe('Unit for the quantity')
						})
					)
					.describe('List of ingredients'),
				isFavorite: z.boolean().optional().describe('Mark as favorite'),
				imageUrl: z
					.string()
					.nullable()
					.optional()
					.describe('Image URL or relative path (null to clear)')
			},
			annotations: WRITE
		},
		safe((args) => handleCreateRecipe(userId, args))
	);

	server.registerTool(
		'log_food',
		{
			description:
				"Log a food entry to the user's daily diary. Specify either a foodId, recipeId, or quickCalories for a quick log (e.g., eating out). If no date is provided, the entry is logged for today.",
			inputSchema: {
				foodId: z.string().optional().describe('Food ID to log'),
				recipeId: z.string().optional().describe('Recipe ID to log'),
				mealType: z.string().describe('Meal type (e.g., "Breakfast", "Lunch", "Dinner", "Snacks")'),
				servings: z.number().describe('Number of servings'),
				notes: z.string().optional().describe('Optional notes for the entry'),
				date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.'),
				quickName: z
					.string()
					.optional()
					.describe('Label for quick log entry (e.g., "Restaurant lunch")'),
				quickCalories: z
					.number()
					.nonnegative()
					.optional()
					.describe('Calories for quick log (use instead of foodId/recipeId)'),
				quickProtein: z
					.number()
					.nonnegative()
					.optional()
					.describe('Protein in grams for quick log'),
				quickCarbs: z.number().nonnegative().optional().describe('Carbs in grams for quick log'),
				quickFat: z.number().nonnegative().optional().describe('Fat in grams for quick log'),
				quickFiber: z.number().nonnegative().optional().describe('Fiber in grams for quick log'),
				eatenAt: z
					.string()
					.datetime({ offset: true })
					.optional()
					.describe(
						'When the food was eaten, as ISO 8601 datetime with timezone (e.g., "2025-01-15T12:30:00+01:00"). Defaults to creation time.'
					)
			},
			annotations: WRITE
		},
		safe((args) => handleLogFood(userId, { ...args, date: args.date ?? today() }))
	);

	server.registerTool(
		'get_supplement_status',
		{
			description:
				"Get today's supplement checklist showing which supplements are due and whether they've been taken.",
			inputSchema: {},
			annotations: READ_ONLY
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
			},
			annotations: WRITE
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
			},
			annotations: READ_ONLY
		},
		safe(({ date }) => handleListEntries(userId, date))
	);

	server.registerTool(
		'update_entry',
		{
			description:
				'Update an existing food entry. Can change servings, meal type, notes, or quick log fields.',
			inputSchema: {
				entryId: z.string().describe('ID of the entry to update'),
				servings: z.number().optional().describe('New number of servings'),
				mealType: z
					.string()
					.optional()
					.describe('New meal type (e.g., "Breakfast", "Lunch", "Dinner", "Snacks")'),
				notes: z.string().optional().describe('New notes'),
				quickName: z.string().optional().nullable().describe('New label for quick log entry'),
				quickCalories: z
					.number()
					.nonnegative()
					.optional()
					.nullable()
					.describe('New calories for quick log'),
				quickProtein: z
					.number()
					.nonnegative()
					.optional()
					.nullable()
					.describe('New protein for quick log'),
				quickCarbs: z
					.number()
					.nonnegative()
					.optional()
					.nullable()
					.describe('New carbs for quick log'),
				quickFat: z.number().nonnegative().optional().nullable().describe('New fat for quick log'),
				quickFiber: z
					.number()
					.nonnegative()
					.optional()
					.nullable()
					.describe('New fiber for quick log'),
				eatenAt: z
					.string()
					.datetime({ offset: true })
					.optional()
					.nullable()
					.describe(
						'When the food was eaten, as ISO 8601 datetime with timezone. Set to null to clear.'
					)
			},
			annotations: UPDATE
		},
		safe((args) => handleUpdateEntry(userId, args))
	);

	server.registerTool(
		'delete_entry',
		{
			description: 'Delete a food entry from the diary.',
			inputSchema: {
				entryId: z.string().describe('ID of the entry to delete')
			},
			annotations: DESTRUCTIVE
		},
		safe(({ entryId }) => handleDeleteEntry(userId, entryId))
	);

	server.registerTool(
		'get_goals',
		{
			description:
				"Get the user's daily nutrition goals for calories, protein, carbs, fat, and fiber.",
			inputSchema: {},
			annotations: READ_ONLY
		},
		safe(() => handleGetGoals(userId))
	);

	server.registerTool(
		'update_goals',
		{
			description: 'Set or update daily nutrition goals.',
			inputSchema: {
				calorieGoal: z.number().positive().describe('Daily calorie goal'),
				proteinGoal: z.number().nonnegative().describe('Daily protein goal in grams'),
				carbGoal: z.number().nonnegative().describe('Daily carbohydrate goal in grams'),
				fatGoal: z.number().nonnegative().describe('Daily fat goal in grams'),
				fiberGoal: z.number().nonnegative().describe('Daily fiber goal in grams'),
				sodiumGoal: z
					.number()
					.nonnegative()
					.nullable()
					.optional()
					.describe('Daily sodium goal in mg'),
				sugarGoal: z.number().nonnegative().nullable().optional().describe('Daily sugar goal in g')
			},
			annotations: UPDATE
		},
		safe((args) => handleUpdateGoals(userId, args))
	);

	server.registerTool(
		'list_recipes',
		{
			description: "List all recipes in the user's database with total macros per serving.",
			inputSchema: {},
			annotations: READ_ONLY
		},
		safe(() => handleListRecipes(userId))
	);

	server.registerTool(
		'get_recipe',
		{
			description: 'Get a recipe with its full ingredient list and macros.',
			inputSchema: {
				recipeId: z.string().describe('ID of the recipe')
			},
			annotations: READ_ONLY
		},
		safe(({ recipeId }) => handleGetRecipe(userId, recipeId))
	);

	server.registerTool(
		'get_food',
		{
			description: 'Get full nutritional details for a specific food by ID.',
			inputSchema: {
				foodId: z.string().describe('ID of the food')
			},
			annotations: READ_ONLY
		},
		safe(({ foodId }) => handleGetFood(userId, foodId))
	);

	server.registerTool(
		'list_favorites',
		{
			description: "List the user's favorite foods and recipes, sorted by most frequently logged.",
			inputSchema: {},
			annotations: READ_ONLY
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
			},
			annotations: WRITE
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
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetWeight(userId, args))
	);

	server.registerTool(
		'get_weekly_stats',
		{
			description: 'Get average daily nutrition over the past 7 days.',
			inputSchema: {},
			annotations: READ_ONLY
		},
		safe(() => handleGetWeeklyStats(userId))
	);

	server.registerTool(
		'get_monthly_stats',
		{
			description: 'Get average daily nutrition over the past 30 days.',
			inputSchema: {},
			annotations: READ_ONLY
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
			},
			annotations: WRITE
		},
		safe((args) => handleCopyEntries(userId, args))
	);

	server.registerTool(
		'find_food_by_barcode',
		{
			description: "Look up a food in the user's database by barcode number.",
			inputSchema: {
				barcode: z.string().describe('Barcode number to search for')
			},
			annotations: READ_ONLY
		},
		safe(({ barcode }) => handleFindFoodByBarcode(userId, barcode))
	);

	server.registerTool(
		'update_food',
		{
			description:
				'Update an existing food item in the database. Supports extended nutrients (vitamins, minerals, etc.).',
			inputSchema: {
				foodId: z.string().describe('The food ID to update'),
				name: z.string().optional().describe('New name'),
				servingSize: z.number().optional().describe('New serving size'),
				servingUnit: z.enum(servingUnitValues).optional().describe('New serving unit'),
				calories: z.number().nonnegative().optional().describe('New calories per serving'),
				protein: z.number().nonnegative().optional().describe('New protein in grams per serving'),
				carbs: z.number().nonnegative().optional().describe('New carbs in grams per serving'),
				fat: z.number().nonnegative().optional().describe('New fat in grams per serving'),
				fiber: z.number().nonnegative().optional().describe('New fiber in grams per serving'),
				brand: z.string().optional().describe('New brand name'),
				barcode: z.string().optional().describe('New barcode number'),
				isFavorite: z.boolean().optional().describe('Mark as favorite'),
				nutriScore: z
					.enum(['a', 'b', 'c', 'd', 'e'])
					.nullable()
					.optional()
					.describe('Nutri-Score grade (null to clear)'),
				novaGroup: z
					.number()
					.int()
					.min(1)
					.max(4)
					.nullable()
					.optional()
					.describe('NOVA food processing group 1-4 (null to clear)'),
				additives: z
					.array(z.string())
					.nullable()
					.optional()
					.describe('List of additives (null to clear)'),
				ingredientsText: z
					.string()
					.nullable()
					.optional()
					.describe('Full ingredients text (null to clear)'),
				imageUrl: z
					.string()
					.nullable()
					.optional()
					.describe('Image URL or relative path (null to clear)'),
				...nutrientInputSchema
			},
			annotations: UPDATE
		},
		safe(({ foodId, ...rest }) => handleUpdateFood(userId, { foodId, ...rest }))
	);

	server.registerTool(
		'delete_food',
		{
			description:
				'Delete a food from the database. If the food has diary entries, returns blocked status unless force=true.',
			inputSchema: {
				foodId: z.string().describe('The food ID to delete'),
				force: z.boolean().optional().describe('Force delete even if food has diary entries')
			},
			annotations: DESTRUCTIVE
		},
		safe((args) => handleDeleteFood(userId, args))
	);

	server.registerTool(
		'list_recent_foods',
		{
			description: 'List recently logged foods, ordered by most recent.',
			inputSchema: {
				limit: z.number().optional().describe('Max number of foods to return. Defaults to 25.')
			},
			annotations: READ_ONLY
		},
		safe((args) => handleListRecentFoods(userId, args))
	);

	server.registerTool(
		'update_recipe',
		{
			description:
				'Update an existing recipe. Can change name, servings, or replace all ingredients.',
			inputSchema: {
				recipeId: z.string().describe('The recipe ID to update'),
				name: z.string().optional().describe('New recipe name'),
				totalServings: z.number().optional().describe('New number of servings'),
				ingredients: z
					.array(
						z.object({
							foodId: z.string().describe('Food ID from the database'),
							quantity: z.number().describe('Quantity of the food'),
							servingUnit: z.enum(servingUnitValues).describe('Unit for the quantity')
						})
					)
					.optional()
					.describe('New list of ingredients (replaces all existing)'),
				isFavorite: z.boolean().optional().describe('Mark as favorite'),
				imageUrl: z
					.string()
					.nullable()
					.optional()
					.describe('Image URL or relative path (null to clear)')
			},
			annotations: UPDATE
		},
		safe(({ recipeId, ...rest }) => handleUpdateRecipe(userId, { recipeId, ...rest }))
	);

	server.registerTool(
		'delete_recipe',
		{
			description:
				'Delete a recipe. If the recipe has diary entries, returns blocked status unless force=true.',
			inputSchema: {
				recipeId: z.string().describe('The recipe ID to delete'),
				force: z.boolean().optional().describe('Force delete even if recipe has diary entries')
			},
			annotations: DESTRUCTIVE
		},
		safe((args) => handleDeleteRecipe(userId, args))
	);

	server.registerTool(
		'create_supplement',
		{
			description: 'Create a new supplement with schedule and optional ingredients.',
			inputSchema: {
				name: z.string().describe('Supplement name'),
				dosage: z.number().describe('Dosage amount'),
				dosageUnit: z.string().describe('Dosage unit (e.g., "mg", "mcg", "IU", "capsules")'),
				scheduleType: z
					.enum(['daily', 'every_other_day', 'weekly', 'specific_days'])
					.describe('Schedule type'),
				scheduleDays: z
					.array(z.number())
					.optional()
					.describe('Days of week (0=Sun..6=Sat) for weekly/specific_days'),
				scheduleStartDate: z.string().optional().describe('Start date in YYYY-MM-DD format'),
				timeOfDay: z
					.enum(['morning', 'noon', 'evening'])
					.optional()
					.describe('Preferred time of day'),
				ingredients: z
					.array(
						z.object({
							name: z.string().describe('Ingredient name'),
							dosage: z.number().describe('Ingredient dosage'),
							dosageUnit: z.string().describe('Ingredient dosage unit')
						})
					)
					.optional()
					.describe('List of ingredients in the supplement'),
				isActive: z
					.boolean()
					.optional()
					.describe('Whether the supplement is active. Defaults to true.')
			},
			annotations: WRITE
		},
		safe((args) => handleCreateSupplement(userId, args))
	);

	server.registerTool(
		'list_supplements',
		{
			description: "List the user's supplements.",
			inputSchema: {
				activeOnly: z
					.boolean()
					.optional()
					.describe('Only show active supplements. Defaults to true.')
			},
			annotations: READ_ONLY
		},
		safe((args) => handleListSupplements(userId, args))
	);

	server.registerTool(
		'update_supplement',
		{
			description: 'Update an existing supplement.',
			inputSchema: {
				supplementId: z.string().describe('The supplement ID to update'),
				name: z.string().optional().describe('New name'),
				dosage: z.number().optional().describe('New dosage amount'),
				dosageUnit: z.string().optional().describe('New dosage unit'),
				scheduleType: z
					.enum(['daily', 'every_other_day', 'weekly', 'specific_days'])
					.optional()
					.describe('New schedule type'),
				scheduleDays: z.array(z.number()).optional().describe('New days of week'),
				scheduleStartDate: z.string().optional().describe('New start date'),
				timeOfDay: z
					.enum(['morning', 'noon', 'evening'])
					.optional()
					.nullable()
					.describe('New time of day'),
				isActive: z.boolean().optional().describe('Active status'),
				ingredients: z
					.array(
						z.object({
							name: z.string().describe('Ingredient name'),
							dosage: z.number().describe('Ingredient dosage'),
							dosageUnit: z.string().describe('Ingredient dosage unit')
						})
					)
					.optional()
					.nullable()
					.describe('New ingredients (replaces all; null to clear)')
			},
			annotations: UPDATE
		},
		safe(({ supplementId, ...rest }) => handleUpdateSupplement(userId, { supplementId, ...rest }))
	);

	server.registerTool(
		'delete_supplement',
		{
			description: 'Delete a supplement.',
			inputSchema: {
				supplementId: z.string().describe('The supplement ID to delete')
			},
			annotations: DESTRUCTIVE
		},
		safe((args) => handleDeleteSupplement(userId, args))
	);

	server.registerTool(
		'unlog_supplement',
		{
			description: 'Remove a supplement log entry (mark as not taken).',
			inputSchema: {
				supplementId: z.string().describe('The supplement ID to unlog'),
				date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.')
			},
			annotations: DESTRUCTIVE
		},
		safe((args) => handleUnlogSupplement(userId, args))
	);

	server.registerTool(
		'update_weight',
		{
			description: 'Update an existing weight entry.',
			inputSchema: {
				weightId: z.string().describe('The weight entry ID to update'),
				weightKg: z.number().optional().describe('New weight in kilograms'),
				entryDate: z.string().optional().describe('New date in YYYY-MM-DD format'),
				notes: z.string().optional().nullable().describe('New notes')
			},
			annotations: UPDATE
		},
		safe(({ weightId, ...rest }) => handleUpdateWeight(userId, { weightId, ...rest }))
	);

	server.registerTool(
		'delete_weight',
		{
			description: 'Delete a weight entry.',
			inputSchema: {
				weightId: z.string().describe('The weight entry ID to delete')
			},
			annotations: DESTRUCTIVE
		},
		safe((args) => handleDeleteWeight(userId, args))
	);

	server.registerTool(
		'get_daily_breakdown',
		{
			description: 'Get daily nutrition totals for a date range, with one row per day.',
			inputSchema: {
				startDate: z.string().describe('Start date in YYYY-MM-DD format'),
				endDate: z.string().describe('End date in YYYY-MM-DD format')
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetDailyBreakdown(userId, args))
	);

	server.registerTool(
		'get_meal_breakdown',
		{
			description: 'Get nutrition totals broken down by meal type for a date range.',
			inputSchema: {
				startDate: z.string().describe('Start date in YYYY-MM-DD format'),
				endDate: z.string().describe('End date in YYYY-MM-DD format')
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetMealBreakdown(userId, args))
	);

	server.registerTool(
		'get_top_foods',
		{
			description: 'Get the most frequently logged foods over a period.',
			inputSchema: {
				days: z.number().optional().describe('Number of days to look back. Defaults to 7.'),
				limit: z.number().optional().describe('Max number of foods to return. Defaults to 10.')
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetTopFoods(userId, args))
	);

	server.registerTool(
		'get_streaks',
		{
			description: 'Get current and longest logging streaks (consecutive days with entries).',
			inputSchema: {},
			annotations: READ_ONLY
		},
		safe(() => handleGetStreaks(userId))
	);

	// Static resources
	server.registerResource(
		"Today's Diary",
		'diary://today',
		{
			description: 'Food entries logged today',
			mimeType: 'application/json'
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleListEntries(userId))
				}
			]
		})
	);

	server.registerResource(
		"Today's Status",
		'status://today',
		{
			description: "Today's nutrition status with totals and goals",
			mimeType: 'application/json'
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleGetDailyStatus(userId))
				}
			]
		})
	);

	server.registerResource(
		'Goals',
		'goals://current',
		{
			description: 'Current daily nutrition goals',
			mimeType: 'application/json'
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleGetGoals(userId))
				}
			]
		})
	);

	server.registerResource(
		'Favorites',
		'favorites://list',
		{
			description: 'Favorite foods and recipes',
			mimeType: 'application/json'
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleListFavorites(userId))
				}
			]
		})
	);

	server.registerResource(
		'All Recipes',
		'recipes://list',
		{
			description: 'All recipes in the database',
			mimeType: 'application/json'
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleListRecipes(userId))
				}
			]
		})
	);

	server.registerResource(
		'Supplements',
		'supplements://list',
		{
			description: 'All supplements',
			mimeType: 'application/json'
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleListSupplements(userId, {}))
				}
			]
		})
	);

	server.registerResource(
		'Supplement Status',
		'supplements://status',
		{
			description: "Today's supplement checklist",
			mimeType: 'application/json'
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleGetSupplementStatus(userId))
				}
			]
		})
	);

	server.registerResource(
		'Latest Weight',
		'weight://latest',
		{
			description: 'Latest weight entry',
			mimeType: 'application/json'
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleGetWeight(userId, {}))
				}
			]
		})
	);

	server.registerResource(
		'Weekly Stats',
		'stats://weekly',
		{
			description: 'Average daily nutrition over the past 7 days',
			mimeType: 'application/json'
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleGetWeeklyStats(userId))
				}
			]
		})
	);

	server.registerResource(
		'Monthly Stats',
		'stats://monthly',
		{
			description: 'Average daily nutrition over the past 30 days',
			mimeType: 'application/json'
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleGetMonthlyStats(userId))
				}
			]
		})
	);

	server.registerResource(
		'Streaks',
		'streaks://current',
		{
			description: 'Current and longest logging streaks',
			mimeType: 'application/json'
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleGetStreaks(userId))
				}
			]
		})
	);

	// Template resources
	server.registerResource(
		'Diary by Date',
		new ResourceTemplate('diary://{date}', { list: undefined }),
		{
			description: 'Food entries for a specific date (YYYY-MM-DD)',
			mimeType: 'application/json'
		},
		async (uri, { date }) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleListEntries(userId, date as string))
				}
			]
		})
	);

	server.registerResource(
		'Status by Date',
		new ResourceTemplate('status://{date}', { list: undefined }),
		{
			description: 'Nutrition status for a specific date (YYYY-MM-DD)',
			mimeType: 'application/json'
		},
		async (uri, { date }) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleGetDailyStatus(userId, date as string))
				}
			]
		})
	);

	server.registerResource(
		'Food by ID',
		new ResourceTemplate('food://{foodId}', { list: undefined }),
		{
			description: 'Full nutritional details for a specific food',
			mimeType: 'application/json'
		},
		async (uri, { foodId }) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleGetFood(userId, foodId as string))
				}
			]
		})
	);

	server.registerResource(
		'Recipe by ID',
		new ResourceTemplate('recipe://{recipeId}', { list: undefined }),
		{
			description: 'Recipe with full ingredient list and macros',
			mimeType: 'application/json'
		},
		async (uri, { recipeId }) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(await handleGetRecipe(userId, recipeId as string))
				}
			]
		})
	);

	server.registerResource(
		'Weight Trend',
		new ResourceTemplate('weight://{from}/{to}', { list: undefined }),
		{
			description: 'Weight trend over a date range (YYYY-MM-DD)',
			mimeType: 'application/json'
		},
		async (uri, { from, to }) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: 'application/json',
					text: JSON.stringify(
						await handleGetWeight(userId, { from: from as string, to: to as string })
					)
				}
			]
		})
	);

	return server;
}
