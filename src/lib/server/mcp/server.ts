import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { safe } from './safe';
import { TOOL_OUTPUT } from './output-schemas';
import { registerPrompts } from './prompts';
import { describeShape } from './schema-utils';
import { foodCreateSchema, foodUpdateSchema } from '$lib/server/validation/foods';
import { entryBaseSchema, entryUpdateSchema } from '$lib/server/validation/entries';
import { recipeCreateSchema, recipeUpdateSchema } from '$lib/server/validation/recipes';
import { goalsSchema } from '$lib/server/validation/goals';
import { dayPropertiesSetSchema } from '$lib/server/validation/day-properties';
import { weightCreateSchema, weightUpdateSchema } from '$lib/server/validation/weight';
import { sleepCreateSchema, sleepUpdateSchema } from '$lib/server/validation/sleep';
import { scheduleTypeValues } from '$lib/supplement-units';
import { aiTaskStatusValues } from '$lib/server/schema';
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
	handleGetMaintenanceCalories,
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
	handleGetCalendarStats,
	handleListAiTasks,
	handleGetAiTask,
	handleCompleteAiTask,
	handleDismissAiTask
} from './handlers';
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

export const MCP_INSTRUCTIONS = `Bissbilanz is the user's personal diary for food, body weight, sleep and supplements. Tools operate on the authenticated user's data only.

Conventions that apply to every tool:
- Dates are "YYYY-MM-DD" in the user's own timezone. "Today" is resolved server-side from the user's timezone preference, so omit the date to mean today instead of computing it yourself. Timestamps (eatenAt, bedtime, wakeTime) are ISO 8601 with an explicit UTC offset.
- Meal types are capitalized: "Breakfast", "Lunch", "Dinner", "Snacks". Lowercase aliases are normalized, but custom meal types are matched verbatim; call list_meal_types when unsure.
- Search before you create. Check search_foods (and find_food_by_barcode or search_openfoodfacts for packaged products) before create_food, and prefer logging an existing foodId or recipeId over a quick log. Use quickName/quickCalories only for one-off estimates such as restaurant meals.
- Amounts are in servings of the food's own serving size (servingSize + servingUnit), not raw grams. Weight is kilograms; sleep duration is minutes.
- Supplements: timeOfDay ("morning", "noon", "evening", or omitted for anytime) and reminderTimes (local "HH:MM") are scheduling preferences only. log_supplement marks a supplement taken for the whole day and creates the matching food entries; there are no per-slot logs. Check get_supplement_status before logging to avoid duplicates.
- log_food and delete_entry return the updated daily status, so a follow-up get_daily_status is unnecessary after logging.`;

export function createMcpServer(userId: string): McpServer {
	const server = new McpServer(
		{
			name: MCP_SERVER_NAME,
			version: MCP_SERVER_VERSION
		},
		{ instructions: MCP_INSTRUCTIONS }
	);

	server.registerTool(
		'get_daily_status',
		{
			title: 'Get Daily Status',
			outputSchema: TOOL_OUTPUT.get_daily_status,
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
			title: 'Search Foods',
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

	const NUTRIENT_DOCS = Object.fromEntries(
		ALL_NUTRIENTS.map((n) => [n.key, `${n.key} in ${n.unit} per serving`])
	);

	const FOOD_FIELD_DOCS = {
		name: 'Food name',
		brand: 'Brand name',
		servingSize: 'Serving size amount',
		servingUnit: 'Serving unit (e.g., "g", "ml", "oz")',
		calories: 'Calories per serving',
		protein: 'Protein in grams per serving',
		carbs: 'Carbohydrates in grams per serving',
		fat: 'Fat in grams per serving',
		fiber: 'Fiber in grams per serving',
		barcode: 'Barcode number',
		isFavorite: 'Mark as favorite',
		nutriScore: 'Nutri-Score grade (null to clear)',
		novaGroup: 'NOVA food processing group 1-4 (null to clear)',
		additives: 'List of additives (null to clear)',
		ingredientsText: 'Full ingredients text (null to clear)',
		imageUrl: 'Image URL or relative path (null to clear)',
		...NUTRIENT_DOCS
	};

	server.registerTool(
		'create_food',
		{
			title: 'Create Food',
			description:
				"Create a new food item in the user's food database with nutritional information per serving. Supports extended nutrients (vitamins, minerals, etc.).",
			inputSchema: describeShape(foodCreateSchema.shape, FOOD_FIELD_DOCS),
			annotations: WRITE
		},
		safe((args) => handleCreateFood(userId, args))
	);

	const RECIPE_FIELD_DOCS = {
		name: 'Recipe name',
		totalServings: 'Number of servings the recipe makes',
		ingredients:
			'List of ingredients. Each needs foodId (from the database), quantity, and servingUnit.',
		isFavorite: 'Mark as favorite',
		imageUrl: 'Image URL or relative path (null to clear)'
	};

	server.registerTool(
		'create_recipe',
		{
			title: 'Create Recipe',
			description:
				'Create a new recipe with multiple food ingredients. Each ingredient references a food ID from the database.',
			inputSchema: describeShape(recipeCreateSchema.shape, RECIPE_FIELD_DOCS),
			annotations: WRITE
		},
		safe((args) => handleCreateRecipe(userId, args))
	);

	const ENTRY_FIELD_DOCS = {
		foodId: 'Food ID to log',
		recipeId: 'Recipe ID to log',
		mealType:
			'Meal type. Default values: "Breakfast", "Lunch", "Dinner", "Snacks". Custom meal types are also supported if configured by the user.',
		servings: 'Number of servings',
		notes: 'Optional notes for the entry',
		date: 'Date in YYYY-MM-DD format. Defaults to today.',
		quickName: 'Label for quick log entry (e.g., "Restaurant lunch")',
		quickCalories: 'Calories for quick log (use instead of foodId/recipeId)',
		quickProtein: 'Protein in grams for quick log',
		quickCarbs: 'Carbs in grams for quick log',
		quickFat: 'Fat in grams for quick log',
		quickFiber: 'Fiber in grams for quick log',
		quickNutrients: `Extended nutrients for a quick log, as an object mapping nutrient key to amount per serving. Valid keys: ${ALL_NUTRIENTS.map((n) => `${n.key} (${n.unit})`).join(', ')}.`,
		eatenAt:
			'When the food was eaten, as ISO 8601 datetime with timezone (e.g., "2025-01-15T12:30:00+01:00"). Defaults to current time if not provided.'
	};

	server.registerTool(
		'log_food',
		{
			title: 'Log Food',
			outputSchema: TOOL_OUTPUT.log_food,
			description:
				"Log a food entry to the user's daily diary. Specify either a foodId, recipeId, or quickCalories for a quick log (e.g., eating out). Quick logs can also carry extended nutrients via quickNutrients. If no date is provided, the entry is logged for today. Returns the updated daily nutrition status.",
			inputSchema: describeShape(
				{ ...entryBaseSchema.shape, date: entryBaseSchema.shape.date.optional() },
				ENTRY_FIELD_DOCS
			),
			annotations: WRITE
		},
		safe((args) => handleLogFood(userId, args))
	);

	server.registerTool(
		'get_supplement_status',
		{
			title: 'Get Supplement Status',
			outputSchema: TOOL_OUTPUT.get_supplement_status,
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
			title: 'Log Supplement',
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
			title: 'List Entries',
			outputSchema: TOOL_OUTPUT.list_entries,
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
			title: 'Update Entry',
			description:
				'Update an existing food entry. Can change servings, meal type, notes, date, food/recipe reference, or quick log fields.',
			inputSchema: {
				entryId: z.string().uuid().describe('ID of the entry to update'),
				...describeShape(entryUpdateSchema.shape, ENTRY_FIELD_DOCS)
			},
			annotations: UPDATE
		},
		safe((args) => handleUpdateEntry(userId, args))
	);

	server.registerTool(
		'delete_entry',
		{
			title: 'Delete Entry',
			outputSchema: TOOL_OUTPUT.delete_entry,
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
			title: 'Get Goals',
			outputSchema: TOOL_OUTPUT.get_goals,
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
			title: 'Update Goals',
			description: 'Set or update daily nutrition goals.',
			inputSchema: describeShape(goalsSchema.shape, {
				calorieGoal: 'Daily calorie goal',
				proteinGoal: 'Daily protein goal in grams',
				carbGoal: 'Daily carbohydrate goal in grams',
				fatGoal: 'Daily fat goal in grams',
				fiberGoal: 'Daily fiber goal in grams',
				sodiumGoal: 'Daily sodium goal in mg (null to clear)',
				sugarGoal: 'Daily sugar goal in grams (null to clear)'
			}),
			annotations: UPDATE
		},
		safe((args) => handleUpdateGoals(userId, args))
	);

	server.registerTool(
		'list_recipes',
		{
			title: 'List Recipes',
			description: "List all recipes in the user's database with total macros per serving.",
			inputSchema: {},
			annotations: READ_ONLY
		},
		safe(() => handleListRecipes(userId))
	);

	server.registerTool(
		'get_recipe',
		{
			title: 'Get Recipe',
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
			title: 'Get Food',
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
			title: 'List Favorites',
			description: "List the user's favorite foods and recipes, sorted by most frequently logged.",
			inputSchema: {},
			annotations: READ_ONLY
		},
		safe(() => handleListFavorites(userId))
	);

	server.registerTool(
		'log_weight',
		{
			title: 'Log Weight',
			description: 'Log a body weight measurement.',
			inputSchema: {
				weightKg: weightCreateSchema.shape.weightKg.describe('Weight in kilograms'),
				date: weightCreateSchema.shape.entryDate
					.optional()
					.describe('Date in YYYY-MM-DD format. Defaults to today.'),
				notes: weightCreateSchema.shape.notes.describe('Optional notes')
			},
			annotations: WRITE
		},
		safe((args) => handleLogWeight(userId, args))
	);

	server.registerTool(
		'get_weight',
		{
			title: 'Get Weight',
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
			title: 'Get Weekly Stats',
			outputSchema: TOOL_OUTPUT.get_weekly_stats,
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
			title: 'Get Monthly Stats',
			outputSchema: TOOL_OUTPUT.get_monthly_stats,
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
			title: 'Copy Entries',
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
			title: 'Find Food By Barcode',
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
			title: 'Search Open Food Facts',
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
			title: 'Update Food',
			description:
				'Update an existing food item in the database. Supports extended nutrients (vitamins, minerals, etc.).',
			inputSchema: {
				foodId: z.string().uuid().describe('The food ID to update'),
				...describeShape(foodUpdateSchema.shape, FOOD_FIELD_DOCS)
			},
			annotations: UPDATE
		},
		safe(({ foodId, ...rest }) => handleUpdateFood(userId, { foodId, ...rest }))
	);

	server.registerTool(
		'delete_food',
		{
			title: 'Delete Food',
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
			title: 'List Recent Foods',
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
			title: 'Update Recipe',
			description:
				'Update an existing recipe. Can change name, servings, or replace all ingredients.',
			inputSchema: {
				recipeId: z.string().uuid().describe('The recipe ID to update'),
				...describeShape(recipeUpdateSchema.shape, RECIPE_FIELD_DOCS)
			},
			annotations: UPDATE
		},
		safe(({ recipeId, ...rest }) => handleUpdateRecipe(userId, { recipeId, ...rest }))
	);

	server.registerTool(
		'delete_recipe',
		{
			title: 'Delete Recipe',
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
			title: 'Create Supplement',
			description:
				"Create a new supplement with schedule and ingredients. Each ingredient needs a backing food (kind='supplement') that carries its nutrient data. Pass `foodId` to reuse an existing backing food, or `food: { name, nutrients... }` to create one inline.",
			inputSchema: {
				name: z.string().describe('Supplement name'),
				scheduleType: z.enum(scheduleTypeValues).describe('Schedule type'),
				scheduleDays: z
					.array(z.number().int().min(0).max(6))
					.optional()
					.describe('Days of week (0=Sun..6=Sat) for weekly/specific_days'),
				scheduleStartDate: z.string().optional().describe('Start date in YYYY-MM-DD format'),
				timeOfDay: z
					.enum(['morning', 'noon', 'evening'])
					.optional()
					.describe('Preferred time of day'),
				reminderTimes: z
					.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
					.max(6)
					.optional()
					.describe(
						'Local wall-clock reminder times as HH:MM (24h), e.g. ["08:00", "20:00"]. Max 6. The mobile apps schedule local notifications from these; the web app never notifies.'
					),
				ingredients: z
					.array(supplementIngredientInputSchema)
					.min(1)
					.max(50)
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
			title: 'List Supplements',
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
			title: 'Update Supplement',
			description: 'Update an existing supplement.',
			inputSchema: {
				supplementId: z.string().describe('The supplement ID to update'),
				name: z.string().optional().describe('New name'),
				scheduleType: z.enum(scheduleTypeValues).optional().describe('New schedule type'),
				scheduleDays: z
					.array(z.number().int().min(0).max(6))
					.optional()
					.describe('New days of week'),
				scheduleStartDate: z.string().optional().describe('New start date'),
				timeOfDay: z
					.enum(['morning', 'noon', 'evening'])
					.optional()
					.nullable()
					.describe('New time of day'),
				reminderTimes: z
					.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
					.max(6)
					.optional()
					.nullable()
					.describe(
						'New local wall-clock reminder times as HH:MM (24h), e.g. ["08:00", "20:00"]. Max 6. Replaces all existing times; the web app never notifies.'
					),
				isActive: z.boolean().optional().describe('Active status'),
				ingredients: z
					.array(supplementIngredientInputSchema)
					.min(1)
					.max(50)
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
			title: 'Delete Supplement',
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
			title: 'Unlog Supplement',
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
			title: 'Update Weight',
			description: 'Update an existing weight entry.',
			inputSchema: {
				weightId: z.string().uuid().describe('The weight entry ID to update'),
				...describeShape(weightUpdateSchema.shape, {
					weightKg: 'New weight in kilograms',
					entryDate: 'New date in YYYY-MM-DD format',
					notes: 'New notes'
				})
			},
			annotations: UPDATE
		},
		safe(({ weightId, ...rest }) => handleUpdateWeight(userId, { weightId, ...rest }))
	);

	server.registerTool(
		'delete_weight',
		{
			title: 'Delete Weight',
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
			title: 'Log Sleep',
			description: 'Log a sleep entry. Records duration and quality for a given date.',
			inputSchema: {
				durationMinutes: sleepCreateSchema.shape.durationMinutes.describe(
					'Total sleep duration in minutes'
				),
				quality: sleepCreateSchema.shape.quality.describe(
					'Sleep quality rating from 1 (poor) to 10 (great)'
				),
				date: sleepCreateSchema.shape.entryDate
					.optional()
					.describe('Date in YYYY-MM-DD format. Defaults to today.'),
				bedtime: sleepCreateSchema.shape.bedtime.describe('Bedtime as ISO datetime string'),
				wakeTime: sleepCreateSchema.shape.wakeTime.describe('Wake time as ISO datetime string'),
				wakeUps: sleepCreateSchema.shape.wakeUps.describe(
					'Number of times woken up during the night'
				),
				notes: sleepCreateSchema.shape.notes.describe('Optional notes')
			},
			annotations: WRITE
		},
		safe((args) => handleLogSleep(userId, args))
	);

	server.registerTool(
		'get_sleep',
		{
			title: 'Get Sleep',
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
			title: 'Update Sleep',
			description: 'Update an existing sleep entry.',
			inputSchema: {
				id: z.string().uuid().describe('Sleep entry ID to update'),
				...describeShape(sleepUpdateSchema.shape, {
					durationMinutes: 'New total sleep duration in minutes',
					quality: 'New sleep quality rating from 1 (poor) to 10 (great)',
					entryDate: 'New date in YYYY-MM-DD format',
					bedtime: 'New bedtime as ISO datetime string (null to clear)',
					wakeTime: 'New wake time as ISO datetime string (null to clear)',
					wakeUps: 'New number of wake-ups (null to clear)',
					notes: 'New notes (null to clear)'
				})
			},
			annotations: UPDATE
		},
		safe((args) => handleUpdateSleep(userId, args))
	);

	server.registerTool(
		'delete_sleep',
		{
			title: 'Delete Sleep',
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
			title: 'Get Daily Breakdown',
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
			title: 'Get Meal Breakdown',
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
			title: 'Get Top Foods',
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
			title: 'Get Streaks',
			outputSchema: TOOL_OUTPUT.get_streaks,
			description: 'Get current and longest logging streaks (consecutive days with entries).',
			inputSchema: {},
			annotations: READ_ONLY
		},
		safe(() => handleGetStreaks(userId))
	);

	server.registerTool(
		'get_maintenance_calories',
		{
			title: 'Get Maintenance Calories',
			description:
				'Estimate maintenance calories (TDEE) from the weight trend and logged intake over a date range. Needs at least two weight entries and some food entries in the range; 4+ weeks of consistent logging gives a usable estimate. Defaults to the last 28 days.',
			inputSchema: {
				startDate: z
					.string()
					.optional()
					.describe('Start date in YYYY-MM-DD format. Defaults to 27 days before endDate.'),
				endDate: z
					.string()
					.optional()
					.describe('End date in YYYY-MM-DD format. Defaults to today.'),
				muscleRatio: z
					.number()
					.min(0)
					.max(1)
					.optional()
					.describe(
						'Share of the weight change assumed to be lean mass (0-1). Defaults to the app-wide assumption.'
					)
			},
			outputSchema: TOOL_OUTPUT.get_maintenance_calories,
			annotations: READ_ONLY
		},
		safe((args) => handleGetMaintenanceCalories(userId, args))
	);

	// Analytics tools
	server.registerTool(
		'get_food_diversity',
		{
			title: 'Get Food Diversity',
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
			title: 'Get Meal Timing',
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
			title: 'Get Sleep Food Correlation',
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
			title: 'Get Weight Food Series',
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
			title: 'Get Extended Nutrients',
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
			title: 'Get Daily Nutrients',
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
			title: 'List Meal Types',
			outputSchema: TOOL_OUTPUT.list_meal_types,
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
			title: 'Get Supplement History',
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
			title: 'Get Day Properties',
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
			title: 'Set Day Properties',
			description: 'Set properties for a specific day, such as marking it as a fasting day.',
			inputSchema: describeShape(dayPropertiesSetSchema.shape, {
				date: 'Date in YYYY-MM-DD format',
				isFastingDay: 'Whether the day is a fasting day'
			}),
			annotations: UPDATE
		},
		safe((args) => handleSetDayProperties(userId, args))
	);

	server.registerTool(
		'delete_day_properties',
		{
			title: 'Delete Day Properties',
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
			title: 'Get Calendar Stats',
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

	// AI task queue
	server.registerTool(
		'list_ai_tasks',
		{
			title: 'List AI Tasks',
			description:
				"Meal-logging tasks the user queued for you to process. Workflow for each pending task: call get_ai_task (includes the meal photo if present) → identify each food/drink and estimate quantities → use search_foods to match items against the user's food database → log entries with log_food using the task's date and mealType (foodId + servings for matched foods; quickName/quickCalories/quickProtein/quickCarbs/quickFat/quickFiber for unmatched estimates; create_food first if the user will likely eat the item again) → finish with complete_ai_task, passing the created entry IDs and a short summary. Always close out every task you pick up: if you cannot log one, call dismiss_ai_task with a reason. Both outcomes show your text to the user in their AI Tasks list, and a dismissal also raises a notification, so never resolve a task silently.",
			inputSchema: {
				status: z
					.enum(aiTaskStatusValues)
					.optional()
					.describe('Filter by status. Defaults to pending.'),
				limit: z
					.number()
					.int()
					.min(1)
					.max(200)
					.optional()
					.describe('Max results to return. Defaults to 100.'),
				offset: z
					.number()
					.int()
					.min(0)
					.optional()
					.describe('Number of results to skip for pagination.')
			},
			annotations: READ_ONLY
		},
		safe((args) => handleListAiTasks(userId, args))
	);

	server.registerTool(
		'get_ai_task',
		{
			title: 'Get AI Task',
			description:
				'Get full details for a specific AI task, including the meal photo as an image when present.',
			inputSchema: {
				id: z.string().describe('ID of the AI task')
			},
			annotations: READ_ONLY
		},
		({ id }) => handleGetAiTask(userId, id)
	);

	server.registerTool(
		'complete_ai_task',
		{
			title: 'Complete AI Task',
			description:
				"Mark an AI task as completed after logging its food entries with log_food. Pass the created entry IDs so the task's history links back to the diary.",
			inputSchema: {
				id: z.string().uuid().describe('ID of the AI task to complete'),
				resultSummary: z
					.string()
					.min(1)
					.describe(
						'Short summary of what you logged, written for the user to read. Shown to them verbatim in their AI Tasks list, so address them directly and name the foods and amounts you entered.'
					),
				entryIds: z
					.array(z.string())
					.optional()
					.describe('IDs of the food entries created for this task')
			},
			annotations: UPDATE
		},
		safe((args) => handleCompleteAiTask(userId, args))
	);

	server.registerTool(
		'dismiss_ai_task',
		{
			title: 'Dismiss AI Task',
			description:
				'Dismiss an AI task without logging any entries, e.g. if it is a duplicate or not actionable. The user is notified of every dismissal, so a reason is required.',
			inputSchema: {
				id: z.string().uuid().describe('ID of the AI task to dismiss'),
				reason: z
					.string()
					.min(1)
					.describe(
						'Why you could not log this task, written for the user to read. They are notified with this text and it stays on the task in their AI Tasks list, so address them directly and say what you would need in order to log it.'
					)
			},
			annotations: UPDATE
		},
		safe((args) => handleDismissAiTask(userId, args))
	);

	registerPrompts(server);

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
