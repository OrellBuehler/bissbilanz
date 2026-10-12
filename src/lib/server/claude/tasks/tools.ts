import type Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDB } from '../../db';
import { createEntry, eatenAtOnDate, validateMealType } from '../../entries';
import { ApiError, isZodError, McpUserError } from '../../errors';
import { getFood } from '../../foods';
import { getRecipe } from '../../recipes';
import {
	handleFindFoodByBarcode,
	handleGetRecipe,
	handleListRecipes,
	handleSearchFoods,
	handleSearchOpenFoodFacts
} from '../../mcp/handlers';
import { entryCreateSchema } from '../../validation';
import { LeaseLostError } from '../errors';
import { completeByModel, dismissByModel, type OutcomeContext } from './outcomes';
import { ledgerGetOrCreate, loadRun, transitionFenced, withFence } from './runs';
import type { Fence, Proposal, ProposalItem, TaskMode, TaskOutcome } from './types';

export const TOOL_RESULT_MAX_CHARS = 8000;

type JsonType = 'string' | 'number' | 'integer';
const nullable = (type: JsonType, description: string) => ({
	type: [type, 'null'],
	description
});
const text = (description: string) => ({ type: 'string', description });

const strictTool = (
	name: string,
	description: string,
	properties: Record<string, unknown>
): Anthropic.Tool => ({
	name,
	description,
	strict: true,
	input_schema: {
		type: 'object',
		properties,
		required: Object.keys(properties),
		additionalProperties: false
	}
});

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
	strictTool(
		'search_foods',
		"Search the user's saved foods by name. Foods the user logged recently come first. Returns serving size and per-serving macros.",
		{
			query: text('Words from the food name'),
			limit: nullable('integer', 'Maximum number of results, at most 20. Default 10.')
		}
	),
	strictTool('list_recipes', "List the user's recipes whose name matches the query.", {
		query: text('Words from the recipe name, or an empty string for all recipes')
	}),
	strictTool(
		'get_recipe',
		'Get one recipe with totalServings, cookedWeight (grams of the finished dish, if known) and macros per serving.',
		{ recipeId: text('Recipe id from list_recipes') }
	),
	strictTool(
		'find_food_by_barcode',
		"Look up a barcode in the user's foods, then in Open Food Facts. Open Food Facts products are not saved: log them as quick entries with the returned per-serving values.",
		{ barcode: text('The barcode digits') }
	),
	strictTool(
		'search_openfoodfacts',
		"Search Open Food Facts for packaged products by name. Use only when nothing in the user's own foods fits.",
		{
			query: text('Product name words'),
			limit: nullable('integer', 'Maximum number of results, at most 5. Default 5.')
		}
	),
	strictTool(
		'log_food',
		"Log one food, recipe or quick entry for the meal. Give foodId or recipeId, or the quick values for a one-off estimate. servings is the number of servings of the food's own serving size. Quick values are per serving. Use null for anything that does not apply.",
		{
			foodId: nullable('string', 'Id of an existing food'),
			recipeId: nullable('string', 'Id of an existing recipe'),
			servings: { type: 'number', description: 'Number of servings, greater than 0' },
			mealType: nullable(
				'string',
				'Breakfast, Lunch, Dinner, Snacks or a custom meal type. Ignored when the task already has a meal type.'
			),
			eatenAt: nullable(
				'string',
				'ISO 8601 timestamp with UTC offset on the task date. Ignored when the task already has a time.'
			),
			quickName: nullable('string', 'Name for a quick entry'),
			quickCalories: nullable('number', 'Calories per serving of a quick entry'),
			quickProtein: nullable('number', 'Protein in grams per serving of a quick entry'),
			quickCarbs: nullable('number', 'Carbohydrates in grams per serving of a quick entry'),
			quickFat: nullable('number', 'Fat in grams per serving of a quick entry'),
			quickFiber: nullable('number', 'Fiber in grams per serving of a quick entry'),
			quantityDescription: nullable(
				'string',
				'Short human description of the amount, for example "1 bowl" or "150 g"'
			)
		}
	),
	strictTool(
		'complete_ai_task',
		'Finish the task after logging. Call it once, as the last tool call.',
		{ resultSummary: text('Short summary for the user naming the foods and amounts logged') }
	),
	strictTool(
		'dismiss_ai_task',
		'Give up on the task when nothing can be logged responsibly. Call it once, as the last tool call.',
		{ reason: text('Short reason for the user saying what would be needed') }
	)
];

export const TASK_TOOLS: Anthropic.Tool[] = TOOL_DEFINITIONS.map((tool, index) =>
	index === TOOL_DEFINITIONS.length - 1 ? { ...tool, cache_control: { type: 'ephemeral' } } : tool
);

const optionalNumber = z.number().nonnegative().nullish();

const inputSchemas = {
	search_foods: z.object({
		query: z.string().min(1).max(200),
		limit: z.number().int().min(1).nullish()
	}),
	list_recipes: z.object({ query: z.string().max(200) }),
	get_recipe: z.object({ recipeId: z.string().uuid() }),
	find_food_by_barcode: z.object({ barcode: z.string().min(1).max(64) }),
	search_openfoodfacts: z.object({
		query: z.string().min(1).max(200),
		limit: z.number().int().min(1).nullish()
	}),
	log_food: z.object({
		foodId: z.string().uuid().nullish(),
		recipeId: z.string().uuid().nullish(),
		servings: z.number().positive(),
		mealType: z.string().min(1).max(50).nullish(),
		eatenAt: z.string().max(64).nullish(),
		quickName: z.string().max(200).nullish(),
		quickCalories: optionalNumber,
		quickProtein: optionalNumber,
		quickCarbs: optionalNumber,
		quickFat: optionalNumber,
		quickFiber: optionalNumber,
		quantityDescription: z.string().max(200).nullish()
	}),
	complete_ai_task: z.object({ resultSummary: z.string().min(1).max(2000) }),
	dismiss_ai_task: z.object({ reason: z.string().min(1).max(2000) })
};

export type TaskToolContext = {
	userId: string;
	task: { id: string; date: string; mealType: string | null; eatenAt: Date | null };
	mode: TaskMode;
	timeZone: string;
	locale: string | null;
	fence: Fence;
	seen: Map<string, number>;
};

export type ToolResult = { content: string; isError: boolean; outcome?: TaskOutcome };

export const TERMINAL_TOOLS = ['complete_ai_task', 'dismiss_ai_task'];

class ToolInputError extends Error {}

const FOOD_FIELDS = [
	'id',
	'name',
	'brand',
	'servingSize',
	'servingUnit',
	'calories',
	'protein',
	'carbs',
	'fat',
	'fiber',
	'labels',
	'recentlyUsed'
] as const;

const pick = (source: Record<string, unknown>, fields: readonly string[]) =>
	Object.fromEntries(fields.filter((key) => key in source).map((key) => [key, source[key]]));

const BARCODE_OMIT = /image|ingredient|additives|categories|nutriScore|novaGroup/i;

const trimBarcodeResult = (result: Record<string, unknown>) => {
	const trimmed = Object.fromEntries(
		Object.entries(result).filter(([key, value]) => value !== null && !BARCODE_OMIT.test(key))
	);
	if (result.source === 'openfoodfacts') {
		trimmed.hint = 'Log it as a quick entry with these per-serving values.';
	}
	return trimmed;
};

const perServing = (value: unknown, servings: number) =>
	servings > 0 ? Math.round((Number(value ?? 0) / servings) * 100) / 100 : 0;

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const DEFAULT_MEAL_TIME: Record<string, string> = {
	Breakfast: '08:00',
	Lunch: '12:30',
	Dinner: '19:00',
	Snacks: '15:30'
};

const instantToIso = async (expression: ReturnType<typeof sql>): Promise<string> => {
	const rows = await getDB().execute(sql`SELECT (extract(epoch FROM ${expression}) * 1000) AS ms`);
	return new Date(Number((rows as unknown as { ms: string }[])[0]!.ms)).toISOString();
};

async function resolveEatenAt(
	ctx: TaskToolContext,
	mealType: string,
	value: string | null | undefined
): Promise<string> {
	if (ctx.task.eatenAt) return ctx.task.eatenAt.toISOString();
	if (value) {
		if (!z.string().datetime({ offset: true }).safeParse(value).success) {
			throw new ToolInputError('eatenAt must be an ISO 8601 timestamp with a UTC offset');
		}
		return instantToIso(
			eatenAtOnDate(sql`${value}::timestamptz`, ctx.task.date, ctx.timeZone) as ReturnType<
				typeof sql
			>
		);
	}
	const time = DEFAULT_MEAL_TIME[mealType] ?? '12:00';
	return instantToIso(sql`((${ctx.task.date}::date + ${time}::time) AT TIME ZONE ${ctx.timeZone})`);
}

const hashPayload = (payload: Record<string, unknown>) =>
	createHash('sha256')
		.update(JSON.stringify(canonical(payload)))
		.digest('hex');

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, inner]) => [key, canonical(inner)])
		);
	}
	return value;
}

async function logFood(
	input: z.infer<(typeof inputSchemas)['log_food']>,
	ctx: TaskToolContext
): Promise<unknown> {
	const mealType = ctx.task.mealType ?? input.mealType;
	if (!mealType) throw new ToolInputError('mealType is required because the task has none');

	const food = input.foodId ? await getFood(ctx.userId, input.foodId) : null;
	if (input.foodId && !food) throw new ToolInputError('Food not found');
	const recipe = input.recipeId ? await getRecipe(ctx.userId, input.recipeId) : null;
	if (input.recipeId && !recipe) throw new ToolInputError('Recipe not found');

	const payloadWithoutTime: Record<string, unknown> = {
		...(input.foodId ? { foodId: input.foodId } : {}),
		...(input.recipeId ? { recipeId: input.recipeId } : {}),
		mealType,
		servings: input.servings,
		date: ctx.task.date,
		...(input.quickName ? { quickName: input.quickName } : {}),
		...(input.quickCalories != null ? { quickCalories: input.quickCalories } : {}),
		...(input.quickProtein != null ? { quickProtein: input.quickProtein } : {}),
		...(input.quickCarbs != null ? { quickCarbs: input.quickCarbs } : {}),
		...(input.quickFat != null ? { quickFat: input.quickFat } : {}),
		...(input.quickFiber != null ? { quickFiber: input.quickFiber } : {})
	};
	const parsed = entryCreateSchema.safeParse(payloadWithoutTime);
	if (!parsed.success) throw parsed.error;
	if (!(await validateMealType(ctx.userId, parsed.data.mealType))) {
		throw new ToolInputError(`Invalid meal type: ${parsed.data.mealType}`);
	}

	const name = input.quickName ?? food?.name ?? recipe?.name ?? 'entry';
	const eatenAt = await resolveEatenAt(ctx, mealType, input.eatenAt);
	const payload = { ...payloadWithoutTime, eatenAt };

	if (ctx.mode === 'review') {
		const per = food ?? {
			calories: perServing(asRecord(recipe).calories, Number(asRecord(recipe).totalServings)),
			protein: perServing(asRecord(recipe).protein, Number(asRecord(recipe).totalServings)),
			carbs: perServing(asRecord(recipe).carbs, Number(asRecord(recipe).totalServings)),
			fat: perServing(asRecord(recipe).fat, Number(asRecord(recipe).totalServings)),
			fiber: perServing(asRecord(recipe).fiber, Number(asRecord(recipe).totalServings))
		};
		const macros = (field: 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber') => {
			const quick = {
				calories: input.quickCalories,
				protein: input.quickProtein,
				carbs: input.quickCarbs,
				fat: input.quickFat,
				fiber: input.quickFiber
			}[field];
			const base = input.foodId || input.recipeId ? Number(per[field] ?? 0) : Number(quick ?? 0);
			return Math.round(base * input.servings * 100) / 100;
		};
		const item: ProposalItem = {
			id: crypto.randomUUID(),
			name,
			quantityDescription: input.quantityDescription ?? null,
			foodId: input.foodId ?? null,
			recipeId: input.recipeId ?? null,
			servings: input.servings,
			calories: macros('calories'),
			protein: macros('protein'),
			carbs: macros('carbs'),
			fat: macros('fat'),
			fiber: macros('fiber'),
			entry: { ...parsed.data, eatenAt }
		};
		await withFence(ctx.fence, async (tx) => {
			const run = await loadRun(ctx.fence.taskId, tx);
			const proposal = (run?.proposal as Proposal | null) ?? { summary: null, items: [] };
			await transitionFenced(tx, ctx.fence, {
				proposal: { ...proposal, items: [...proposal.items, item] }
			});
		});
		return { proposalItemId: item.id };
	}

	const hash = hashPayload(payloadWithoutTime);
	const occurrence = ctx.seen.get(hash) ?? 0;
	const summary = input.quantityDescription
		? `${name} (${input.quantityDescription})`
		: `${input.servings} servings ${name}`;
	const result = await withFence(ctx.fence, async (tx) => {
		const { entryId, created } = await ledgerGetOrCreate(
			tx,
			ctx.fence,
			`log:${hash}:${occurrence}`,
			summary
		);
		if (!created) return { entryId, alreadyLogged: true };
		const entry = await createEntry(ctx.userId, payload, null, { id: entryId, tx });
		if (!entry.success) throw entry.error;
		return { entryId };
	});
	ctx.seen.set(hash, occurrence + 1);
	return result;
}

async function execute(name: string, input: unknown, ctx: TaskToolContext): Promise<unknown> {
	switch (name) {
		case 'search_foods': {
			const args = inputSchemas.search_foods.parse(input);
			const result = asRecord(
				await handleSearchFoods(ctx.userId, args.query, Math.min(args.limit ?? 10, 20))
			);
			const foods = (result.foods as Record<string, unknown>[] | undefined) ?? [];
			return { foods: foods.map((food) => pick(food, FOOD_FIELDS)) };
		}
		case 'list_recipes': {
			const args = inputSchemas.list_recipes.parse(input);
			const result = asRecord(
				await handleListRecipes(ctx.userId, { query: args.query || undefined })
			);
			const recipes = (result.recipes as Record<string, unknown>[] | undefined) ?? [];
			return {
				recipes: recipes
					.slice(0, 20)
					.map((recipe) => pick(recipe, ['id', 'name', 'totalServings', 'cookedWeight']))
			};
		}
		case 'get_recipe': {
			const args = inputSchemas.get_recipe.parse(input);
			const recipe = asRecord(await handleGetRecipe(ctx.userId, args.recipeId));
			if (recipe.error) return { error: recipe.error };
			const servings = Number(recipe.totalServings);
			return {
				...pick(recipe, ['id', 'name', 'totalServings', 'cookedWeight']),
				caloriesPerServing: perServing(recipe.calories, servings),
				proteinPerServing: perServing(recipe.protein, servings),
				carbsPerServing: perServing(recipe.carbs, servings),
				fatPerServing: perServing(recipe.fat, servings),
				fiberPerServing: perServing(recipe.fiber, servings)
			};
		}
		case 'find_food_by_barcode': {
			const args = inputSchemas.find_food_by_barcode.parse(input);
			return trimBarcodeResult(asRecord(await handleFindFoodByBarcode(ctx.userId, args.barcode)));
		}
		case 'search_openfoodfacts': {
			const args = inputSchemas.search_openfoodfacts.parse(input);
			const result = asRecord(
				await handleSearchOpenFoodFacts(args.query, Math.min(args.limit ?? 5, 5))
			);
			const products = (result.products as Record<string, unknown>[] | undefined) ?? [];
			return { products: products.map(trimBarcodeResult) };
		}
		case 'log_food':
			return logFood(inputSchemas.log_food.parse(input), ctx);
		default:
			throw new ToolInputError(`Unknown tool: ${name}`);
	}
}

const truncate = (value: string) =>
	value.length > TOOL_RESULT_MAX_CHARS ? value.slice(0, TOOL_RESULT_MAX_CHARS) : value;

const failure = (message: string): ToolResult => ({
	content: truncate(JSON.stringify({ error: message })),
	isError: true
});

export async function runTaskTool(
	name: string,
	input: unknown,
	ctx: TaskToolContext
): Promise<ToolResult> {
	try {
		if (name === 'complete_ai_task' || name === 'dismiss_ai_task') {
			const outcomeCtx: OutcomeContext = {
				fence: ctx.fence,
				userId: ctx.userId,
				taskId: ctx.task.id,
				locale: ctx.locale
			};
			const outcome =
				name === 'complete_ai_task'
					? await completeByModel(
							outcomeCtx,
							ctx.mode,
							inputSchemas.complete_ai_task.parse(input).resultSummary
						)
					: await dismissByModel(outcomeCtx, inputSchemas.dismiss_ai_task.parse(input).reason);
			return { content: JSON.stringify({ success: true }), isError: false, outcome };
		}
		return { content: truncate(JSON.stringify(await execute(name, input, ctx))), isError: false };
	} catch (error) {
		if (error instanceof LeaseLostError) throw error;
		if (isZodError(error)) {
			return {
				content: truncate(
					JSON.stringify({
						error: 'validation_failed',
						issues: error.issues.map((issue) => ({
							path: issue.path.join('.'),
							message: issue.message
						}))
					})
				),
				isError: true
			};
		}
		if (error instanceof ToolInputError || error instanceof McpUserError) {
			return failure(error.message);
		}
		if (error instanceof ApiError && error.status < 500) return failure(error.message);
		throw error;
	}
}
