import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
	handleCreateFood,
	handleCreateRecipe,
	handleGetDailyStatus,
	handleLogFood,
	handleSearchFoods,
	handleGetSupplementStatus,
	handleLogSupplement
} from './handlers';

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

	server.registerTool(
		'get_daily_status',
		{
			description:
				"Get today's nutrition status including total calories, protein, carbs, fat, fiber consumed and daily goals.",
			inputSchema: {
				date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.')
			}
		},
		async ({ date }) => {
			const result = await handleGetDailyStatus(userId, date);
			return asText(result);
		}
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
		async ({ query }) => {
			const result = await handleSearchFoods(userId, query);
			return asText(result);
		}
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
		async (args) => {
			const result = await handleCreateFood(userId, args);
			return asText(result);
		}
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
		async (args) => {
			const result = await handleCreateRecipe(userId, args);
			return asText(result);
		}
	);

	server.registerTool(
		'log_food',
		{
			description:
				"Log a food entry to the user's daily diary. Specify either a foodId or recipeId.",
			inputSchema: {
				foodId: z.string().optional().describe('Food ID to log'),
				recipeId: z.string().optional().describe('Recipe ID to log'),
				mealType: z.string().describe('Meal type (e.g., "breakfast", "lunch", "dinner", "snack")'),
				servings: z.number().describe('Number of servings'),
				notes: z.string().optional().describe('Optional notes for the entry'),
				date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.')
			}
		},
		async (args) => {
			const result = await handleLogFood(userId, { ...args, date: args.date ?? undefined });
			return asText(result);
		}
	);

	server.registerTool(
		'get_supplement_status',
		{
			description:
				"Get today's supplement checklist showing which supplements are due and whether they've been taken.",
			inputSchema: {}
		},
		async () => {
			const result = await handleGetSupplementStatus(userId);
			return asText(result);
		}
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
		async (args) => {
			const result = await handleLogSupplement(userId, args);
			return asText(result);
		}
	);

	return server;
}
