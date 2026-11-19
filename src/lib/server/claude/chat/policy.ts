import { change, type ChatChange } from './changes';

export type ChangeLookup = {
	today: () => Promise<string>;
	entryDate: (id: unknown) => Promise<string | null>;
};

export type ChangeContext = {
	input: Record<string, unknown>;
	result: Record<string, unknown> | null;
	entryDateBefore: string | null;
	lookup: ChangeLookup;
};

type Changes = (context: ChangeContext) => ChatChange[] | Promise<ChatChange[]>;

export type ChatToolPolicy =
	| { kind: 'excluded'; reason: string }
	| { kind: 'read' }
	| { kind: 'write' | 'confirm'; changes: Changes; readsEntryBefore?: boolean };

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const strings = (value: unknown): string[] =>
	Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const blocked = (result: Record<string, unknown> | null) => result?.blocked === true;
const dateOr = async (value: unknown, lookup: ChangeLookup) => str(value) ?? (await lookup.today());

const READ: ChatToolPolicy = { kind: 'read' };

const write = (changes: Changes, readsEntryBefore = false): ChatToolPolicy => ({
	kind: 'write',
	changes,
	readsEntryBefore
});

const confirm = (changes: Changes, readsEntryBefore = false): ChatToolPolicy => ({
	kind: 'confirm',
	changes,
	readsEntryBefore
});

const AI_TASK_QUEUE =
	'The AI task queue is processed by its own pipeline (the connected assistant, the iPhone or the Claude worker). Chat neither reads nor resolves queued tasks, so it can never race that processing or log a queued meal twice.';
const LABEL_SWEEP =
	'Bulk labelling is a long mechanical sweep over the whole food or recipe database that would exceed a chat run’s iteration cap and budget; it runs through the label_foods MCP prompt instead. Single foods and recipes stay labellable with set_food_labels and set_recipe_labels.';

/**
 * How chat treats every MCP tool. read and write tools run as soon as the model
 * calls them; confirm tools (destructive, bulk or irreversible) wait for the
 * user's approval; excluded tools are never offered. chat-policy.test.ts fails
 * when an MCP tool is missing here.
 */
export const CHAT_TOOL_POLICY: Record<string, ChatToolPolicy> = {
	get_daily_status: READ,
	search_foods: READ,
	create_food: write(({ result }) => [change('foods', { ids: [str(result?.foodId)] })]),
	update_food: write(({ input }) => [change('foods', { ids: [str(input.foodId)] })]),
	delete_food: confirm(({ input, result }) =>
		blocked(result)
			? []
			: [
					change('foods', { ids: [str(input.foodId)] }),
					change('recipes'),
					change('supplements'),
					...(input.force === true ? [change('entries')] : [])
				]
	),
	merge_foods: confirm(({ input }) => [
		change('foods', { ids: [str(input.keeperId), ...strings(input.sourceIds)] }),
		change('entries'),
		change('recipes'),
		change('supplements'),
		change('labels')
	]),
	find_duplicate_foods: READ,
	list_recent_foods: READ,
	create_recipe: write(({ result }) => [change('recipes', { ids: [str(result?.recipeId)] })]),
	update_recipe: write(({ input }) => [change('recipes', { ids: [str(input.recipeId)] })]),
	delete_recipe: confirm(({ input, result }) =>
		blocked(result)
			? []
			: [
					change('recipes', { ids: [str(input.recipeId)] }),
					...(input.force === true ? [change('entries')] : [])
				]
	),
	log_food: write(async ({ result, lookup }) => [
		change('entries', { dates: [await lookup.entryDate(result?.entryId)] })
	]),
	get_supplement_status: READ,
	log_supplement: write(async ({ input, result, lookup }) => {
		const logged = result?.logged as { date?: unknown } | undefined;
		return [
			change('supplements', { ids: [str(input.supplementId)] }),
			change('entries', { dates: [str(logged?.date) ?? (await dateOr(input.date, lookup))] })
		];
	}),
	create_supplement: write(({ result }) => [
		change('supplements', { ids: [str(result?.supplementId)] })
	]),
	list_supplements: READ,
	update_supplement: write(({ input }) => [
		change('supplements', { ids: [str(input.supplementId)] })
	]),
	delete_supplement: confirm(({ input }) => [
		change('supplements', { ids: [str(input.supplementId)] })
	]),
	unlog_supplement: confirm(async ({ input, lookup }) => [
		change('supplements', { ids: [str(input.supplementId)] }),
		change('entries', { dates: [await dateOr(input.date, lookup)] })
	]),
	list_entries: READ,
	update_entry: write(
		async ({ input, entryDateBefore, lookup }) => [
			change('entries', { dates: [entryDateBefore, await lookup.entryDate(input.entryId)] })
		],
		true
	),
	delete_entry: confirm(
		({ entryDateBefore }) => [change('entries', { dates: [entryDateBefore] })],
		true
	),
	get_goals: READ,
	update_goals: write(() => [change('goals')]),
	list_recipes: READ,
	get_recipe: READ,
	get_food: READ,
	list_favorites: READ,
	log_weight: write(({ result }) => [change('weight', { dates: [str(result?.date)] })]),
	update_weight: write(({ input }) => [change('weight', { ids: [str(input.weightId)] })]),
	delete_weight: confirm(({ input }) => [change('weight', { ids: [str(input.weightId)] })]),
	get_weight: READ,
	get_weekly_stats: READ,
	get_monthly_stats: READ,
	get_daily_breakdown: READ,
	get_meal_breakdown: READ,
	get_top_foods: READ,
	get_streaks: READ,
	get_maintenance_calories: READ,
	copy_entries: confirm(async ({ input, lookup }) => [
		change('entries', { dates: [await dateOr(input.toDate, lookup)] })
	]),
	find_food_by_barcode: READ,
	search_openfoodfacts: READ,
	log_sleep: write(async ({ input, lookup }) => [
		change('sleep', { dates: [await dateOr(input.date, lookup)] })
	]),
	get_sleep: READ,
	update_sleep: write(({ input }) => [change('sleep', { ids: [str(input.id)] })]),
	delete_sleep: confirm(({ input }) => [change('sleep', { ids: [str(input.id)] })]),
	get_food_diversity: READ,
	get_meal_timing: READ,
	get_sleep_food_correlation: READ,
	get_weight_food_series: READ,
	get_extended_nutrients: READ,
	get_daily_nutrients: READ,
	get_nutrient_gaps: READ,
	find_nutrient_sources: READ,
	get_eating_patterns: READ,
	get_meal_plan_context: READ,
	list_meal_types: READ,
	get_supplement_history: READ,
	get_day_properties: READ,
	set_day_properties: write(({ input }) => [change('dayProperties', { dates: [str(input.date)] })]),
	delete_day_properties: confirm(({ input }) => [
		change('dayProperties', { dates: [str(input.date)] })
	]),
	get_calendar_stats: READ,
	list_unlabeled_foods: { kind: 'excluded', reason: LABEL_SWEEP },
	list_labels: READ,
	set_food_labels: write(({ input }) => [
		change('labels'),
		change('foods', { ids: [str(input.foodId)] })
	]),
	set_food_labels_batch: { kind: 'excluded', reason: LABEL_SWEEP },
	list_unlabeled_recipes: { kind: 'excluded', reason: LABEL_SWEEP },
	set_recipe_labels: write(({ input }) => [
		change('labels'),
		change('recipes', { ids: [str(input.recipeId)] })
	]),
	set_recipe_labels_batch: { kind: 'excluded', reason: LABEL_SWEEP },
	list_ai_tasks: { kind: 'excluded', reason: AI_TASK_QUEUE },
	get_ai_task: { kind: 'excluded', reason: AI_TASK_QUEUE },
	complete_ai_task: { kind: 'excluded', reason: AI_TASK_QUEUE },
	dismiss_ai_task: { kind: 'excluded', reason: AI_TASK_QUEUE }
};

export const chatToolPolicy = (name: string): ChatToolPolicy | null =>
	Object.hasOwn(CHAT_TOOL_POLICY, name) ? CHAT_TOOL_POLICY[name]! : null;
