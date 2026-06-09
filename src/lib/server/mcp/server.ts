import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { safe } from './safe';
import { describeShape } from './schema-utils';
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
	handleFindFoodByBarcode,
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
	handleListMealTypes,
	handleGetSupplementHistory,
	handleGetDayProperties,
	handleSetDayProperties,
	handleDeleteDayProperties,
	handleGetCalendarStats
} from './handlers';
import { today } from '$lib/utils/dates';
import { ALL_NUTRIENTS } from '$lib/nutrients';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false } as const;
const UPDATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true } as const;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD format');

const dateRangeSchema = {
	startDate: dateStr.describe('Start date in YYYY-MM-DD format'),
	endDate: dateStr.describe('End date in YYYY-MM-DD format')
};

const MCP_SERVER_NAME = 'bissbilanz';
const MCP_SERVER_VERSION = '0.1.0';

export function createMcpServer(userId: string): McpServer {
	const server = new McpServer({
		name: MCP_SERVER_NAME,
		version: MCP_SERVER_VERSION
	});

	server.registerTool(
		'get_daily_status',
		{
			description:
				"Get today's nutrition status including total calories, protein, carbs, fat, fiber consumed, daily goals, progress percentages, and per-meal breakdown.",
			inputSchema: {
				date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.'),
				includeEntries: z
					.boolean()
					.optional()
					.describe('Include individual food entries in the response.')
			},
			annotations: READ_ONLY
		},
		safe(({ date, includeEntries }) => handleGetDailyStatus(userId, date, includeEntries))
	);

	server.registerTool(
		'search_foods',
		{
			description:
				"Search the user's food database by name. Returns matching foods with nutritional information, sorted by recent usage.",
			inputSchema: {
				query: z.string().describe('Search query to match against food names'),
				limit: z
					.number()
					.int()
					.min(1)
					.max(100)
					.optional()
					.describe('Max results to return. Defaults to 50.'),
				offset: z
					.number()
					.int()
					.min(0)
					.optional()
					.describe('Number of results to skip for pagination.')
			},
			annotations: READ_ONLY
		},
		safe(({ query, limit, offset }) => handleSearchFoods(userId, query, limit, offset))
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
				"Log a food entry to the user's daily diary. Specify either a foodId, recipeId, or quickCalories for a quick log (e.g., eating out). If no date is provided, the entry is logged for today. Returns the updated daily nutrition status.",
			inputSchema: {
				foodId: z.string().optional().describe('Food ID to log'),
				recipeId: z.string().optional().describe('Recipe ID to log'),
				mealType: z
					.string()
					.describe(
						'Meal type. Default values: "Breakfast", "Lunch", "Dinner", "Snacks". Custom meal types are also supported if configured by the user.'
					),
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
						'When the food was eaten, as ISO 8601 datetime with timezone (e.g., "2025-01-15T12:30:00+01:00"). Defaults to current time if not provided.'
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
				"Get a supplement checklist showing which supplements are due and whether they've been taken.",
			inputSchema: {
				date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.')
			},
			annotations: READ_ONLY
		},
		safe(({ date }) => handleGetSupplementStatus(userId, date))
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
					.describe(
						'New meal type. Default values: "Breakfast", "Lunch", "Dinner", "Snacks". Custom meal types are also supported if configured by the user.'
					),
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
					.describe(
						'When the food was eaten, as ISO 8601 datetime with timezone. Omit to leave unchanged.'
					)
			},
			annotations: UPDATE
		},
		safe((args) => handleUpdateEntry(userId, args))
	);

	server.registerTool(
		'delete_entry',
		{
			description:
				'Delete a food entry from the diary. Returns the updated daily nutrition status.',
			inputSchema: {
				entryId: z.string().describe('ID of the entry to delete'),
				date: z
					.string()
					.optional()
					.describe(
						'Date of the entry in YYYY-MM-DD format. Used to return updated daily status. Defaults to today.'
					)
			},
			annotations: DESTRUCTIVE
		},
		safe(({ entryId, date }) => handleDeleteEntry(userId, entryId, date))
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
			description:
				'Get average daily nutrition over 7 days. Defaults to the past 7 days. Use startDate and endDate for a custom range.',
			inputSchema: {
				startDate: dateStr
					.optional()
					.describe('Custom start date in YYYY-MM-DD format. Omit for past 7 days.'),
				endDate: dateStr
					.optional()
					.describe('Custom end date in YYYY-MM-DD format. Omit for today.')
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetWeeklyStats(userId, args.startDate, args.endDate))
	);

	server.registerTool(
		'get_monthly_stats',
		{
			description:
				'Get average daily nutrition over 30 days. Defaults to the past 30 days. Use startDate and endDate for a custom range.',
			inputSchema: {
				startDate: dateStr
					.optional()
					.describe('Custom start date in YYYY-MM-DD format. Omit for past 30 days.'),
				endDate: dateStr
					.optional()
					.describe('Custom end date in YYYY-MM-DD format. Omit for today.')
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetMonthlyStats(userId, args.startDate, args.endDate))
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
			description:
				"Look up a food in the user's database by barcode number. Falls back to Open Food Facts if not found locally.",
			inputSchema: {
				barcode: z.string().describe('Barcode number to search for')
			},
			annotations: READ_ONLY
		},
		safe(({ barcode }) => handleFindFoodByBarcode(userId, barcode))
	);

	server.registerTool(
		'search_openfoodfacts',
		{
			description:
				'Search Open Food Facts for products by name. Returns nutritional data that can be used with create_food to add products to the database.',
			inputSchema: {
				query: z.string().describe('Search query for product name'),
				limit: z.number().optional().describe('Max results to return. Defaults to 5.')
			},
			annotations: READ_ONLY
		},
		safe(({ query, limit }) => handleSearchOpenFoodFacts(query, limit))
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

	// Inline food payload for supplement ingredients. Matches the web form:
	// servingUnit is fixed to 'g' since supplement nutrients are per-dose, and
	// the dosage (e.g. "5000 IU") is preserved in ingredientsText for display.
	const inlineIngredientFoodSchema = z.object({
		name: z.string().describe('Ingredient name (e.g. "Vitamin D3")'),
		ingredientsText: z
			.string()
			.optional()
			.describe('Human-readable dosage label, e.g. "5000 IU" or "200 mg"'),
		...nutrientInputSchema
	});

	const supplementIngredientInputSchema = z
		.object({
			foodId: z
				.string()
				.optional()
				.describe('ID of an existing food (usually kind=supplement) to back this ingredient'),
			food: inlineIngredientFoodSchema
				.optional()
				.describe(
					'Inline backing food to create on the fly. Provide either foodId OR food, not both.'
				),
			servings: z
				.number()
				.optional()
				.describe('Servings of the backing food per dose. Defaults to 1.')
		})
		.refine((v) => Boolean(v.foodId) !== Boolean(v.food), {
			message: 'Each ingredient must provide either foodId or food, not both'
		});

	server.registerTool(
		'create_supplement',
		{
			description:
				"Create a new supplement with schedule and ingredients. Each ingredient needs a backing food (kind='supplement') that carries its nutrient data. Pass `foodId` to reuse an existing backing food, or `food: { name, nutrients... }` to create one inline.",
			inputSchema: {
				name: z.string().describe('Supplement name'),
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
					.array(supplementIngredientInputSchema)
					.min(1)
					.describe('At least one ingredient'),
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
					.array(supplementIngredientInputSchema)
					.min(1)
					.optional()
					.describe('New ingredients (replaces all; must have at least one)')
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
		'log_sleep',
		{
			description: 'Log a sleep entry. Records duration and quality for a given date.',
			inputSchema: {
				durationMinutes: z
					.number()
					.int()
					.min(1)
					.max(1440)
					.describe('Total sleep duration in minutes'),
				quality: z
					.number()
					.int()
					.min(1)
					.max(10)
					.describe('Sleep quality rating from 1 (poor) to 10 (great)'),
				date: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.optional()
					.describe('Date in YYYY-MM-DD format. Defaults to today.'),
				bedtime: z.string().optional().describe('Bedtime as ISO datetime string'),
				wakeTime: z.string().optional().describe('Wake time as ISO datetime string'),
				wakeUps: z
					.number()
					.int()
					.min(0)
					.optional()
					.describe('Number of times woken up during the night'),
				notes: z.string().optional().describe('Optional notes')
			},
			annotations: WRITE
		},
		safe((args) => handleLogSleep(userId, args))
	);

	server.registerTool(
		'get_sleep',
		{
			description: 'Get the latest sleep entry, or sleep entries over a date range.',
			inputSchema: {
				from: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.optional()
					.describe('Start date in YYYY-MM-DD format'),
				to: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.optional()
					.describe('End date in YYYY-MM-DD format'),
				limit: z
					.number()
					.int()
					.min(1)
					.max(365)
					.optional()
					.describe('Max entries to return when using date range. Defaults to 100.')
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetSleep(userId, args))
	);

	server.registerTool(
		'update_sleep',
		{
			description: 'Update an existing sleep entry.',
			inputSchema: {
				id: z.string().uuid().describe('Sleep entry ID to update'),
				durationMinutes: z.number().int().min(1).max(1440).optional(),
				quality: z.number().int().min(1).max(10).optional(),
				entryDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.optional()
					.describe('New date in YYYY-MM-DD format'),
				bedtime: z.string().optional().nullable(),
				wakeTime: z.string().optional().nullable(),
				wakeUps: z.number().int().min(0).optional().nullable(),
				notes: z.string().optional().nullable()
			},
			annotations: UPDATE
		},
		safe((args) => handleUpdateSleep(userId, args))
	);

	server.registerTool(
		'delete_sleep',
		{
			description: 'Delete a sleep entry.',
			inputSchema: {
				id: z.string().uuid().describe('Sleep entry ID to delete')
			},
			annotations: DESTRUCTIVE
		},
		safe((args) => handleDeleteSleep(userId, args))
	);

	server.registerTool(
		'get_daily_breakdown',
		{
			description: 'Get daily nutrition totals for a date range, with one row per day.',
			inputSchema: {
				...dateRangeSchema
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
				...dateRangeSchema
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
				days: z
					.number()
					.int()
					.min(1)
					.max(365)
					.optional()
					.describe('Number of days to look back. Defaults to 7.'),
				limit: z
					.number()
					.int()
					.min(1)
					.max(100)
					.optional()
					.describe('Max number of foods to return. Defaults to 10.')
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

	// Analytics tools
	server.registerTool(
		'get_food_diversity',
		{
			description:
				'Analyze dietary variety over a date range. Shows unique foods consumed, diversity score, and most/least eaten foods.',
			inputSchema: {
				...dateRangeSchema
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetFoodDiversity(userId, args))
	);

	server.registerTool(
		'get_meal_timing',
		{
			description:
				'Analyze meal timing patterns over a date range. Shows when meals are typically eaten and calorie distribution by time of day.',
			inputSchema: {
				...dateRangeSchema
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetMealTiming(userId, args))
	);

	server.registerTool(
		'get_sleep_food_correlation',
		{
			description:
				'Analyze correlations between sleep quality/duration and daily nutrition. Shows how calorie and macro intake relates to sleep patterns.',
			inputSchema: {
				...dateRangeSchema
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetSleepFoodCorrelation(userId, args))
	);

	server.registerTool(
		'get_weight_food_series',
		{
			description:
				'Get weight and daily calorie data over a date range for trend analysis. Shows how calorie intake correlates with weight changes.',
			inputSchema: {
				...dateRangeSchema
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetWeightFoodSeries(userId, args))
	);

	server.registerTool(
		'get_extended_nutrients',
		{
			description:
				'Get detailed extended nutrient data (vitamins, minerals, etc.) for food entries over a date range.',
			inputSchema: {
				...dateRangeSchema
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetExtendedNutrients(userId, args))
	);

	server.registerTool(
		'get_daily_nutrients',
		{
			description:
				'Get daily totals for all nutrients (core macros and extended) over a date range, with one row per day.',
			inputSchema: {
				...dateRangeSchema
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetDailyNutrients(userId, args))
	);

	// Meal types
	server.registerTool(
		'list_meal_types',
		{
			description:
				"List all meal types available to the user, including default types (Breakfast, Lunch, Dinner, Snacks) and any custom meal types they've created.",
			inputSchema: {},
			annotations: READ_ONLY
		},
		safe(() => handleListMealTypes(userId))
	);

	// Supplement history
	server.registerTool(
		'get_supplement_history',
		{
			description:
				'Get supplement intake history over a date range. Shows which supplements were taken on which days.',
			inputSchema: {
				from: dateStr.describe('Start date in YYYY-MM-DD format'),
				to: dateStr.describe('End date in YYYY-MM-DD format')
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetSupplementHistory(userId, args))
	);

	// Day properties
	server.registerTool(
		'get_day_properties',
		{
			description:
				'Get properties for a specific day (e.g., whether it is marked as a fasting day).',
			inputSchema: {
				date: dateStr.describe('Date in YYYY-MM-DD format')
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetDayProperties(userId, args))
	);

	server.registerTool(
		'set_day_properties',
		{
			description: 'Set properties for a specific day, such as marking it as a fasting day.',
			inputSchema: {
				date: dateStr.describe('Date in YYYY-MM-DD format'),
				isFastingDay: z.boolean().describe('Whether the day is a fasting day')
			},
			annotations: UPDATE
		},
		safe((args) => handleSetDayProperties(userId, args))
	);

	server.registerTool(
		'delete_day_properties',
		{
			description: 'Remove all properties for a specific day (resets fasting status, etc.).',
			inputSchema: {
				date: dateStr.describe('Date in YYYY-MM-DD format')
			},
			annotations: DESTRUCTIVE
		},
		safe((args) => handleDeleteDayProperties(userId, args))
	);

	// Calendar stats
	server.registerTool(
		'get_calendar_stats',
		{
			description:
				'Get per-day entry presence for a month. Shows which days have food entries logged, useful for adherence tracking.',
			inputSchema: {
				month: z
					.string()
					.regex(/^\d{4}-\d{2}$/)
					.refine(
						(v) => {
							const m = parseInt(v.split('-')[1], 10);
							return m >= 1 && m <= 12;
						},
						{ message: 'Month must be between 01 and 12' }
					)
					.describe('Month in YYYY-MM format (e.g., "2026-03")')
			},
			annotations: READ_ONLY
		},
		safe((args) => handleGetCalendarStats(userId, args))
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
