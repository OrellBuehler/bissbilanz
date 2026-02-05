import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	handleCreateFood,
	handleCreateRecipe,
	handleGetDailyStatus,
	handleLogFood,
	handleSearchFoods
} from '$lib/server/mcp/handlers';
import {
	createFoodInput,
	createRecipeInput,
	logFoodInput,
	searchFoodsInput,
	toolNames
} from '$lib/server/mcp/tools';

type ToolRequest = {
	tool: string;
	args?: Record<string, unknown>;
};

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	return json({
		name: 'bissbilanz',
		version: '0.1.0',
		tools: toolNames
	});
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const body = (await request.json()) as ToolRequest;

	try {
		switch (body.tool) {
			case 'get-daily-status': {
				const result = await handleGetDailyStatus(userId);
				return json({ result });
			}
			case 'search-foods': {
				const parsed = searchFoodsInput.parse(body.args);
				const result = await handleSearchFoods(userId, parsed.query);
				return json({ result });
			}
			case 'create-food': {
				const parsed = createFoodInput.parse(body.args);
				const result = await handleCreateFood(userId, parsed);
				return json({ result });
			}
			case 'create-recipe': {
				const parsed = createRecipeInput.parse(body.args);
				const result = await handleCreateRecipe(userId, parsed);
				return json({ result });
			}
			case 'log-food': {
				const parsed = logFoodInput.parse(body.args);
				const result = await handleLogFood(userId, { ...parsed, date: parsed.date ?? undefined });
				return json({ result });
			}
			default:
				return json({ error: `Unknown tool: ${body.tool}` }, { status: 400 });
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: message }, { status: 400 });
	}
};
