import type Anthropic from '@anthropic-ai/sdk';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDB } from '../../db';
import { createEntry, deleteEntry, updateEntry, validateMealType } from '../../entries';
import { ApiError, isZodError } from '../../errors';
import { createFood, findFoodByBarcode, getFood, updateFood } from '../../foods';
import type { TxOrDb } from '../../ownership';
import { getRecipe } from '../../recipes';
import { aiTasks, foodEntries, type ClaudeTaskMessageOutcome } from '../../schema';
import { entryCreateSchema, foodCreateSchema, foodUpdateSchema } from '../../validation';
import { ALL_NUTRIENT_KEYS } from '$lib/nutrients';
import { normalizeMealType } from '$lib/utils/meals';
import { servingUnitValues } from '$lib/units';
import { addAssistantMessage, transitionCorrection } from './corrections';
import type { LoopToolResult } from './loop';
import { addOpenFoodFactsDetail, type CreatedFood } from './off-detail';
import { offsetString } from './prompt';
import { withFence } from './runs';
import {
	isFoodUsedOutsideTask,
	listTaskEntries,
	listTaskFoodIds,
	recordTaskFoods,
	type ScopedTask
} from './task-scope';
import {
	NUTRIENT_KEYS,
	NUTRIENT_LIST,
	ToolInputError,
	createFoodKey,
	asRecord,
	failure,
	inputSchemas,
	nullable,
	optionalNumber,
	perServing,
	prepareLog,
	resolveEatenAt,
	runSharedTool,
	strictTool,
	text,
	toolDefinitions,
	toolErrorResult,
	withCacheBreakpoint,
	type TaskToolContext
} from './tools';

export const MAX_ENTRY_CHANGES_PER_CORRECTION = 30;
export const STATE_MAX_CHARS = 24_000;

const SHARED_TOOLS = [
	'search_foods',
	'list_recipes',
	'get_recipe',
	'find_food_by_barcode',
	'search_openfoodfacts',
	'search_nutrient_database',
	'create_food'
];

export const ENTRY_TOOLS = new Set(['update_entry', 'delete_entry', 'log_food']);

export const isCorrectionTerminal = (name: string) => name === 'reply_to_user';

const STAGED_FOOD_NOTE =
	'Not saved yet: the food is created when reply_to_user saves your changes, and only if an entry uses it. Pass this foodId to update_entry or log_food.';

const NOT_IN_TASK =
	'Not an entry of this meal. Only the entries get_task_entries lists can be changed; entries of other meals belong to the user.';

const NOT_TASK_FOOD =
	"This food was not created for this meal, so it cannot be changed: it is the user's own and may be logged elsewhere. Switch the entry to a better existing food, or create a corrected food with create_food and switch the entry to it.";

const SHARED_FOOD =
	"This food was created for this meal, but it is now also logged outside this meal or used in a recipe or supplement, so it is the user's like any other food and changing it would rewrite those too. Create a corrected food with create_food and switch this meal's entries to it.";

// Non-strict on purpose: the strict grammar has a request-wide budget of 16
// parameters with union types (see tool-limits.test.ts), and these tools need
// a nullable value per field. Their input is validated by the schemas below.
const looseTool = (
	name: string,
	description: string,
	properties: Record<string, unknown>
): Anthropic.Tool => {
	const { strict: _strict, ...tool } = strictTool(name, description, properties);
	return tool;
};

const createFoodDescription = (nutrientDatabase: boolean) =>
	`Create a new food in the user's food database, with nutrition per serving, when an entry of this meal needs a food the user does not have, for example a different product or a corrected copy of a food you may not change. You need real nutrition data: a label photo, Open Food Facts${nutrientDatabase ? ', a nutrient database record' : ''} or a web page. Pass barcode whenever one is visible. Returns a foodId for update_entry and log_food; the food is saved only when reply_to_user saves your changes.${nutrientDatabase ? ' With fdcId from search_nutrient_database and a serving by weight, the server compares your calories and macros with that record, refuses a large difference, and fills every nutrient you did not list.' : ''}`;

const correctionToolDefinitions = (nutrientDatabase: boolean): Anthropic.Tool[] => {
	const shared = toolDefinitions(nutrientDatabase);
	const named = (name: string) => shared.find((tool) => tool.name === name);
	const reads = SHARED_TOOLS.filter((name) => name !== 'create_food').flatMap((name) => {
		const tool = named(name);
		return tool ? [tool] : [];
	});
	// A correction keeps no amount text: entries carry servings, and the answer says the rest.
	const { quantityDescription: _amountText, ...logProperties } = named('log_food')!.input_schema
		.properties as Record<string, unknown>;
	return withCacheBreakpoint([
		...reads,
		{ ...named('create_food')!, description: createFoodDescription(nutrientDatabase) },
		strictTool(
			'get_task_entries',
			'Get the diary entries of this meal and their foods in full, with every change you staged so far applied. Foods you created for this meal are marked createdByThisTask.',
			{}
		),
		looseTool(
			'update_entry',
			"Change one entry of this meal. Pass only what changes and null for everything else. foodId switches the entry to another food (an existing one of the user's, or one from create_food); quick values change a quick entry. A recipe entry can change its servings, meal type and time only. Staged until reply_to_user.",
			{
				entryId: text('entryId from get_task_entries'),
				servings: nullable('number', "New number of servings of the food's own serving size"),
				foodId: nullable('string', 'Food to log instead'),
				mealType: nullable('string', 'Breakfast, Lunch, Dinner, Snacks or a custom meal type'),
				eatenAt: nullable(
					'string',
					'New time as an ISO 8601 timestamp with UTC offset; it stays on the task date'
				),
				quickName: nullable('string', 'Name of a quick entry'),
				quickCalories: nullable('number', 'Calories per serving of a quick entry'),
				quickProtein: nullable('number', 'Protein in grams per serving of a quick entry'),
				quickCarbs: nullable('number', 'Carbohydrates in grams per serving of a quick entry'),
				quickFat: nullable('number', 'Fat in grams per serving of a quick entry'),
				quickFiber: nullable('number', 'Fiber in grams per serving of a quick entry')
			}
		),
		strictTool(
			'delete_entry',
			'Remove one entry of this meal from the diary. Staged until reply_to_user.',
			{ entryId: text('entryId from get_task_entries') }
		),
		looseTool(
			'log_food',
			"Add one food, recipe or quick entry to this meal, for something that was eaten but is missing. Give foodId or recipeId, or the quick values for a one-off estimate. servings is the number of servings of the food's own serving size. Use null for anything that does not apply. Staged until reply_to_user.",
			logProperties
		),
		looseTool(
			'update_food',
			`Change a food marked canChange in get_task_entries: one you created for this meal that nothing outside this meal uses, or one you created in this correction. Pass only what changes and null for everything else. Values are per serving. Staged until reply_to_user.`,
			{
				foodId: text('foodId of a food you created for this meal'),
				name: nullable('string', 'Food name'),
				brand: nullable('string', 'Brand name'),
				servingSize: nullable('number', 'Serving size amount, greater than 0'),
				servingUnit: {
					anyOf: [{ type: 'string', enum: [...servingUnitValues] }, { type: 'null' }],
					description: 'Unit of the serving size'
				},
				calories: nullable('number', 'Calories per serving'),
				protein: nullable('number', 'Protein in grams per serving'),
				carbs: nullable('number', 'Carbohydrates in grams per serving'),
				fat: nullable('number', 'Fat in grams per serving'),
				fiber: nullable('number', 'Fiber in grams per serving'),
				nutrients: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							nutrient: { type: 'string', enum: NUTRIENT_KEYS },
							amount: { anyOf: [{ type: 'number' }, { type: 'null' }] }
						},
						required: ['nutrient', 'amount'],
						additionalProperties: false
					},
					description: `Nutrients to set per serving, in the unit shown: ${NUTRIENT_LIST}. An amount of null clears a value that is wrong and unknown. Empty array when none change.`
				},
				ingredientsText: nullable('string', 'Full ingredients text')
			}
		),
		strictTool(
			'reply_to_user',
			'Save every change you staged and send your answer to the user. Call it once, as the last tool call, also when you changed nothing.',
			{
				message: text(
					'Short answer to the user saying plainly what you changed, with the amounts before and after, or why you changed nothing'
				)
			}
		)
	]);
};

const TOOLS_WITH_DATABASE = correctionToolDefinitions(true);
const TOOLS_WITHOUT_DATABASE = correctionToolDefinitions(false);

export const correctionTools = (nutrientDatabase: boolean): Anthropic.Tool[] =>
	nutrientDatabase ? TOOLS_WITH_DATABASE : TOOLS_WITHOUT_DATABASE;

const quickNumber = optionalNumber;

// update_entry, log_food and update_food are not strict on the API side, so
// their input is checked here, unknown keys included: a key that is silently
// dropped would let the answer claim a change that never happened.
const schemas = {
	get_task_entries: z.object({}),
	update_entry: z.strictObject({
		entryId: z.string().uuid(),
		servings: z.number().positive().nullish(),
		foodId: z.string().uuid().nullish(),
		mealType: z.string().min(1).max(50).nullish(),
		eatenAt: z.string().max(64).nullish(),
		quickName: z.string().min(1).max(200).nullish(),
		quickCalories: quickNumber,
		quickProtein: quickNumber,
		quickCarbs: quickNumber,
		quickFat: quickNumber,
		quickFiber: quickNumber
	}),
	delete_entry: z.object({ entryId: z.string().uuid() }),
	update_food: z.strictObject({
		foodId: z.string().uuid(),
		name: z.string().nullish(),
		brand: z.string().nullish(),
		servingSize: z.number().nullish(),
		servingUnit: z.string().nullish(),
		calories: z.number().nullish(),
		protein: z.number().nullish(),
		carbs: z.number().nullish(),
		fat: z.number().nullish(),
		fiber: z.number().nullish(),
		nutrients: z
			.array(
				z.object({
					nutrient: z.enum(NUTRIENT_KEYS as [string, ...string[]]),
					amount: z.number().nullable()
				})
			)
			.nullish()
			.transform((nutrients) => nutrients ?? []),
		ingredientsText: z.string().nullish()
	}),
	reply_to_user: z.object({ message: z.string().trim().min(1).max(2000) }),
	log_food: z.strictObject(inputSchemas.log_food.omit({ quantityDescription: true }).shape)
};

type EntryFields = {
	foodId: string | null;
	recipeId: string | null;
	mealType: string;
	servings: number;
	eatenAt: string;
	quickName: string | null;
	quickCalories: number | null;
	quickProtein: number | null;
	quickCarbs: number | null;
	quickFat: number | null;
	quickFiber: number | null;
};

const QUICK_KEYS = [
	'quickName',
	'quickCalories',
	'quickProtein',
	'quickCarbs',
	'quickFat',
	'quickFiber'
] as const;

const FIELD_KEYS: (keyof EntryFields)[] = [
	'foodId',
	'recipeId',
	'mealType',
	'servings',
	'eatenAt',
	...QUICK_KEYS
];

type PlannedEntry = {
	id: string;
	// The entry as the diary has it; null for one this correction adds.
	base: EntryFields | null;
	fields: EntryFields;
	deleted: boolean;
};

export type CorrectionTask = ScopedTask & {
	mealType: string | null;
	eatenAt: Date | null;
};

type FoodRow = NonNullable<Awaited<ReturnType<typeof getFood>>>;

type RecipeView = { name: string; totalServings: number; perServing: Record<string, number> };

export type CorrectionToolContext = {
	shared: TaskToolContext;
	task: CorrectionTask;
	// The user sent the reply at this instant, so the correction is their edit
	// of that moment: it overwrites what was there before and loses to anything
	// they changed afterwards (last-write-wins).
	replyAt: Date;
	entries: Map<string, PlannedEntry>;
	taskFoods: Set<string>;
	foodPatches: Map<string, Record<string, unknown>>;
	foodRows: Map<string, FoodRow | null>;
	usedOutside: Map<string, boolean>;
	recipes: Map<string, RecipeView | null>;
	// Per correction, not per plan: a reload after a failed save keeps them.
	// entryChanges counts staged changes; stagedFoods holds every distinct food
	// create_food staged, so staging the same food again after a reload is free.
	entryChanges: number;
	stagedFoods: Set<string>;
};

const fieldsOf = (row: typeof foodEntries.$inferSelect): EntryFields => ({
	foodId: row.foodId,
	recipeId: row.recipeId,
	mealType: row.mealType,
	servings: row.servings,
	eatenAt: row.eatenAt.toISOString(),
	quickName: row.quickName,
	quickCalories: row.quickCalories,
	quickProtein: row.quickProtein,
	quickCarbs: row.quickCarbs,
	quickFat: row.quickFat,
	quickFiber: row.quickFiber
});

const sameFields = (a: EntryFields, b: EntryFields) => FIELD_KEYS.every((key) => a[key] === b[key]);

/** Loads (or reloads) what the correction works on, discarding anything staged. */
export async function loadCorrectionState(ctx: CorrectionToolContext, db: TxOrDb = getDB()) {
	const [rows, taskFoods] = await Promise.all([
		listTaskEntries(db, ctx.task),
		listTaskFoodIds(db, ctx.task.id, ctx.task.userId)
	]);
	ctx.entries = new Map(
		rows.map((row) => [
			row.id,
			{
				id: row.id,
				base: fieldsOf(row),
				fields: fieldsOf(row),
				deleted: false
			}
		])
	);
	ctx.taskFoods = taskFoods;
	ctx.foodPatches = new Map();
	ctx.foodRows = new Map();
	ctx.usedOutside = new Map();
	ctx.recipes = new Map();
	ctx.shared.foods.clear();
	ctx.shared.createdFoods.clear();
}

export function newCorrectionContext(
	task: CorrectionTask,
	shared: TaskToolContext,
	replyAt: Date
): CorrectionToolContext {
	shared.provisionalNote = STAGED_FOOD_NOTE;
	return {
		shared,
		task,
		replyAt,
		entries: new Map(),
		taskFoods: new Set(),
		foodPatches: new Map(),
		foodRows: new Map(),
		usedOutside: new Map(),
		recipes: new Map(),
		entryChanges: 0,
		stagedFoods: new Set()
	};
}

/** Whether a create_food call would stage one food more than the correction may. */
export function exceedsFoodCap(ctx: CorrectionToolContext, input: unknown, max: number): boolean {
	const key = createFoodKey(input);
	return key !== null && !ctx.stagedFoods.has(key) && ctx.stagedFoods.size >= max;
}

const baseEntryIds = (ctx: CorrectionToolContext) =>
	[...ctx.entries.values()].filter((entry) => entry.base).map((entry) => entry.id);

async function loadFood(ctx: CorrectionToolContext, foodId: string): Promise<FoodRow | null> {
	if (!ctx.foodRows.has(foodId)) ctx.foodRows.set(foodId, await getFood(ctx.task.userId, foodId));
	return ctx.foodRows.get(foodId) ?? null;
}

async function usedOutsideTask(ctx: CorrectionToolContext, foodId: string): Promise<boolean> {
	if (!ctx.usedOutside.has(foodId)) {
		ctx.usedOutside.set(
			foodId,
			await isFoodUsedOutsideTask(getDB(), ctx.task.userId, foodId, baseEntryIds(ctx))
		);
	}
	return ctx.usedOutside.get(foodId) === true;
}

async function loadRecipe(
	ctx: CorrectionToolContext,
	recipeId: string
): Promise<RecipeView | null> {
	if (!ctx.recipes.has(recipeId)) {
		const recipe = asRecord(await getRecipe(ctx.task.userId, recipeId));
		const totalServings = Number(recipe.totalServings);
		ctx.recipes.set(
			recipeId,
			recipe.id
				? {
						name: String(recipe.name),
						totalServings,
						perServing: Object.fromEntries(
							(['calories', 'protein', 'carbs', 'fat', 'fiber'] as const).map((key) => [
								key,
								perServing(recipe[key], totalServings)
							])
						)
					}
				: null
		);
	}
	return ctx.recipes.get(recipeId) ?? null;
}

type FoodValues = Record<string, unknown>;

async function currentFood(ctx: CorrectionToolContext, foodId: string): Promise<FoodValues | null> {
	const staged = ctx.shared.foods.get(foodId);
	if (staged) return staged;
	const row = await loadFood(ctx, foodId);
	return row ? { ...row, ...(ctx.foodPatches.get(foodId) ?? {}) } : null;
}

const round = (value: number) => Math.round(value * 100) / 100;

async function describeFood(ctx: CorrectionToolContext, foodId: string) {
	const food = await currentFood(ctx, foodId);
	if (!food) return null;
	const staged = ctx.shared.foods.has(foodId);
	const createdByThisTask = staged || ctx.taskFoods.has(foodId);
	const usedOutsideThisTask = createdByThisTask && !staged && (await usedOutsideTask(ctx, foodId));
	const nutrients = Object.fromEntries(
		ALL_NUTRIENT_KEYS.flatMap((key) =>
			typeof food[key] === 'number' ? [[key, round(food[key] as number)]] : []
		)
	);
	const ingredients = typeof food.ingredientsText === 'string' ? food.ingredientsText : null;
	return {
		foodId,
		name: food.name,
		brand: food.brand ?? null,
		servingSize: food.servingSize,
		servingUnit: food.servingUnit,
		barcode: food.barcode ?? null,
		calories: food.calories,
		protein: food.protein,
		carbs: food.carbs,
		fat: food.fat,
		fiber: food.fiber,
		nutrients,
		ingredientsText:
			ingredients && ingredients.length > 300 ? `${ingredients.slice(0, 300)}…` : ingredients,
		createdByThisTask,
		...(staged ? { notSavedYet: true } : {}),
		...(createdByThisTask && !staged ? { usedOutsideThisTask } : {}),
		canChange: createdByThisTask && !usedOutsideThisTask,
		...(ctx.foodPatches.has(foodId) ? { changed: true } : {})
	};
}

async function describeEntry(ctx: CorrectionToolContext, entry: PlannedEntry) {
	const { fields } = entry;
	const food = fields.foodId ? await currentFood(ctx, fields.foodId) : null;
	const recipe = fields.recipeId ? await loadRecipe(ctx, fields.recipeId) : null;
	const per = (key: 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber') => {
		if (food) return Number(food[key] ?? 0);
		if (recipe) return recipe.perServing[key] ?? 0;
		const quick = {
			calories: fields.quickCalories,
			protein: fields.quickProtein,
			carbs: fields.quickCarbs,
			fat: fields.quickFat,
			fiber: fields.quickFiber
		}[key];
		return Number(quick ?? 0);
	};
	const totals = Object.fromEntries(
		(['calories', 'protein', 'carbs', 'fat', 'fiber'] as const).map((key) => [
			key,
			round(per(key) * fields.servings)
		])
	);
	return {
		entryId: entry.id,
		status: !entry.base ? 'added' : sameFields(entry.fields, entry.base) ? 'unchanged' : 'changed',
		name: fields.quickName ?? String(food?.name ?? recipe?.name ?? 'entry'),
		mealType: fields.mealType,
		eatenAt: offsetString(new Date(fields.eatenAt), ctx.shared.timeZone),
		servings: fields.servings,
		foodId: fields.foodId,
		recipeId: fields.recipeId,
		...(recipe ? { recipeTotalServings: recipe.totalServings } : {}),
		...(fields.foodId || fields.recipeId
			? {}
			: {
					quick: Object.fromEntries(QUICK_KEYS.map((key) => [key, fields[key]]))
				}),
		totals
	};
}

/** The meal as get_task_entries and the first prompt show it, with staged changes applied. */
export async function renderState(ctx: CorrectionToolContext) {
	const live = [...ctx.entries.values()].filter((entry) => !entry.deleted);
	const foodIds = [
		...new Set([
			...live.flatMap((entry) => (entry.fields.foodId ? [entry.fields.foodId] : [])),
			...ctx.taskFoods,
			...ctx.shared.foods.keys()
		])
	];
	const entries = await Promise.all(live.map((entry) => describeEntry(ctx, entry)));
	const foods = (await Promise.all(foodIds.map((id) => describeFood(ctx, id)))).filter(Boolean);
	const removed = [...ctx.entries.values()]
		.filter((entry) => entry.deleted)
		.map((entry) => entry.id);
	return {
		entries,
		foods,
		...(removed.length > 0 ? { removedEntryIds: removed } : {})
	};
}

function liveEntry(ctx: CorrectionToolContext, entryId: string): PlannedEntry {
	const entry = ctx.entries.get(entryId);
	if (!entry || entry.deleted) throw new ToolInputError(NOT_IN_TASK);
	return entry;
}

async function requireFood(ctx: CorrectionToolContext, foodId: string) {
	if (!(await currentFood(ctx, foodId))) throw new ToolInputError('Food not found');
}

async function stageEntryUpdate(
	input: z.infer<typeof schemas.update_entry>,
	ctx: CorrectionToolContext
) {
	const entry = liveEntry(ctx, input.entryId);
	const next: EntryFields = { ...entry.fields };
	if (input.foodId) {
		if (next.recipeId) {
			throw new ToolInputError(
				'This entry logs a recipe. To log a food instead, delete the entry and add the food with log_food.'
			);
		}
		await requireFood(ctx, input.foodId);
		next.foodId = input.foodId;
		for (const key of QUICK_KEYS) next[key] = null;
	}
	const quick = QUICK_KEYS.filter((key) => input[key] != null);
	if (quick.length > 0) {
		if (next.foodId || next.recipeId) {
			throw new ToolInputError(
				'Quick values only apply to a quick entry. Switch the entry to another food with foodId, or delete it and log a quick entry.'
			);
		}
		for (const key of quick) Object.assign(next, { [key]: input[key] });
	}
	if (input.servings != null) next.servings = input.servings;
	if (input.mealType) {
		const mealType = normalizeMealType(input.mealType);
		if (!(await validateMealType(ctx.task.userId, mealType))) {
			throw new ToolInputError(`Invalid meal type: ${mealType}`);
		}
		next.mealType = mealType;
	}
	if (input.eatenAt) {
		next.eatenAt = await resolveEatenAt(
			{ task: { ...ctx.shared.task, eatenAt: null }, timeZone: ctx.shared.timeZone },
			next.mealType,
			input.eatenAt
		);
	}
	if (sameFields(next, entry.fields)) {
		throw new ToolInputError('Nothing to change: pass at least one new value.');
	}
	const check = entryCreateSchema.safeParse({ ...entryPayload(next), date: ctx.task.date });
	if (!check.success) throw check.error;
	entry.fields = next;
	return { entryId: entry.id, staged: true, entry: await describeEntry(ctx, entry) };
}

async function stageEntryAdd(input: unknown, ctx: CorrectionToolContext) {
	const { parsed, eatenAt } = await prepareLog(schemas.log_food.parse(input), ctx.shared);
	const data = parsed.data;
	const entry: PlannedEntry = {
		id: crypto.randomUUID(),
		base: null,
		fields: {
			foodId: data.foodId ?? null,
			recipeId: data.recipeId ?? null,
			mealType: data.mealType,
			servings: data.servings,
			eatenAt,
			quickName: data.quickName ?? null,
			quickCalories: data.quickCalories ?? null,
			quickProtein: data.quickProtein ?? null,
			quickCarbs: data.quickCarbs ?? null,
			quickFat: data.quickFat ?? null,
			quickFiber: data.quickFiber ?? null
		},
		deleted: false
	};
	ctx.entries.set(entry.id, entry);
	return { entryId: entry.id, staged: true, entry: await describeEntry(ctx, entry) };
}

function stageEntryDelete(input: z.infer<typeof schemas.delete_entry>, ctx: CorrectionToolContext) {
	const entry = liveEntry(ctx, input.entryId);
	if (entry.base) entry.deleted = true;
	else ctx.entries.delete(entry.id);
	return { entryId: entry.id, staged: true, removed: true };
}

const withoutNulls = (record: Record<string, unknown>) =>
	Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null));

async function stageFoodUpdate(
	input: z.infer<typeof schemas.update_food>,
	ctx: CorrectionToolContext
) {
	const { foodId, nutrients, ...fields } = input;
	const patch: Record<string, unknown> = withoutNulls(
		Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
	);
	for (const { nutrient, amount } of nutrients) patch[nutrient] = amount;
	if (Object.keys(patch).length === 0) {
		throw new ToolInputError('Nothing to change: pass at least one new value.');
	}

	const staged = ctx.shared.foods.get(foodId);
	if (staged) {
		ctx.shared.foods.set(foodId, foodCreateSchema.parse(withoutNulls({ ...staged, ...patch })));
		return { foodId, staged: true, food: await describeFood(ctx, foodId) };
	}

	if (!ctx.taskFoods.has(foodId)) throw new ToolInputError(NOT_TASK_FOOD);
	if (await usedOutsideTask(ctx, foodId)) throw new ToolInputError(SHARED_FOOD);
	const parsed = foodUpdateSchema.parse(patch);
	ctx.foodPatches.set(foodId, { ...(ctx.foodPatches.get(foodId) ?? {}), ...parsed });
	return { foodId, staged: true, food: await describeFood(ctx, foodId) };
}

const entryPayload = (fields: EntryFields) =>
	withoutNulls({
		foodId: fields.foodId,
		recipeId: fields.recipeId,
		mealType: fields.mealType,
		servings: fields.servings,
		eatenAt: fields.eatenAt,
		...Object.fromEntries(QUICK_KEYS.map((key) => [key, fields[key]]))
	});

const entryPatch = (base: EntryFields, next: EntryFields) =>
	Object.fromEntries(
		FIELD_KEYS.filter((key) => key !== 'recipeId' && next[key] !== base[key]).map((key) => [
			key,
			next[key]
		])
	);

/** Something changed between staging and saving; nothing was saved. */
class ApplyConflict extends Error {}

/** Entries the plan changes were deleted by the user meanwhile; nothing was saved. */
class EntriesGone extends Error {
	constructor(readonly entryIds: string[]) {
		super('Entries were deleted');
	}
}

/** The task is no longer one a correction may change (reopened or resolved again). */
export class CorrectionTaskChangedError extends Error {
	constructor() {
		super('The task is no longer completed');
		this.name = 'CorrectionTaskChangedError';
	}
}

const conflictFrom = (error: unknown): unknown =>
	isZodError(error) || (error instanceof ApiError && error.status < 500)
		? new ApplyConflict(error instanceof Error ? error.message : 'invalid change')
		: error;

async function entryExists(tx: TxOrDb, userId: string, entryId: string): Promise<boolean> {
	const [row] = await tx
		.select({ id: foodEntries.id })
		.from(foodEntries)
		.where(and(eq(foodEntries.id, entryId), eq(foodEntries.userId, userId)));
	return !!row;
}

/**
 * Saves every staged change, Claude's answer and the end of the run in one
 * fenced transaction: either the user sees the corrected meal with the answer
 * that explains it, or nothing changed at all.
 */
async function applyCorrection(
	ctx: CorrectionToolContext,
	message: string
): Promise<ClaudeTaskMessageOutcome> {
	const { userId } = ctx.task;
	const created: CreatedFood[] = [];
	const outcome = await withFence(ctx.shared.fence, async (tx) => {
		const [task] = await tx
			.select({ status: aiTasks.status, createdEntryIds: aiTasks.createdEntryIds })
			.from(aiTasks)
			.where(and(eq(aiTasks.id, ctx.task.id), eq(aiTasks.userId, userId)));
		if (task?.status !== 'completed') throw new CorrectionTaskChangedError();

		const all = [...ctx.entries.values()];
		const live = all.filter((entry) => !entry.deleted);
		const changed = live.filter((entry) => entry.base && !sameFields(entry.fields, entry.base));
		const added = live.filter((entry) => !entry.base);
		const removed = all.filter((entry) => entry.deleted && entry.base);

		// The scope again, under the task lock. An entry that still exists but is
		// no longer the task's (moved to another day) is the user's now; one that
		// no longer exists is already removed, which only matters for a change.
		const scope = (
			await listTaskEntries(tx, { ...ctx.task, createdEntryIds: task.createdEntryIds })
		).map((row) => row.id);
		const vanished = new Set<string>();
		for (const entry of [...changed, ...removed]) {
			if (scope.includes(entry.id)) continue;
			if (await entryExists(tx, userId, entry.id)) {
				throw new ApplyConflict(
					'An entry you changed or removed was moved to another day or out of this meal after the user wrote.'
				);
			}
			vanished.add(entry.id);
		}
		const vanishedChanges = changed.filter((entry) => vanished.has(entry.id));
		if (vanishedChanges.length > 0) throw new EntriesGone(vanishedChanges.map((entry) => entry.id));

		const savedIds = new Map<string, string>();
		for (const [stagedId, data] of ctx.shared.foods) {
			if (!live.some((entry) => entry.fields.foodId === stagedId)) continue;
			const barcode = typeof data.barcode === 'string' && data.barcode ? data.barcode : null;
			const existing = barcode ? await findFoodByBarcode(userId, barcode, tx) : null;
			if (existing) {
				savedIds.set(stagedId, existing.id);
				continue;
			}
			const food = await createFood(userId, data, tx, ctx.replyAt);
			if (!food.success) throw conflictFrom(food.error);
			savedIds.set(stagedId, food.data.id);
			created.push({ id: food.data.id, barcode: food.data.barcode });
		}
		await recordTaskFoods(
			tx,
			ctx.task.id,
			created.map((food) => food.id)
		);

		if (ctx.foodPatches.size > 0) {
			const owned = await listTaskFoodIds(tx, ctx.task.id, userId);
			for (const [foodId, patch] of ctx.foodPatches) {
				if (!owned.has(foodId)) {
					throw new ApplyConflict('A food you changed was deleted after the user wrote.');
				}
				if (await isFoodUsedOutsideTask(tx, userId, foodId, scope)) {
					throw new ApplyConflict(
						'A food you changed is now also used outside this meal, so it is the user’s like any other food.'
					);
				}
				const updated = await updateFood(userId, foodId, patch, ctx.replyAt, { tx });
				if (!updated.success) throw conflictFrom(updated.error);
				if (!updated.data) {
					throw new ApplyConflict(
						'The user edited a food you changed after they wrote, and their edit stands.'
					);
				}
			}
		}

		const saved = (id: string | null) => (id ? (savedIds.get(id) ?? id) : null);
		for (const entry of removed) {
			if (vanished.has(entry.id)) continue;
			const gone = await deleteEntry(userId, entry.id, { tx, clientEditedAt: ctx.replyAt });
			if (!gone && (await entryExists(tx, userId, entry.id))) {
				throw new ApplyConflict(
					'The user edited an entry you removed after they wrote, and their edit stands.'
				);
			}
		}
		for (const entry of changed) {
			const next = { ...entry.fields, foodId: saved(entry.fields.foodId) };
			const result = await updateEntry(
				userId,
				entry.id,
				entryPatch(entry.base!, next),
				ctx.replyAt,
				{ tx }
			);
			if (!result.success) throw conflictFrom(result.error);
			if (!result.data) {
				if (!(await entryExists(tx, userId, entry.id))) throw new EntriesGone([entry.id]);
				throw new ApplyConflict(
					'The user edited an entry you changed after they wrote, and their edit stands.'
				);
			}
		}
		for (const entry of added) {
			const payload = {
				...entryPayload({ ...entry.fields, foodId: saved(entry.fields.foodId) }),
				date: ctx.task.date
			};
			const result = await createEntry(userId, payload, ctx.replyAt, { id: entry.id, tx });
			if (!result.success) throw conflictFrom(result.error);
		}

		const changes = changed.length + added.length + removed.length + ctx.foodPatches.size;
		if (added.length + removed.length > 0) {
			const gone = new Set(removed.map((entry) => entry.id));
			const entryIds = [
				...new Set([
					...(task.createdEntryIds ?? []).filter((id) => !gone.has(id)),
					...added.map((entry) => entry.id)
				])
			];
			await tx
				.update(aiTasks)
				.set({ createdEntryIds: entryIds })
				.where(and(eq(aiTasks.id, ctx.task.id), eq(aiTasks.userId, userId)));
		}
		const outcome: ClaudeTaskMessageOutcome = changes > 0 ? 'changed' : 'answered';
		await addAssistantMessage(tx, { taskId: ctx.task.id, userId, text: message, outcome });
		await transitionCorrection(tx, ctx.shared.fence, {
			state: 'succeeded',
			failureCode: null,
			failureDetail: null
		});
		return outcome;
	});
	await addOpenFoodFactsDetail(userId, created);
	return outcome;
}

const ok = (value: unknown, limit = 8000): LoopToolResult => {
	const content = JSON.stringify(value);
	return {
		content: content.length > limit ? content.slice(0, limit) : content,
		isError: false
	};
};

const staged = (ctx: CorrectionToolContext, value: unknown): LoopToolResult => {
	ctx.entryChanges++;
	return ok(value);
};

export async function runCorrectionTool(
	name: string,
	input: unknown,
	ctx: CorrectionToolContext
): Promise<LoopToolResult> {
	if (SHARED_TOOLS.includes(name)) {
		const result = await runSharedTool(name, input, ctx.shared);
		const key = name === 'create_food' && !result.isError ? createFoodKey(input) : null;
		if (key) ctx.stagedFoods.add(key);
		return result;
	}
	try {
		switch (name) {
			case 'get_task_entries':
				schemas.get_task_entries.parse(input);
				return ok(await renderState(ctx), STATE_MAX_CHARS);
			case 'update_entry':
				return staged(ctx, await stageEntryUpdate(schemas.update_entry.parse(input), ctx));
			case 'delete_entry':
				return staged(ctx, stageEntryDelete(schemas.delete_entry.parse(input), ctx));
			case 'log_food':
				return staged(ctx, await stageEntryAdd(input, ctx));
			case 'update_food':
				return ok(await stageFoodUpdate(schemas.update_food.parse(input), ctx));
			case 'reply_to_user': {
				const { message } = schemas.reply_to_user.parse(input);
				try {
					await applyCorrection(ctx, message);
				} catch (error) {
					if (error instanceof EntriesGone) {
						for (const entryId of error.entryIds) ctx.entries.delete(entryId);
						return failure(
							`Nothing was saved yet: the user deleted entries you changed (${error.entryIds.join(', ')}) after they wrote, so those changes were dropped from your plan. Everything else you staged is still staged. Check get_task_entries, then call reply_to_user again with an answer that matches.`
						);
					}
					if (!(error instanceof ApplyConflict)) throw error;
					await loadCorrectionState(ctx);
					return failure(
						`Nothing was saved: ${error.message} Your staged changes were discarded and the meal was reloaded as it is now. Call get_task_entries, then stage your changes again or reply without them.`
					);
				}
				return { content: JSON.stringify({ success: true }), isError: false, done: true };
			}
			default:
				throw new ToolInputError(`Unknown tool: ${name}`);
		}
	} catch (error) {
		return toolErrorResult(error, ctx.shared.signal);
	}
}
