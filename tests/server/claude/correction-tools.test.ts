import { beforeEach, describe, expect, test, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { createMockDB } from '../../helpers/mock-db';

const h = vi.hoisted(() => ({
	createEntry: vi.fn(),
	deleteEntry: vi.fn(),
	updateEntry: vi.fn(),
	validateMealType: vi.fn(),
	eatenAtOnDate: vi.fn(),
	getFood: vi.fn(),
	createFood: vi.fn(),
	findFoodByBarcode: vi.fn(),
	updateFood: vi.fn(),
	getRecipe: vi.fn(),
	listTaskEntries: vi.fn(),
	listTaskFoodIds: vi.fn(),
	recordTaskFoods: vi.fn(),
	isFoodUsedOutsideTask: vi.fn(),
	addAssistantMessage: vi.fn(),
	transitionCorrection: vi.fn(),
	addOff: vi.fn(),
	handleSearchFoods: vi.fn(),
	execute: vi.fn()
}));

const { db: tx, queueResults, reset, getCalls } = createMockDB();

vi.mock('$lib/server/entries', () => ({
	createEntry: h.createEntry,
	deleteEntry: h.deleteEntry,
	updateEntry: h.updateEntry,
	validateMealType: h.validateMealType,
	eatenAtOnDate: h.eatenAtOnDate
}));
vi.mock('$lib/server/foods', () => ({
	getFood: h.getFood,
	createFood: h.createFood,
	findFoodByBarcode: h.findFoodByBarcode,
	updateFood: h.updateFood
}));
vi.mock('$lib/server/recipes', () => ({ getRecipe: h.getRecipe }));
vi.mock('$lib/server/claude/tasks/task-scope', () => ({
	listTaskEntries: h.listTaskEntries,
	listTaskFoodIds: h.listTaskFoodIds,
	recordTaskFoods: h.recordTaskFoods,
	isFoodUsedOutsideTask: h.isFoodUsedOutsideTask
}));
vi.mock('$lib/server/claude/tasks/corrections', () => ({
	addAssistantMessage: h.addAssistantMessage,
	transitionCorrection: h.transitionCorrection
}));
vi.mock('$lib/server/claude/tasks/off-detail', () => ({ addOpenFoodFactsDetail: h.addOff }));
vi.mock('$lib/server/claude/tasks/runs', () => ({
	withFence: async (_fence: unknown, fn: (db: unknown) => unknown) => fn(tx),
	ledgerGetOrCreate: vi.fn(),
	loadRun: vi.fn(),
	transitionFenced: vi.fn()
}));
vi.mock('$lib/server/claude/tasks/outcomes', () => ({
	completeByModel: vi.fn(),
	dismissByModel: vi.fn()
}));
vi.mock('$lib/server/mcp/handlers', () => ({
	handleSearchFoods: h.handleSearchFoods,
	handleListRecipes: vi.fn(),
	handleGetRecipe: vi.fn(),
	handleFindFoodByBarcode: vi.fn(),
	handleSearchOpenFoodFacts: vi.fn(),
	handleCreateFood: vi.fn()
}));
vi.mock('$lib/server/db', () => ({ getDB: () => ({ execute: h.execute }) }));

const tools = await import('$lib/server/claude/tasks/correction-tools');
const { ApiError } = await import('$lib/server/errors');

const USER = 'user-1';
const TASK = '00000000-0000-4000-8000-000000000001';
const SKYR = '00000000-0000-4000-8000-0000000000a1';
const OWN = '00000000-0000-4000-8000-0000000000a2';
const BREAD = '00000000-0000-4000-8000-0000000000a3';
const RECIPE = '00000000-0000-4000-8000-0000000000b1';
const E_SKYR = '00000000-0000-4000-8000-0000000000e1';
const E_QUICK = '00000000-0000-4000-8000-0000000000e2';
const E_RECIPE = '00000000-0000-4000-8000-0000000000e3';
const OTHER = '00000000-0000-4000-8000-0000000000e9';
const REPLY_AT = new Date('2026-10-12T09:00:00Z');

const food = (id: string, values: Record<string, unknown> = {}) => ({
	id,
	name: 'Skyr',
	brand: null,
	servingSize: 150,
	servingUnit: 'g',
	calories: 90,
	protein: 16,
	carbs: 5,
	fat: 0.2,
	fiber: 0,
	barcode: null,
	sodium: 900,
	calcium: null,
	ingredientsText: 'Milk',
	...values
});

const FOODS: Record<string, ReturnType<typeof food>> = {
	[SKYR]: food(SKYR),
	[OWN]: food(OWN, { name: 'Own yogurt', servingSize: 100, calories: 60 }),
	[BREAD]: food(BREAD, { name: 'Bread', servingSize: 50, calories: 120 })
};

const row = (id: string, values: Record<string, unknown> = {}) => ({
	id,
	foodId: null,
	recipeId: null,
	mealType: 'Breakfast',
	servings: 1,
	eatenAt: new Date('2026-10-12T06:00:00Z'),
	quickName: null,
	quickCalories: null,
	quickProtein: null,
	quickCarbs: null,
	quickFat: null,
	quickFiber: null,
	...values
});

const ROWS = () => [
	row(E_SKYR, { foodId: SKYR }),
	row(E_QUICK, { quickName: 'Toast', quickCalories: 120, quickProtein: 4 }),
	row(E_RECIPE, { recipeId: RECIPE, servings: 2 })
];

const makeCtx = async () => {
	const ctx = tools.newCorrectionContext(
		{
			id: TASK,
			userId: USER,
			date: '2026-10-12',
			mealType: 'Breakfast',
			eatenAt: null,
			createdEntryIds: [E_SKYR, E_QUICK, E_RECIPE]
		},
		{
			userId: USER,
			task: { id: TASK, date: '2026-10-12', mealType: 'Breakfast', eatenAt: null },
			mode: 'review',
			timeZone: 'Europe/Zurich',
			locale: 'en',
			fence: { taskId: TASK, instance: 'inst', attempt: 1, kind: 'correction' },
			seen: new Map(),
			foods: new Map(),
			createdFoods: new Map(),
			nutrientRecords: new Set()
		},
		REPLY_AT
	);
	await tools.loadCorrectionState(ctx);
	return ctx;
};

const run = async (
	name: string,
	input: Record<string, unknown>,
	ctx: Awaited<ReturnType<typeof makeCtx>>
) => {
	const result = await tools.runCorrectionTool(name, input, ctx);
	return { ...result, body: JSON.parse(result.content) };
};

const updateInput = (overrides: Record<string, unknown>) => ({
	servings: null,
	foodId: null,
	mealType: null,
	eatenAt: null,
	quickName: null,
	quickCalories: null,
	quickProtein: null,
	quickCarbs: null,
	quickFat: null,
	quickFiber: null,
	quantityDescription: null,
	...overrides
});

const logInput = (overrides: Record<string, unknown>) => ({
	foodId: null,
	recipeId: null,
	servings: 1,
	mealType: null,
	eatenAt: null,
	quickName: null,
	quickCalories: null,
	quickProtein: null,
	quickCarbs: null,
	quickFat: null,
	quickFiber: null,
	quantityDescription: null,
	...overrides
});

const foodPatch = (overrides: Record<string, unknown>) => ({
	name: null,
	brand: null,
	servingSize: null,
	servingUnit: null,
	calories: null,
	protein: null,
	carbs: null,
	fat: null,
	fiber: null,
	nutrients: [],
	ingredientsText: null,
	...overrides
});

const createInput = (overrides: Record<string, unknown> = {}) => ({
	name: 'Skyr light',
	brand: null,
	servingSize: 150,
	servingUnit: 'g',
	calories: 75,
	protein: 14,
	carbs: 4,
	fat: 0,
	fiber: 0,
	nutrients: [],
	barcode: '7610000000024',
	ingredientsText: '',
	...overrides
});

beforeEach(() => {
	reset();
	for (const fn of Object.values(h)) fn.mockReset();
	h.listTaskEntries.mockResolvedValue(ROWS());
	h.listTaskFoodIds.mockResolvedValue(new Set([SKYR]));
	h.getFood.mockImplementation(async (_userId: string, id: string) => FOODS[id] ?? null);
	h.getRecipe.mockResolvedValue({
		id: RECIPE,
		name: 'Porridge',
		totalServings: 4,
		calories: 800,
		protein: 40,
		carbs: 120,
		fat: 20,
		fiber: 16
	});
	h.isFoodUsedOutsideTask.mockResolvedValue(false);
	h.validateMealType.mockResolvedValue(true);
	h.eatenAtOnDate.mockReturnValue('ON_DATE');
	h.execute.mockResolvedValue([{ ms: String(Date.parse('2026-10-12T11:15:00Z')) }]);
	h.findFoodByBarcode.mockResolvedValue(null);
	h.createFood.mockResolvedValue({
		success: true,
		data: { id: '00000000-0000-4000-8000-0000000000c1', barcode: '7610000000024' }
	});
	h.updateFood.mockResolvedValue({ success: true, data: { id: SKYR } });
	h.updateEntry.mockResolvedValue({ success: true, data: { id: E_SKYR } });
	h.createEntry.mockResolvedValue({ success: true, data: {} });
	h.deleteEntry.mockResolvedValue({ id: E_QUICK });
});

describe('tool definitions', () => {
	test('are strict, end on the reply tool with the cache breakpoint and never offer first-run finishers', () => {
		for (const database of [true, false]) {
			const list = tools.correctionTools(database);
			const names = list.map((tool) => tool.name);
			expect(names.at(-1)).toBe('reply_to_user');
			expect(list.at(-1)!.cache_control).toEqual({ type: 'ephemeral' });
			expect(list.slice(0, -1).every((tool) => !tool.cache_control)).toBe(true);
			expect(names).not.toContain('complete_ai_task');
			expect(names).not.toContain('dismiss_ai_task');
			expect(names.includes('search_nutrient_database')).toBe(database);
			for (const tool of list) {
				expect(tool.strict).toBe(true);
				expect(tool.input_schema.additionalProperties).toBe(false);
				expect([...(tool.input_schema.required ?? [])].sort()).toEqual(
					Object.keys(tool.input_schema.properties as object).sort()
				);
			}
			const create = list.find((tool) => tool.name === 'create_food') as Anthropic.Tool;
			expect(create.description).toContain('saved only when reply_to_user saves');
			expect(create.description?.includes('fdcId')).toBe(database);
		}
	});

	test('reply_to_user is the only terminal tool', () => {
		expect(tools.isCorrectionTerminal('reply_to_user')).toBe(true);
		expect(tools.isCorrectionTerminal('complete_ai_task')).toBe(false);
	});
});

describe('get_task_entries', () => {
	test('shows every entry with its totals and the foods with their nutrients', async () => {
		h.isFoodUsedOutsideTask.mockResolvedValue(true);
		const ctx = await makeCtx();
		const { body, isError } = await run('get_task_entries', {}, ctx);
		expect(isError).toBe(false);
		expect(body.entries).toEqual([
			expect.objectContaining({
				entryId: E_SKYR,
				status: 'unchanged',
				name: 'Skyr',
				eatenAt: '2026-10-12T08:00:00+02:00',
				totals: { calories: 90, protein: 16, carbs: 5, fat: 0.2, fiber: 0 }
			}),
			expect.objectContaining({
				entryId: E_QUICK,
				name: 'Toast',
				quick: expect.objectContaining({ quickCalories: 120 }),
				totals: expect.objectContaining({ calories: 120, protein: 4 })
			}),
			expect.objectContaining({
				entryId: E_RECIPE,
				name: 'Porridge',
				recipeTotalServings: 4,
				totals: expect.objectContaining({ calories: 400, protein: 20 })
			})
		]);
		expect(body.foods).toEqual([
			expect.objectContaining({
				foodId: SKYR,
				createdByThisTask: true,
				usedOutsideThisTask: true,
				nutrients: { sodium: 900 },
				ingredientsText: 'Milk'
			})
		]);
		expect(h.isFoodUsedOutsideTask).toHaveBeenCalledWith(expect.anything(), USER, SKYR, [
			E_SKYR,
			E_QUICK,
			E_RECIPE
		]);
	});

	test('cuts long ingredient texts and marks foods it may not change', async () => {
		h.getFood.mockImplementation(async (_userId: string, id: string) =>
			id === OWN ? food(OWN, { ingredientsText: 'x'.repeat(400) }) : (FOODS[id] ?? null)
		);
		h.listTaskEntries.mockResolvedValue([row(E_SKYR, { foodId: OWN })]);
		h.listTaskFoodIds.mockResolvedValue(new Set());
		const ctx = await makeCtx();
		const { body } = await run('get_task_entries', {}, ctx);
		expect(body.foods[0]).toMatchObject({ foodId: OWN, createdByThisTask: false });
		expect(body.foods[0]).not.toHaveProperty('usedOutsideThisTask');
		expect(body.foods[0].ingredientsText).toHaveLength(301);
	});
});

describe('update_entry', () => {
	test('stages a new amount and shows it as changed', async () => {
		const ctx = await makeCtx();
		const { body, isError } = await run(
			'update_entry',
			{ entryId: E_SKYR, ...updateInput({ servings: 1.5, quantityDescription: '225 g' }) },
			ctx
		);
		expect(isError).toBe(false);
		expect(body).toMatchObject({
			staged: true,
			entry: { status: 'changed', servings: 1.5, quantityDescription: '225 g' }
		});
		expect(h.updateEntry).not.toHaveBeenCalled();
		expect(ctx.entryChanges).toBe(1);
	});

	test('refuses an entry that is not part of the meal', async () => {
		const ctx = await makeCtx();
		const { body, isError } = await run(
			'update_entry',
			{ entryId: OTHER, ...updateInput({ servings: 2 }) },
			ctx
		);
		expect(isError).toBe(true);
		expect(body.error).toContain('Not an entry of this meal');
	});

	test('switches a quick entry to a food and clears its quick values', async () => {
		const ctx = await makeCtx();
		const { body } = await run(
			'update_entry',
			{ entryId: E_QUICK, ...updateInput({ foodId: BREAD }) },
			ctx
		);
		expect(body.entry).toMatchObject({ foodId: BREAD, name: 'Bread' });
		expect(body.entry).not.toHaveProperty('quick');
	});

	test.each([
		['a food for a recipe entry', E_RECIPE, { foodId: BREAD }, 'logs a recipe'],
		['quick values for a food entry', E_SKYR, { quickCalories: 10 }, 'only apply to a quick entry'],
		['a food the user does not have', E_SKYR, { foodId: OTHER }, 'Food not found'],
		['nothing', E_SKYR, {}, 'Nothing to change']
	])('refuses %s', async (_label, entryId, overrides, message) => {
		const ctx = await makeCtx();
		const { body, isError } = await run(
			'update_entry',
			{ entryId, ...updateInput(overrides) },
			ctx
		);
		expect(isError).toBe(true);
		expect(body.error).toContain(message);
	});

	test('changes quick values, meal type and time on the task day', async () => {
		const ctx = await makeCtx();
		const { body } = await run(
			'update_entry',
			{
				entryId: E_QUICK,
				...updateInput({
					quickCalories: 150,
					mealType: 'lunch',
					eatenAt: '2026-10-01T13:15:00+02:00'
				})
			},
			ctx
		);
		expect(body.entry).toMatchObject({
			mealType: 'Lunch',
			eatenAt: '2026-10-12T13:15:00+02:00',
			quick: expect.objectContaining({ quickCalories: 150 })
		});
		expect(h.eatenAtOnDate).toHaveBeenCalledWith(expect.anything(), '2026-10-12', 'Europe/Zurich');
	});

	test('refuses an unknown meal type and an invalid result', async () => {
		h.validateMealType.mockResolvedValue(false);
		const ctx = await makeCtx();
		const meal = await run(
			'update_entry',
			{ entryId: E_SKYR, ...updateInput({ mealType: 'Brunch' }) },
			ctx
		);
		expect(meal.body.error).toBe('Invalid meal type: Brunch');
		const invalid = await run(
			'update_entry',
			{ entryId: E_SKYR, ...updateInput({ servings: -1 }) },
			ctx
		);
		expect(invalid.body.error).toBe('validation_failed');
	});
});

describe('delete_entry and log_food', () => {
	test('stages a removal; a removed entry cannot be changed any more', async () => {
		const ctx = await makeCtx();
		const removed = await run('delete_entry', { entryId: E_QUICK }, ctx);
		expect(removed.body).toEqual({ entryId: E_QUICK, staged: true, removed: true });
		const again = await run(
			'update_entry',
			{ entryId: E_QUICK, ...updateInput({ servings: 2 }) },
			ctx
		);
		expect(again.isError).toBe(true);
		const { body } = await run('get_task_entries', {}, ctx);
		expect(body.removedEntryIds).toEqual([E_QUICK]);
		expect(body.entries.map((entry: { entryId: string }) => entry.entryId)).toEqual([
			E_SKYR,
			E_RECIPE
		]);
	});

	test('adds an entry on the task day, and dropping it again leaves no trace', async () => {
		const ctx = await makeCtx();
		const added = await run(
			'log_food',
			logInput({ foodId: BREAD, quantityDescription: '1 slice' }),
			ctx
		);
		expect(added.isError).toBe(false);
		expect(added.body.entry).toMatchObject({
			status: 'added',
			foodId: BREAD,
			mealType: 'Breakfast',
			quantityDescription: '1 slice'
		});
		const dropped = await run('delete_entry', { entryId: added.body.entryId }, ctx);
		expect(dropped.isError).toBe(false);
		const { body } = await run('get_task_entries', {}, ctx);
		expect(body.entries).toHaveLength(3);
		expect(body).not.toHaveProperty('removedEntryIds');
	});

	test('refuses a food the user does not have', async () => {
		const ctx = await makeCtx();
		const { body } = await run('log_food', logInput({ foodId: OTHER }), ctx);
		expect(body.error).toBe('Food not found');
	});
});

describe('update_food', () => {
	test('refuses a food the task did not create', async () => {
		const ctx = await makeCtx();
		const { body, isError } = await run(
			'update_food',
			{ foodId: OWN, ...foodPatch({ calories: 1 }) },
			ctx
		);
		expect(isError).toBe(true);
		expect(body.error).toContain('not created for this meal');
		expect(ctx.foodPatches.size).toBe(0);
	});

	test('stages a fix of a task food and shows it', async () => {
		const ctx = await makeCtx();
		const { body } = await run(
			'update_food',
			{
				foodId: SKYR,
				...foodPatch({
					nutrients: [
						{ nutrient: 'sodium', amount: 60 },
						{ nutrient: 'calcium', amount: 120 }
					]
				})
			},
			ctx
		);
		expect(body.food).toMatchObject({ changed: true, nutrients: { sodium: 60, calcium: 120 } });
		expect(ctx.foodPatches.get(SKYR)).toEqual({ sodium: 60, calcium: 120 });
	});

	test('keeps the serving of a task food used elsewhere but allows it otherwise', async () => {
		const ctx = await makeCtx();
		h.isFoodUsedOutsideTask.mockResolvedValue(true);
		const refused = await run(
			'update_food',
			{ foodId: SKYR, ...foodPatch({ servingSize: 170 }) },
			ctx
		);
		expect(refused.body.error).toContain('also logged outside this meal');

		const fresh = await makeCtx();
		h.isFoodUsedOutsideTask.mockResolvedValue(false);
		const allowed = await run(
			'update_food',
			{ foodId: SKYR, ...foodPatch({ servingSize: 170 }) },
			fresh
		);
		expect(allowed.isError).toBe(false);
	});

	test('refuses an empty change and invalid values', async () => {
		const ctx = await makeCtx();
		expect(
			(await run('update_food', { foodId: SKYR, ...foodPatch({}) }, ctx)).body.error
		).toContain('Nothing to change');
		expect(
			(await run('update_food', { foodId: SKYR, ...foodPatch({ servingUnit: 'bucket' }) }, ctx))
				.body.error
		).toBe('validation_failed');
	});

	test('changes a food staged in this correction, clearing a nutrient set to null', async () => {
		const ctx = await makeCtx();
		const created = await run(
			'create_food',
			createInput({ nutrients: [{ nutrient: 'sodium', amount: 50 }] }),
			ctx
		);
		expect(created.body.note).toContain('reply_to_user saves your changes');
		const { body } = await run(
			'update_food',
			{
				foodId: created.body.foodId,
				...foodPatch({ calories: 80, nutrients: [{ nutrient: 'sodium', amount: null }] })
			},
			ctx
		);
		expect(body.food).toMatchObject({ calories: 80, notSavedYet: true, createdByThisTask: true });
		expect(body.food.nutrients).toEqual({});
	});
});

describe('reply_to_user', () => {
	const completedTask = (entryIds = [E_SKYR, E_QUICK, E_RECIPE]) =>
		queueResults([[{ status: 'completed', createdEntryIds: entryIds }]]);

	test('saves nothing but the answer when nothing was staged', async () => {
		completedTask();
		const ctx = await makeCtx();
		const result = await tools.runCorrectionTool(
			'reply_to_user',
			{ message: '  It was plain.  ' },
			ctx
		);
		expect(result).toEqual({ content: '{"success":true}', isError: false, done: true });
		const [messageTx, message] = h.addAssistantMessage.mock.calls[0]!;
		expect(messageTx).toBe(tx);
		expect(message).toEqual({
			taskId: TASK,
			userId: USER,
			text: 'It was plain.',
			outcome: 'answered'
		});
		const [stateTx, fence, state] = h.transitionCorrection.mock.calls[0]!;
		expect(stateTx).toBe(tx);
		expect(fence).toBe(ctx.shared.fence);
		expect(state).toEqual({ state: 'succeeded', failureCode: null, failureDetail: null });
		expect(h.updateEntry).not.toHaveBeenCalled();
		expect(getCalls().some((call) => call.method === 'update')).toBe(false);
		expect(h.addOff).toHaveBeenCalledWith(USER, []);
	});

	test('saves every staged change with the reply time as the edit time', async () => {
		completedTask();
		const ctx = await makeCtx();
		const created = await run('create_food', createInput(), ctx);
		await run('create_food', createInput({ name: 'Unused', barcode: null }), ctx);
		await run(
			'update_entry',
			{ entryId: E_SKYR, ...updateInput({ foodId: created.body.foodId }) },
			ctx
		);
		await run('update_entry', { entryId: E_RECIPE, ...updateInput({ servings: 3 }) }, ctx);
		await run('delete_entry', { entryId: E_QUICK }, ctx);
		const added = await run('log_food', logInput({ foodId: BREAD }), ctx);
		await run('update_food', { foodId: SKYR, ...foodPatch({ calories: 95 }) }, ctx);
		h.listTaskFoodIds.mockResolvedValue(new Set([SKYR]));

		const result = await tools.runCorrectionTool('reply_to_user', { message: 'Done.' }, ctx);
		expect(result.done).toBe(true);

		const savedId = '00000000-0000-4000-8000-0000000000c1';
		expect(h.createFood).toHaveBeenCalledTimes(1);
		const [creator, createdFood, createTx, createdAt] = h.createFood.mock.calls[0]!;
		expect([creator, createdFood.name, createTx === tx, createdAt]).toEqual([
			USER,
			'Skyr light',
			true,
			REPLY_AT
		]);
		expect(h.recordTaskFoods.mock.calls[0]!.slice(1)).toEqual([TASK, [savedId]]);
		const [, foodId, patch, foodEditedAt, server] = h.updateFood.mock.calls[0]!;
		expect([foodId, patch, foodEditedAt, server.tx === tx]).toEqual([
			SKYR,
			{ calories: 95 },
			REPLY_AT,
			true
		]);
		const [, removedId, removal] = h.deleteEntry.mock.calls[0]!;
		expect([removedId, removal.clientEditedAt, removal.tx === tx]).toEqual([
			E_QUICK,
			REPLY_AT,
			true
		]);
		expect(
			h.updateEntry.mock.calls.map(([, id, payload, editedAt, internal]) => [
				id,
				payload,
				editedAt,
				internal.tx === tx
			])
		).toEqual([
			[E_SKYR, { foodId: savedId }, REPLY_AT, true],
			[E_RECIPE, { servings: 3 }, REPLY_AT, true]
		]);
		const [, entry, entryEditedAt, internal] = h.createEntry.mock.calls[0]!;
		expect(entry).toMatchObject({ foodId: BREAD, date: '2026-10-12', mealType: 'Breakfast' });
		expect([entryEditedAt, internal.id, internal.tx === tx]).toEqual([
			REPLY_AT,
			added.body.entryId,
			true
		]);
		const update = getCalls().find((call) => call.method === 'set');
		expect(update!.args[0]).toEqual({ createdEntryIds: [E_SKYR, E_RECIPE, added.body.entryId] });
		expect(h.addAssistantMessage.mock.calls[0]![1]).toMatchObject({ outcome: 'changed' });
		expect(h.addOff).toHaveBeenCalledWith(USER, [{ id: savedId, barcode: '7610000000024' }]);
	});

	test('logs an existing food with the same barcode instead of creating a duplicate', async () => {
		completedTask();
		h.findFoodByBarcode.mockResolvedValue({ id: OWN });
		const ctx = await makeCtx();
		const created = await run('create_food', createInput({ barcode: '7610000000031' }), ctx);
		h.findFoodByBarcode.mockResolvedValue(null);
		const staged = await run('create_food', createInput({ barcode: '7610000000048' }), ctx);
		await run(
			'update_entry',
			{ entryId: E_SKYR, ...updateInput({ foodId: staged.body.foodId }) },
			ctx
		);
		h.findFoodByBarcode.mockResolvedValue({ id: OWN });
		await tools.runCorrectionTool('reply_to_user', { message: 'Done.' }, ctx);
		expect(created.isError).toBe(true);
		expect(h.createFood).not.toHaveBeenCalled();
		expect(h.updateEntry.mock.calls[0]![2]).toEqual({ foodId: OWN });
		expect(h.recordTaskFoods.mock.calls[0]!.slice(1)).toEqual([TASK, []]);
	});

	test('accepts a removed entry that is gone already', async () => {
		h.deleteEntry.mockResolvedValue(null);
		queueResults([[{ status: 'completed', createdEntryIds: [E_SKYR] }], []]);
		const ctx = await makeCtx();
		await run('delete_entry', { entryId: E_QUICK }, ctx);
		const result = await tools.runCorrectionTool('reply_to_user', { message: 'Removed.' }, ctx);
		expect(result.done).toBe(true);
	});

	test.each([
		[
			'an entry the user edited after writing',
			() => h.updateEntry.mockResolvedValue({ success: true, data: undefined }),
			(ctx: Awaited<ReturnType<typeof makeCtx>>) =>
				run('update_entry', { entryId: E_SKYR, ...updateInput({ servings: 2 }) }, ctx),
			'edited or removed an entry you changed'
		],
		[
			'a refused entry change',
			() =>
				h.updateEntry.mockResolvedValue({
					success: false,
					error: new ApiError(400, 'Invalid meal type')
				}),
			(ctx: Awaited<ReturnType<typeof makeCtx>>) =>
				run('update_entry', { entryId: E_SKYR, ...updateInput({ servings: 2 }) }, ctx),
			'Invalid meal type'
		],
		[
			'a refused new entry',
			() =>
				h.createEntry.mockResolvedValue({
					success: false,
					error: new ApiError(404, 'Food not found')
				}),
			(ctx: Awaited<ReturnType<typeof makeCtx>>) =>
				run('log_food', logInput({ foodId: BREAD }), ctx),
			'Food not found'
		],
		[
			'a removed entry the user edited meanwhile',
			() => {
				h.deleteEntry.mockResolvedValue(null);
				queueResults([[{ status: 'completed', createdEntryIds: [] }], [{ id: E_QUICK }]]);
			},
			(ctx: Awaited<ReturnType<typeof makeCtx>>) => run('delete_entry', { entryId: E_QUICK }, ctx),
			'edited an entry you removed'
		],
		[
			'a food the user edited after writing',
			() => h.updateFood.mockResolvedValue({ success: true, data: undefined }),
			(ctx: Awaited<ReturnType<typeof makeCtx>>) =>
				run('update_food', { foodId: SKYR, ...foodPatch({ calories: 1 }) }, ctx),
			'edited a food you changed'
		],
		[
			'a food that is no longer the task’s',
			() => h.listTaskFoodIds.mockResolvedValue(new Set()),
			(ctx: Awaited<ReturnType<typeof makeCtx>>) =>
				run('update_food', { foodId: SKYR, ...foodPatch({ calories: 1 }) }, ctx),
			'was deleted after the user wrote'
		],
		[
			'a food that cannot be created',
			() =>
				h.createFood.mockResolvedValue({ success: false, error: new ApiError(409, 'duplicate') }),
			async (ctx: Awaited<ReturnType<typeof makeCtx>>) => {
				const created = await run('create_food', createInput(), ctx);
				return run(
					'update_entry',
					{ entryId: E_SKYR, ...updateInput({ foodId: created.body.foodId }) },
					ctx
				);
			},
			'duplicate'
		]
	])(
		'saves nothing after %s, reloads the meal and tells the model',
		async (_label, arrange, stage, message) => {
			completedTask();
			const ctx = await makeCtx();
			await stage(ctx);
			arrange();
			const loads = h.listTaskEntries.mock.calls.length;
			const result = await tools.runCorrectionTool('reply_to_user', { message: 'Done.' }, ctx);
			const body = JSON.parse(result.content);
			expect(result.isError).toBe(true);
			expect(result.done).toBeUndefined();
			expect(body.error).toContain('Nothing was saved');
			expect(body.error).toContain(message);
			expect(h.addAssistantMessage).not.toHaveBeenCalled();
			expect(h.listTaskEntries.mock.calls.length).toBe(loads + 1);
			expect(ctx.entryChanges).toBe(0);
			expect(ctx.foodPatches.size).toBe(0);
			expect(ctx.shared.foods.size).toBe(0);
		}
	);

	test('stops the run when the task is no longer completed', async () => {
		queueResults([[{ status: 'pending', createdEntryIds: [] }]]);
		const ctx = await makeCtx();
		await expect(
			tools.runCorrectionTool('reply_to_user', { message: 'Done.' }, ctx)
		).rejects.toBeInstanceOf(tools.CorrectionTaskChangedError);
	});

	test('rethrows an unexpected failure', async () => {
		completedTask();
		h.updateEntry.mockResolvedValue({ success: false, error: new Error('db down') });
		const ctx = await makeCtx();
		await run('update_entry', { entryId: E_SKYR, ...updateInput({ servings: 2 }) }, ctx);
		await expect(
			tools.runCorrectionTool('reply_to_user', { message: 'Done.' }, ctx)
		).rejects.toThrow('db down');
	});

	test('refuses an empty answer', async () => {
		const ctx = await makeCtx();
		const { body } = await run('reply_to_user', { message: '   ' }, ctx);
		expect(body.error).toBe('validation_failed');
	});
});

describe('other tools', () => {
	test('runs the shared read tools for the user', async () => {
		h.handleSearchFoods.mockResolvedValue({ foods: [{ id: BREAD, name: 'Bread' }] });
		const ctx = await makeCtx();
		const { body } = await run('search_foods', { query: 'bread', limit: null }, ctx);
		expect(body.foods).toEqual([{ id: BREAD, name: 'Bread' }]);
		expect(h.handleSearchFoods).toHaveBeenCalledWith(USER, 'bread', 10);
	});

	test('rejects tools that do not exist here', async () => {
		const ctx = await makeCtx();
		const { body } = await run('complete_ai_task', { resultSummary: 'x' }, ctx);
		expect(body.error).toBe('Unknown tool: complete_ai_task');
	});

	test('cuts a large state at its own limit', async () => {
		h.listTaskEntries.mockResolvedValue(
			Array.from({ length: 300 }, (_, index) =>
				row(`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, {
					quickName: 'x'.repeat(100),
					quickCalories: 1
				})
			)
		);
		const ctx = await makeCtx();
		const result = await tools.runCorrectionTool('get_task_entries', {}, ctx);
		expect(result.content.length).toBe(tools.STATE_MAX_CHARS);
	});
});
