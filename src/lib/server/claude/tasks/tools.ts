import type Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDB } from '../../db';
import { createEntry, eatenAtOnDate, validateMealType } from '../../entries';
import { ApiError, isZodError, McpUserError } from '../../errors';
import { findFoodByBarcode, getFood } from '../../foods';
import {
	FDC_SOURCE_NAME,
	NutrientDatabaseError,
	compareWithRecord,
	fdcServingScale,
	getFdcFood,
	scaleFdcNutrients,
	searchFdcFoods
} from '../../fooddata-central';
import { getRecipe } from '../../recipes';
import {
	handleCreateFood,
	handleFindFoodByBarcode,
	handleGetRecipe,
	handleListRecipes,
	handleSearchFoods,
	handleSearchOpenFoodFacts
} from '../../mcp/handlers';
import { ALL_NUTRIENTS } from '$lib/nutrients';
import { servingUnitValues } from '$lib/units';
import { entryCreateSchema, foodCreateSchema } from '../../validation';
import { ClaudeAbortedError, LeaseLostError } from '../errors';
import { addOpenFoodFactsDetail } from './off-detail';
import { completeByModel, dismissByModel, type OutcomeContext } from './outcomes';
import { ledgerGetOrCreate, loadRun, transitionFenced, withFence } from './runs';
import { recordTaskFoods } from './task-scope';
import type { Fence, Proposal, ProposalItem, TaskMode, TaskOutcome } from './types';

export const TOOL_RESULT_MAX_CHARS = 8000;

type JsonType = 'string' | 'number' | 'integer';
export const nullable = (type: JsonType, description: string) => ({
	anyOf: [{ type }, { type: 'null' }],
	description
});
export const text = (description: string) => ({ type: 'string', description });

export const strictTool = (
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

const createFoodDescription = (sources: string, extra: string) =>
	`Create a new food in the user's food database, with nutrition per serving. Use it when nothing in the user's own foods fits, the user will likely eat the item again, and you have real nutrition data: ${sources}. Pass barcode whenever one is visible. Returns foodId, which log_food accepts. In REVIEW mode the food is created only if the user accepts the logged item.${extra}`;

const CREATE_FOOD_DESCRIPTION = createFoodDescription(
	'a label photo, Open Food Facts or a web page',
	''
);

const CREATE_FOOD_WITH_DATABASE_DESCRIPTION = createFoodDescription(
	'a label photo, Open Food Facts, a nutrient database record or a web page',
	' With fdcId from search_nutrient_database in this task and a serving by weight, the server compares your calories and macros with that record scaled to the serving, refuses a large difference, and otherwise fills every nutrient you did not list.'
);

export const NUTRIENT_KEYS = ALL_NUTRIENTS.map((n) => n.key);
export const NUTRIENT_LIST = ALL_NUTRIENTS.map((n) => `${n.key} (${n.unit})`).join(', ');

const createFoodTool = (nutrientDatabase: boolean) =>
	strictTool(
		'create_food',
		nutrientDatabase ? CREATE_FOOD_WITH_DATABASE_DESCRIPTION : CREATE_FOOD_DESCRIPTION,
		{
			name: text('Food name'),
			brand: nullable('string', 'Brand name'),
			servingSize: { type: 'number', description: 'Serving size amount, greater than 0' },
			servingUnit: {
				type: 'string',
				enum: [...servingUnitValues],
				description: 'Unit of the serving size'
			},
			calories: { type: 'number', description: 'Calories per serving' },
			protein: { type: 'number', description: 'Protein in grams per serving' },
			carbs: { type: 'number', description: 'Carbohydrates in grams per serving' },
			fat: { type: 'number', description: 'Fat in grams per serving' },
			fiber: { type: 'number', description: 'Fiber in grams per serving' },
			nutrients: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						nutrient: { type: 'string', enum: NUTRIENT_KEYS },
						amount: { type: 'number' }
					},
					required: ['nutrient', 'amount'],
					additionalProperties: false
				},
				description: `Nutrients read from a label, Open Food Facts or a web page, per serving, in the unit shown: ${NUTRIENT_LIST}. Never from memory.${nutrientDatabase ? ' They win over the fdcId record.' : ''} Empty array when none.`
			},
			...(nutrientDatabase
				? {
						fdcId: {
							type: 'integer',
							description:
								'fdcId of the search_nutrient_database result in this task that describes this food, or 0 when no record applies. Only for a servingUnit of g, kg, oz or lb.'
						}
					}
				: {}),
			barcode: nullable('string', 'Barcode digits, when visible'),
			ingredientsText: text('Full ingredients text, or an empty string when unknown')
		}
	);

const nutrientDatabaseTool = strictTool(
	'search_nutrient_database',
	'Search the USDA FoodData Central nutrient database for generic and whole foods and plain packaged foods (produce, meat, fish, eggs, grains, nuts, milk, juice), raw or cooked. Returns candidate records with fdcId, energy and macros per 100 g, and how many nutrients each record covers. Pass the fdcId of the record that matches the food, its preparation and any salt or enrichment, to create_food.',
	{ query: text('Food name in English, for example "pear raw" or "chicken breast roasted"') }
);

export const toolDefinitions = (nutrientDatabase: boolean): Anthropic.Tool[] => [
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
		"Look up a barcode in the user's foods, then in Open Food Facts. Open Food Facts products are not saved: create them with create_food using the returned values when the user will likely eat them again, otherwise log a quick entry.",
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
	...(nutrientDatabase ? [nutrientDatabaseTool] : []),
	createFoodTool(nutrientDatabase),
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

export const withCacheBreakpoint = (tools: Anthropic.Tool[]): Anthropic.Tool[] =>
	tools.map((tool, index) =>
		index === tools.length - 1 ? { ...tool, cache_control: { type: 'ephemeral' } } : tool
	);

const TOOLS_WITH_DATABASE = withCacheBreakpoint(toolDefinitions(true));
const TOOLS_WITHOUT_DATABASE = withCacheBreakpoint(toolDefinitions(false));

export const taskTools = (nutrientDatabase: boolean): Anthropic.Tool[] =>
	nutrientDatabase ? TOOLS_WITH_DATABASE : TOOLS_WITHOUT_DATABASE;

export const optionalNumber = z.number().nonnegative().nullish();

export const inputSchemas = {
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
	search_nutrient_database: z.object({ query: z.string().trim().min(1).max(200) }),
	create_food: z.object({
		name: z.string(),
		brand: z.string().nullish(),
		servingSize: z.number(),
		servingUnit: z.string(),
		calories: z.number(),
		protein: z.number(),
		carbs: z.number(),
		fat: z.number(),
		fiber: z.number(),
		nutrients: z
			.array(
				z.object({ nutrient: z.enum(NUTRIENT_KEYS as [string, ...string[]]), amount: z.number() })
			)
			.default([]),
		// 0 means no record: a required integer keeps the strict schema free of a
		// union type (see the complexity limits in tool-limits.test.ts).
		fdcId: z.number().int().nonnegative().nullish(),
		barcode: z.string().nullish(),
		ingredientsText: z.string().default('')
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
	foods: Map<string, ProvisionalFood>;
	createdFoods: Map<string, FoodToolResult>;
	nutrientRecords: Set<number>;
	signal?: AbortSignal;
	// What create_food tells the model about a food it only stages (REVIEW mode,
	// corrections). Defaults to the REVIEW wording.
	provisionalNote?: string;
};

type ProvisionalFood = Record<string, unknown>;
type FoodToolResult = Record<string, unknown>;

export type ToolResult = { content: string; isError: boolean; outcome?: TaskOutcome };

export const isTerminalTool = (name: string) =>
	name === 'complete_ai_task' || name === 'dismiss_ai_task';

export class ToolInputError extends Error {
	constructor(
		message: string,
		readonly details: Record<string, unknown> = {}
	) {
		super(message);
	}
}

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
		trimmed.hint =
			'Not saved. If the user will likely eat it again, save it with create_food using these per-serving values and the barcode; otherwise log a quick entry.';
	}
	return trimmed;
};

export const perServing = (value: unknown, servings: number) =>
	servings > 0 ? Math.round((Number(value ?? 0) / servings) * 100) / 100 : 0;

export const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const DEFAULT_MEAL_TIME: Record<string, string> = {
	Breakfast: '08:00',
	Lunch: '12:30',
	Dinner: '19:00',
	Snacks: '15:30'
};

export const instantToIso = async (expression: ReturnType<typeof sql>): Promise<string> => {
	const rows = await getDB().execute(sql`SELECT (extract(epoch FROM ${expression}) * 1000) AS ms`);
	return new Date(Number((rows as unknown as { ms: string }[])[0]!.ms)).toISOString();
};

export async function resolveEatenAt(
	ctx: Pick<TaskToolContext, 'task' | 'timeZone'>,
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

const FOOD_RESULT_FIELDS = [
	'name',
	'brand',
	'servingSize',
	'servingUnit',
	'calories',
	'protein',
	'carbs',
	'fat',
	'fiber'
] as const;

type FoodCreateInput = z.infer<typeof foodCreateSchema>;

async function fillFromDatabase(
	data: FoodCreateInput,
	fdcId: number,
	explicit: Set<string>,
	ctx: TaskToolContext
): Promise<{ data: FoodCreateInput; source: Record<string, unknown> }> {
	if (!ctx.nutrientRecords.has(fdcId)) {
		throw new ToolInputError(
			`fdcId ${fdcId} did not come from search_nutrient_database in this task. Search first and pass one of its fdcIds, or pass 0.`
		);
	}
	const scale = fdcServingScale(data.servingSize, data.servingUnit);
	if (scale === null) {
		throw new ToolInputError(
			`A nutrient database record can only be applied to a serving given in g, kg, oz or lb, not ${data.servingUnit}. Nothing was created. Give the serving by weight, or pass fdcId 0.`
		);
	}
	const record = await getFdcFood(ctx.userId, fdcId, ctx.signal);
	const comparison = compareWithRecord(record, data, scale);
	if (!comparison.matches) {
		throw new ToolInputError(
			`Your ${comparison.mismatched.join(', ')} for ${data.servingSize} ${data.servingUnit} do not match record ${fdcId} "${record.description}" scaled to that serving. Nothing was created. If you took these numbers from the database, use recordPerServing instead. If they come from a label or Open Food Facts, keep them and pick another record or pass fdcId 0.`,
			{ recordPerServing: comparison.recordPerServing }
		);
	}
	const base = {
		database: FDC_SOURCE_NAME,
		fdcId,
		description: record.description,
		dataType: record.dataType
	};
	const filled = Object.fromEntries(
		Object.entries(scaleFdcNutrients(record, scale)).filter(([key]) => !explicit.has(key))
	);
	return {
		data: foodCreateSchema.parse({ ...data, ...filled }),
		source: {
			...base,
			filled: Object.keys(filled).length,
			...(explicit.size > 0 ? { keptYourValues: explicit.size } : {})
		}
	};
}

async function createFoodForTask(input: unknown, ctx: TaskToolContext): Promise<FoodToolResult> {
	const { nutrients, fdcId, ...fields } = inputSchemas.create_food.parse(input);
	const explicit = Object.fromEntries(nutrients.map(({ nutrient, amount }) => [nutrient, amount]));
	const parsed = foodCreateSchema.safeParse({
		...Object.fromEntries(
			Object.entries(fields).filter(([, value]) => value !== null && value !== '')
		),
		...explicit
	});
	if (!parsed.success) throw parsed.error;

	const hash = hashPayload({ ...parsed.data, fdcId: fdcId || null });
	const known = ctx.createdFoods.get(hash);
	if (known) return known;

	if (parsed.data.barcode) {
		const existing = await findFoodByBarcode(ctx.userId, parsed.data.barcode);
		if (existing) {
			throw new ToolInputError(
				`A food with barcode ${parsed.data.barcode} already exists: "${existing.name}" (foodId ${existing.id}). Log that foodId instead.`
			);
		}
	}

	const filled = fdcId
		? await fillFromDatabase(parsed.data, fdcId, new Set(Object.keys(explicit)), ctx)
		: null;
	const data = filled?.data ?? parsed.data;
	const nutrientSource = filled ? { nutrientSource: filled.source } : {};

	let result: FoodToolResult;
	if (ctx.mode === 'review') {
		const foodId = crypto.randomUUID();
		ctx.foods.set(foodId, data);
		result = {
			foodId,
			...pick(data, FOOD_RESULT_FIELDS),
			...nutrientSource,
			note:
				ctx.provisionalNote ??
				'Not saved yet: the food is created only if the user accepts the logged item. Pass this foodId to log_food.'
		};
	} else {
		await withFence(ctx.fence, async () => undefined);
		const created = asRecord(await handleCreateFood(ctx.userId, data));
		if (!created.success) {
			throw new ToolInputError(String(created.error ?? 'Could not create the food'));
		}
		await recordTaskFoods(getDB(), ctx.task.id, [String(created.foodId)]);
		await addOpenFoodFactsDetail(ctx.userId, [
			{ id: String(created.foodId), barcode: asRecord(created.food).barcode as string | null }
		]);
		result = {
			foodId: created.foodId,
			...pick(asRecord(created.food), FOOD_RESULT_FIELDS),
			...nutrientSource
		};
	}
	ctx.createdFoods.set(hash, result);
	return result;
}

export type LogInput = z.infer<(typeof inputSchemas)['log_food']>;

/** Validates a log_food call into the entry it would create, without writing anything. */
export async function prepareLog(input: LogInput, ctx: TaskToolContext) {
	const mealType = ctx.task.mealType ?? input.mealType;
	if (!mealType) throw new ToolInputError('mealType is required because the task has none');

	const provisional = input.foodId ? ctx.foods.get(input.foodId) : undefined;
	const food = provisional ?? (input.foodId ? await getFood(ctx.userId, input.foodId) : null);
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

	const normalizedPayload = { ...payloadWithoutTime, mealType: parsed.data.mealType };
	const name = input.quickName ?? String(food?.name ?? recipe?.name ?? 'entry');
	const eatenAt = await resolveEatenAt(ctx, parsed.data.mealType, input.eatenAt);
	const payload = { ...normalizedPayload, eatenAt };
	return { parsed, normalizedPayload, payload, name, eatenAt, food, recipe, provisional };
}

async function logFood(input: LogInput, ctx: TaskToolContext): Promise<unknown> {
	const { parsed, normalizedPayload, payload, name, eatenAt, food, recipe, provisional } =
		await prepareLog(input, ctx);

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
			entry: { ...parsed.data, eatenAt },
			...(provisional ? { food: provisional } : {})
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

	const hash = hashPayload(normalizedPayload);
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
		case 'search_nutrient_database': {
			const args = inputSchemas.search_nutrient_database.parse(input);
			const foods = await searchFdcFoods(ctx.userId, args.query, ctx.signal);
			for (const food of foods) ctx.nutrientRecords.add(food.fdcId);
			return {
				foods: foods.map((food) => ({
					fdcId: food.fdcId,
					description: food.description,
					dataType: food.dataType,
					per100g: food.per100g,
					nutrientCount: Object.keys(food.nutrients).length
				})),
				...(foods.length === 0
					? { note: 'No records. Try a shorter English name, or use another source.' }
					: {})
			};
		}
		case 'create_food':
			return createFoodForTask(input, ctx);
		case 'log_food':
			return logFood(inputSchemas.log_food.parse(input), ctx);
		default:
			throw new ToolInputError(`Unknown tool: ${name}`);
	}
}

export const truncate = (value: string) =>
	value.length > TOOL_RESULT_MAX_CHARS ? value.slice(0, TOOL_RESULT_MAX_CHARS) : value;

export const failure = (message: string, details: Record<string, unknown> = {}): ToolResult => ({
	content: truncate(JSON.stringify({ error: message, ...details })),
	isError: true
});

/**
 * The result the model sees for an error that is the model's to fix (bad input,
 * a refused value, a missing food). Anything else is rethrown.
 */
export function toolErrorResult(error: unknown, signal: AbortSignal | undefined): ToolResult {
	if (error instanceof LeaseLostError) throw error;
	if (signal?.aborted) throw new ClaudeAbortedError();
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
	if (error instanceof ToolInputError) return failure(error.message, error.details);
	if (error instanceof McpUserError || error instanceof NutrientDatabaseError) {
		return failure(error.message);
	}
	if (error instanceof ApiError && error.status < 500) return failure(error.message);
	throw error;
}

/** The read tools, create_food and log_food, without the terminal tools of a first run. */
export async function runSharedTool(
	name: string,
	input: unknown,
	ctx: TaskToolContext
): Promise<ToolResult> {
	try {
		return { content: truncate(JSON.stringify(await execute(name, input, ctx))), isError: false };
	} catch (error) {
		return toolErrorResult(error, ctx.signal);
	}
}

export async function runTaskTool(
	name: string,
	input: unknown,
	ctx: TaskToolContext
): Promise<ToolResult> {
	if (!isTerminalTool(name)) return runSharedTool(name, input, ctx);
	try {
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
	} catch (error) {
		return toolErrorResult(error, ctx.signal);
	}
}
