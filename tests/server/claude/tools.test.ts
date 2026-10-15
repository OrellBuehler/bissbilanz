import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const h = vi.hoisted(() => ({
	handleSearchFoods: vi.fn(),
	handleListRecipes: vi.fn(),
	handleGetRecipe: vi.fn(),
	handleFindFoodByBarcode: vi.fn(),
	handleSearchOpenFoodFacts: vi.fn(),
	getFood: vi.fn(),
	getRecipe: vi.fn(),
	createEntry: vi.fn(),
	validateMealType: vi.fn(),
	eatenAtOnDate: vi.fn(),
	execute: vi.fn(),
	ledgerGetOrCreate: vi.fn(),
	loadRun: vi.fn(),
	transitionFenced: vi.fn(),
	completeByModel: vi.fn(),
	dismissByModel: vi.fn()
}));

const TX = { tx: true };

vi.mock('$lib/server/mcp/handlers', () => ({
	handleSearchFoods: h.handleSearchFoods,
	handleListRecipes: h.handleListRecipes,
	handleGetRecipe: h.handleGetRecipe,
	handleFindFoodByBarcode: h.handleFindFoodByBarcode,
	handleSearchOpenFoodFacts: h.handleSearchOpenFoodFacts
}));
vi.mock('$lib/server/foods', () => ({ getFood: h.getFood }));
vi.mock('$lib/server/recipes', () => ({ getRecipe: h.getRecipe }));
vi.mock('$lib/server/entries', () => ({
	createEntry: h.createEntry,
	validateMealType: h.validateMealType,
	eatenAtOnDate: h.eatenAtOnDate
}));
vi.mock('$lib/server/db', () => ({ getDB: () => ({ execute: h.execute }) }));
vi.mock('$lib/server/claude/tasks/runs', () => ({
	withFence: async (_fence: unknown, fn: (tx: unknown) => unknown) => fn(TX),
	ledgerGetOrCreate: h.ledgerGetOrCreate,
	loadRun: h.loadRun,
	transitionFenced: h.transitionFenced
}));
vi.mock('$lib/server/claude/tasks/outcomes', () => ({
	completeByModel: h.completeByModel,
	dismissByModel: h.dismissByModel
}));

const { runTaskTool, TASK_TOOLS } = await import('$lib/server/claude/tasks/tools');
const { ApiError, McpUserError } = await import('$lib/server/errors');
const { LeaseLostError } = await import('$lib/server/claude/errors');

const FOOD_ID = '11111111-1111-4111-8111-111111111111';
const RECIPE_ID = '22222222-2222-4222-8222-222222222222';
const fence = { taskId: 'task-1', instance: 'inst', attempt: 1 };

const makeCtx = (overrides: Record<string, unknown> = {}) => ({
	userId: 'user-1',
	task: { id: 'task-1', date: '2026-10-12', mealType: 'Lunch', eatenAt: null as Date | null },
	mode: 'auto_log' as 'auto_log' | 'review',
	timeZone: 'Europe/Zurich',
	locale: 'en',
	fence,
	seen: new Map<string, number>(),
	...overrides
});

const logInput = (overrides: Record<string, unknown> = {}) => ({
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

const parsed = async (promise: ReturnType<typeof runTaskTool>) => {
	const result = await promise;
	return { ...result, body: JSON.parse(result.content) };
};

const render = (fragment: Parameters<PgDialect['sqlToQuery']>[0]) =>
	new PgDialect().sqlToQuery(fragment);

const food = {
	id: FOOD_ID,
	name: 'Greek yogurt',
	calories: 60,
	protein: 10,
	carbs: 4,
	fat: 0.5,
	fiber: 0
};

beforeEach(() => {
	for (const fn of Object.values(h)) fn.mockReset();
	h.validateMealType.mockResolvedValue(true);
	h.getFood.mockResolvedValue(food);
	h.execute.mockResolvedValue([{ ms: '1760252100000' }]);
	h.ledgerGetOrCreate.mockResolvedValue({ entryId: 'entry-1', created: true });
	h.createEntry.mockResolvedValue({ success: true, data: { id: 'entry-1' } });
	h.loadRun.mockResolvedValue({ proposal: null });
	h.eatenAtOnDate.mockReturnValue('ON_DATE');
});

describe('read tools', () => {
	test('search_foods trims fields, defaults and caps the limit', async () => {
		h.handleSearchFoods.mockResolvedValue({
			foods: [
				{
					...food,
					brand: 'B',
					servingSize: 100,
					servingUnit: 'g',
					labels: ['x'],
					recentlyUsed: true,
					imageUrl: 'u',
					fiber: 1,
					barcode: '1'
				}
			]
		});
		const first = await parsed(
			runTaskTool('search_foods', { query: 'yog', limit: null }, makeCtx())
		);
		expect(h.handleSearchFoods).toHaveBeenCalledWith('user-1', 'yog', 10);
		expect(first.body.foods[0]).not.toHaveProperty('imageUrl');
		expect(first.body.foods[0]).not.toHaveProperty('barcode');
		expect(first.body.foods[0]).toMatchObject({ name: 'Greek yogurt', recentlyUsed: true });
		await runTaskTool('search_foods', { query: 'yog', limit: 99 }, makeCtx());
		expect(h.handleSearchFoods).toHaveBeenLastCalledWith('user-1', 'yog', 20);
	});

	test('search_foods copes with an empty result', async () => {
		h.handleSearchFoods.mockResolvedValue({});
		expect((await parsed(runTaskTool('search_foods', { query: 'zzz' }, makeCtx()))).body).toEqual({
			foods: []
		});
	});

	test('list_recipes keeps the first 20 with four fields', async () => {
		h.handleListRecipes.mockResolvedValue({
			recipes: Array.from({ length: 30 }, (_, i) => ({
				id: `r${i}`,
				name: 'n',
				totalServings: 2,
				cookedWeight: null,
				calories: 5,
				stepCount: 3
			}))
		});
		const result = await parsed(runTaskTool('list_recipes', { query: '' }, makeCtx()));
		expect(h.handleListRecipes).toHaveBeenCalledWith('user-1', { query: undefined });
		expect(result.body.recipes).toHaveLength(20);
		expect(Object.keys(result.body.recipes[0]).sort()).toEqual([
			'cookedWeight',
			'id',
			'name',
			'totalServings'
		]);
		h.handleListRecipes.mockResolvedValue({});
		expect((await parsed(runTaskTool('list_recipes', { query: 'x' }, makeCtx()))).body).toEqual({
			recipes: []
		});
	});

	test('get_recipe returns per-serving macros', async () => {
		h.handleGetRecipe.mockResolvedValue({
			id: RECIPE_ID,
			name: 'Bowl',
			totalServings: 4,
			cookedWeight: 800,
			calories: 800,
			protein: 40,
			carbs: 100,
			fat: 20,
			fiber: 8,
			steps: ['a']
		});
		const result = await parsed(runTaskTool('get_recipe', { recipeId: RECIPE_ID }, makeCtx()));
		expect(result.body).toEqual({
			id: RECIPE_ID,
			name: 'Bowl',
			totalServings: 4,
			cookedWeight: 800,
			caloriesPerServing: 200,
			proteinPerServing: 10,
			carbsPerServing: 25,
			fatPerServing: 5,
			fiberPerServing: 2
		});
		h.handleGetRecipe.mockResolvedValue({ error: 'Recipe not found' });
		expect(
			(await parsed(runTaskTool('get_recipe', { recipeId: RECIPE_ID }, makeCtx()))).body
		).toEqual({
			error: 'Recipe not found'
		});
	});

	test('find_food_by_barcode drops images and ingredient text and rewrites the hint', async () => {
		h.handleFindFoodByBarcode.mockResolvedValue({
			found: true,
			source: 'openfoodfacts',
			name: 'Bar',
			calories: 100,
			imageUrl: 'http://x',
			ingredientsText: 'sugar',
			additives: [],
			categoriesTags: ['a'],
			nutriScore: 'a',
			novaGroup: 1,
			brand: null,
			hint: 'Use create_food'
		});
		const { body } = await parsed(
			runTaskTool('find_food_by_barcode', { barcode: '123' }, makeCtx())
		);
		expect(body).toEqual({
			found: true,
			source: 'openfoodfacts',
			name: 'Bar',
			calories: 100,
			hint: 'Log it as a quick entry with these per-serving values.'
		});
		h.handleFindFoodByBarcode.mockResolvedValue({ found: false });
		expect(
			(await parsed(runTaskTool('find_food_by_barcode', { barcode: '123' }, makeCtx()))).body
		).toEqual({
			found: false
		});
	});

	test('search_openfoodfacts is capped at five and trimmed', async () => {
		h.handleSearchOpenFoodFacts.mockResolvedValue({
			products: [{ name: 'p', calories: 1, imageUrl: 'x', ingredientsText: 'y' }],
			count: 1
		});
		const { body } = await parsed(
			runTaskTool('search_openfoodfacts', { query: 'bar', limit: 50 }, makeCtx())
		);
		expect(h.handleSearchOpenFoodFacts).toHaveBeenCalledWith('bar', 5);
		expect(body.products).toEqual([{ name: 'p', calories: 1 }]);
		await runTaskTool('search_openfoodfacts', { query: 'bar', limit: null }, makeCtx());
		expect(h.handleSearchOpenFoodFacts).toHaveBeenLastCalledWith('bar', 5);
		h.handleSearchOpenFoodFacts.mockResolvedValue({});
		expect(
			(await parsed(runTaskTool('search_openfoodfacts', { query: 'bar' }, makeCtx()))).body
		).toEqual({
			products: []
		});
	});
});

describe('errors', () => {
	test('invalid input becomes a validation error for the model', async () => {
		const result = await parsed(runTaskTool('search_foods', { query: '' }, makeCtx()));
		expect(result.isError).toBe(true);
		expect(result.body.error).toBe('validation_failed');
		expect(result.body.issues[0].path).toBe('query');
		expect(h.handleSearchFoods).not.toHaveBeenCalled();
	});

	test('handler failures and unknown tools are returned as tool errors', async () => {
		h.handleSearchFoods.mockRejectedValue(new McpUserError('Failed to search foods'));
		expect(await parsed(runTaskTool('search_foods', { query: 'x' }, makeCtx()))).toMatchObject({
			isError: true,
			body: { error: 'Failed to search foods' }
		});
		h.handleSearchFoods.mockRejectedValue(new ApiError(404, 'Food not found'));
		expect((await parsed(runTaskTool('search_foods', { query: 'x' }, makeCtx()))).body.error).toBe(
			'Food not found'
		);
		expect(await parsed(runTaskTool('nope', {}, makeCtx()))).toMatchObject({
			isError: true,
			body: { error: 'Unknown tool: nope' }
		});
	});

	test('server errors, lost leases and unexpected failures propagate', async () => {
		h.handleSearchFoods.mockRejectedValue(new ApiError(500, 'boom'));
		await expect(runTaskTool('search_foods', { query: 'x' }, makeCtx())).rejects.toThrow('boom');
		h.handleSearchFoods.mockRejectedValue(new TypeError('bug'));
		await expect(runTaskTool('search_foods', { query: 'x' }, makeCtx())).rejects.toThrow('bug');
		h.handleSearchFoods.mockRejectedValue(new LeaseLostError());
		await expect(runTaskTool('search_foods', { query: 'x' }, makeCtx())).rejects.toBeInstanceOf(
			LeaseLostError
		);
	});

	test('results are cut at 8000 characters', async () => {
		h.handleSearchFoods.mockResolvedValue({ foods: [{ name: 'x'.repeat(9000) }] });
		const result = await runTaskTool('search_foods', { query: 'x' }, makeCtx());
		expect(result.content).toHaveLength(8000);
	});
});

describe('terminal tools', () => {
	test('complete_ai_task completes through the outcome layer', async () => {
		h.completeByModel.mockResolvedValue('completed');
		const result = await runTaskTool('complete_ai_task', { resultSummary: 'Logged' }, makeCtx());
		expect(h.completeByModel).toHaveBeenCalledWith(
			{ fence, userId: 'user-1', taskId: 'task-1', locale: 'en' },
			'auto_log',
			'Logged'
		);
		expect(result).toEqual({ content: '{"success":true}', isError: false, outcome: 'completed' });
	});

	test('dismiss_ai_task dismisses through the outcome layer', async () => {
		h.dismissByModel.mockResolvedValue('dismissed');
		const result = await runTaskTool('dismiss_ai_task', { reason: 'No info' }, makeCtx());
		expect(h.dismissByModel).toHaveBeenCalledWith(
			expect.objectContaining({ taskId: 'task-1' }),
			'No info'
		);
		expect(result.outcome).toBe('dismissed');
	});

	test('an empty summary is rejected before anything happens', async () => {
		const result = await runTaskTool('complete_ai_task', { resultSummary: '' }, makeCtx());
		expect(result.isError).toBe(true);
		expect(h.completeByModel).not.toHaveBeenCalled();
	});
});

describe('log_food in auto mode', () => {
	test('writes the ledger and the entry in one fenced transaction', async () => {
		const result = await parsed(
			runTaskTool(
				'log_food',
				logInput({ foodId: FOOD_ID, servings: 2, quantityDescription: '200 g' }),
				makeCtx()
			)
		);
		expect(result.body).toEqual({ entryId: 'entry-1' });
		const [, key, summary] = h.ledgerGetOrCreate.mock.calls[0]!.slice(1);
		expect(key).toMatch(/^log:[0-9a-f]{64}:0$/);
		expect(summary).toBe('Greek yogurt (200 g)');
		expect(h.createEntry).toHaveBeenCalledWith(
			'user-1',
			expect.objectContaining({
				foodId: FOOD_ID,
				servings: 2,
				mealType: 'Lunch',
				date: '2026-10-12'
			}),
			null,
			{ id: 'entry-1', tx: TX }
		);
	});

	test('the task meal type wins over the model and the model fills a missing one', async () => {
		await runTaskTool(
			'log_food',
			logInput({ quickName: 'x', quickCalories: 1, mealType: 'Dinner' }),
			makeCtx()
		);
		expect(h.createEntry.mock.calls[0]![1].mealType).toBe('Lunch');
		const ctx = makeCtx({
			task: { id: 'task-1', date: '2026-10-12', mealType: null, eatenAt: null }
		});
		await runTaskTool(
			'log_food',
			logInput({ quickName: 'x', quickCalories: 1, mealType: 'dinner' }),
			ctx
		);
		expect(h.createEntry.mock.calls[1]![1].mealType).toBe('Dinner');
		expect(
			(await parsed(runTaskTool('log_food', logInput({ quickName: 'x', quickCalories: 1 }), ctx)))
				.body.error
		).toContain('mealType is required');
	});

	test('rejects invalid input, unknown meal types and foreign foods', async () => {
		expect((await runTaskTool('log_food', logInput({ servings: 0 }), makeCtx())).isError).toBe(
			true
		);
		expect(
			(await parsed(runTaskTool('log_food', logInput({ quickName: 'x' }), makeCtx()))).body.error
		).toBe('validation_failed');
		h.validateMealType.mockResolvedValue(false);
		expect(
			(
				await parsed(
					runTaskTool('log_food', logInput({ quickName: 'x', quickCalories: 5 }), makeCtx())
				)
			).body.error
		).toBe('Invalid meal type: Lunch');
		h.validateMealType.mockResolvedValue(true);
		h.getFood.mockResolvedValue(null);
		expect(
			(await parsed(runTaskTool('log_food', logInput({ foodId: FOOD_ID }), makeCtx()))).body.error
		).toBe('Food not found');
		h.getRecipe.mockResolvedValue(null);
		expect(
			(await parsed(runTaskTool('log_food', logInput({ recipeId: RECIPE_ID }), makeCtx()))).body
				.error
		).toBe('Recipe not found');
		expect(h.createEntry).not.toHaveBeenCalled();
	});

	test('a failed entry insert aborts the transaction and reaches the model', async () => {
		h.createEntry.mockResolvedValue({ success: false, error: new ApiError(400, 'Bad entry') });
		const result = await parsed(
			runTaskTool('log_food', logInput({ quickName: 'x', quickCalories: 5 }), makeCtx())
		);
		expect(result).toMatchObject({ isError: true, body: { error: 'Bad entry' } });
	});

	test('a replayed ledger key returns the existing entry without writing again', async () => {
		h.ledgerGetOrCreate.mockResolvedValue({ entryId: 'entry-0', created: false });
		const result = await parsed(
			runTaskTool('log_food', logInput({ quickName: 'x', quickCalories: 5 }), makeCtx())
		);
		expect(result.body).toEqual({ entryId: 'entry-0', alreadyLogged: true });
		expect(h.createEntry).not.toHaveBeenCalled();
	});

	test('identical items in one attempt get distinct occurrence keys; the time does not matter', async () => {
		const ctx = makeCtx();
		const input = logInput({ quickName: 'Egg', quickCalories: 70 });
		await runTaskTool('log_food', input, ctx);
		await runTaskTool('log_food', { ...input, eatenAt: '2026-10-12T09:00:00+02:00' }, ctx);
		await runTaskTool('log_food', logInput({ quickName: 'Egg', quickCalories: 71 }), ctx);
		const keys = h.ledgerGetOrCreate.mock.calls.map((call) => call[2] as string);
		expect(keys[0]!.endsWith(':0')).toBe(true);
		expect(keys[1]).toBe(keys[0]!.replace(/:0$/, ':1'));
		expect(keys[2]!.endsWith(':0')).toBe(true);
		expect(keys[2]!.slice(0, -2)).not.toBe(keys[0]!.slice(0, -2));
	});

	test('summarizes servings when there is no description', async () => {
		await runTaskTool('log_food', logInput({ foodId: FOOD_ID, servings: 1.5 }), makeCtx());
		expect(h.ledgerGetOrCreate.mock.calls[0]![3]).toBe('1.5 servings Greek yogurt');
	});
});

describe('eatenAt', () => {
	const eatenAtOf = () => h.createEntry.mock.calls.at(-1)![1].eatenAt as string;

	test('the task time is forced', async () => {
		const ctx = makeCtx({
			task: {
				id: 'task-1',
				date: '2026-10-12',
				mealType: 'Lunch',
				eatenAt: new Date('2026-10-12T07:15:00Z')
			}
		});
		await runTaskTool(
			'log_food',
			logInput({ quickName: 'x', quickCalories: 1, eatenAt: '2026-10-12T09:00:00+02:00' }),
			ctx
		);
		expect(eatenAtOf()).toBe('2026-10-12T07:15:00.000Z');
		expect(h.execute).not.toHaveBeenCalled();
	});

	test("the model's time keeps its wall clock on the task date", async () => {
		await runTaskTool(
			'log_food',
			logInput({ quickName: 'x', quickCalories: 1, eatenAt: '2026-10-01T18:00:00+02:00' }),
			makeCtx()
		);
		expect(h.eatenAtOnDate).toHaveBeenCalledWith(expect.anything(), '2026-10-12', 'Europe/Zurich');
		expect(eatenAtOf()).toBe(new Date(1760252100000).toISOString());
	});

	test('a malformed model time is a tool error', async () => {
		const result = await parsed(
			runTaskTool(
				'log_food',
				logInput({ quickName: 'x', quickCalories: 1, eatenAt: 'lunchtime' }),
				makeCtx()
			)
		);
		expect(result.body.error).toContain('ISO 8601');
		expect(h.createEntry).not.toHaveBeenCalled();
	});

	test.each([
		['Breakfast', '08:00'],
		['Lunch', '12:30'],
		['Dinner', '19:00'],
		['Snacks', '15:30'],
		['Brunch', '12:00']
	])('%s defaults to %s in the user time zone', async (mealType, time) => {
		const ctx = makeCtx({ task: { id: 'task-1', date: '2026-10-12', mealType, eatenAt: null } });
		await runTaskTool('log_food', logInput({ quickName: 'x', quickCalories: 1 }), ctx);
		const query = render(h.execute.mock.calls.at(-1)![0]);
		expect(query.params).toEqual(['2026-10-12', time, 'Europe/Zurich']);
	});
});

describe('meal type normalization', () => {
	const ctxFor = (mealType: string) =>
		makeCtx({ task: { id: 'task-1', date: '2026-10-12', mealType, eatenAt: null } });
	const input = logInput({ quickName: 'x', quickCalories: 1 });

	test('uses the normalized meal type for the default time and the ledger key', async () => {
		await runTaskTool('log_food', input, ctxFor('lunch'));
		await runTaskTool('log_food', input, ctxFor('Lunch'));
		expect(render(h.execute.mock.calls[0]![0]).params).toEqual([
			'2026-10-12',
			'12:30',
			'Europe/Zurich'
		]);
		const [first, second] = h.ledgerGetOrCreate.mock.calls.map((call) => call[2]);
		expect(first).toBe(second);
	});
});

describe('log_food in review mode', () => {
	const review = () => makeCtx({ mode: 'review' });
	const appended = () => h.transitionFenced.mock.calls.at(-1)![2].proposal.items.at(-1);

	test('records a food suggestion with item totals and writes no entry', async () => {
		const result = await parsed(
			runTaskTool(
				'log_food',
				logInput({ foodId: FOOD_ID, servings: 2, quantityDescription: '200 g' }),
				review()
			)
		);
		expect(result.body.proposalItemId).toMatch(/^[0-9a-f-]{36}$/);
		expect(h.createEntry).not.toHaveBeenCalled();
		expect(h.ledgerGetOrCreate).not.toHaveBeenCalled();
		expect(appended()).toMatchObject({
			id: result.body.proposalItemId,
			name: 'Greek yogurt',
			quantityDescription: '200 g',
			foodId: FOOD_ID,
			recipeId: null,
			servings: 2,
			calories: 120,
			protein: 20,
			carbs: 8,
			fat: 1,
			fiber: 0
		});
		expect(appended().entry).toMatchObject({ foodId: FOOD_ID, mealType: 'Lunch', servings: 2 });
	});

	test('derives recipe totals from per-serving macros', async () => {
		h.getRecipe.mockResolvedValue({
			name: 'Bowl',
			totalServings: 4,
			calories: 800,
			protein: 40,
			carbs: 100,
			fat: 20,
			fiber: 8
		});
		await runTaskTool('log_food', logInput({ recipeId: RECIPE_ID, servings: 1.5 }), review());
		expect(appended()).toMatchObject({
			name: 'Bowl',
			recipeId: RECIPE_ID,
			calories: 300,
			protein: 15,
			carbs: 37.5,
			fat: 7.5,
			fiber: 3
		});
	});

	test('uses the quick values for one-off estimates and appends to an existing proposal', async () => {
		h.loadRun.mockResolvedValue({
			proposal: { summary: null, items: [{ id: 'old' }] }
		});
		await runTaskTool(
			'log_food',
			logInput({
				quickName: 'Pasta',
				quickCalories: 500,
				quickProtein: 15,
				quickCarbs: 80,
				quickFat: 10,
				quickFiber: 5,
				servings: 2
			}),
			review()
		);
		const proposal = h.transitionFenced.mock.calls[0]![2].proposal;
		expect(proposal.items).toHaveLength(2);
		expect(proposal.items[0]).toEqual({ id: 'old' });
		expect(proposal.items[1]).toMatchObject({
			name: 'Pasta',
			calories: 1000,
			protein: 30,
			carbs: 160,
			fat: 20,
			fiber: 10
		});
	});

	test('treats a quick entry without macros as zero', async () => {
		await runTaskTool('log_food', logInput({ quickName: 'Water', quickCalories: 1 }), review());
		expect(appended()).toMatchObject({ calories: 1, protein: 0, fiber: 0 });
	});
});

describe('TASK_TOOLS', () => {
	test('has a definition for every tool the executor handles', () => {
		expect(TASK_TOOLS).toHaveLength(8);
	});
});
