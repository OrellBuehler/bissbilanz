import { createHash } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';

vi.mock('$lib/server/mcp/handlers', () => ({}));
vi.mock('$lib/server/db', () => ({ getDB: vi.fn() }));

import {
	buildTaskUserContent,
	capabilitiesOf,
	taskSystem,
	taskSystemPrompt
} from '$lib/server/claude/tasks/prompt';
import { taskTools } from '$lib/server/claude/tasks/tools';
import {
	DEFAULT_ASSISTANT_OPTIONS,
	type AssistantOptions
} from '$lib/server/claude/assistant-options';

const TASK_SYSTEM = taskSystem(DEFAULT_ASSISTANT_OPTIONS, taskTools(true));
const TASK_SYSTEM_PROMPT = TASK_SYSTEM[0]!.text;

const TOOL_LISTS = [
	['with the nutrient database', taskTools(true)],
	['without the nutrient database', taskTools(false)]
] as const;
const ALL_TOOLS = TOOL_LISTS.flatMap(([, tools]) => tools);

const ALLOWED_SCHEMA_KEYS = new Set([
	'type',
	'properties',
	'required',
	'enum',
	'description',
	'additionalProperties',
	'anyOf',
	'items'
]);

describe('task tools', () => {
	test('exposes exactly the task tools, with the database search only when configured', () => {
		const names = [
			'search_foods',
			'list_recipes',
			'get_recipe',
			'find_food_by_barcode',
			'search_openfoodfacts',
			'create_food',
			'log_food',
			'complete_ai_task',
			'dismiss_ai_task'
		];
		expect(taskTools(false).map((tool) => tool.name)).toEqual(names);
		expect(taskTools(true).map((tool) => tool.name)).toEqual([
			...names.slice(0, 5),
			'search_nutrient_database',
			...names.slice(5)
		]);
	});

	test.each(ALL_TOOLS.map((tool) => [tool.name, tool] as const))(
		'%s is a strict tool with a closed schema listing every property as required',
		(_name, tool) => {
			expect(tool.strict).toBe(true);
			const schema = tool.input_schema;
			expect(schema.type).toBe('object');
			expect(schema.additionalProperties).toBe(false);
			const properties = Object.keys(schema.properties as Record<string, unknown>);
			expect([...(schema.required ?? [])].sort()).toEqual([...properties].sort());
			expect(Object.keys(schema).every((key) => ALLOWED_SCHEMA_KEYS.has(key))).toBe(true);
			for (const property of Object.values(
				schema.properties as Record<string, Record<string, unknown>>
			)) {
				expect(Object.keys(property).every((key) => ALLOWED_SCHEMA_KEYS.has(key))).toBe(true);
				expect(property.description).toEqual(expect.any(String));
			}
		}
	);

	test.each(TOOL_LISTS)(
		'only the last tool %s and the system block carry a cache breakpoint',
		(_label, tools) => {
			expect(tools.at(-1)?.cache_control).toEqual({ type: 'ephemeral' });
			expect(tools.slice(0, -1).some((tool) => tool.cache_control)).toBe(false);
			expect(TASK_SYSTEM).toHaveLength(1);
			expect(TASK_SYSTEM[0]).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } });
		}
	);

	test('optional inputs are nullable through anyOf instead of omitted', () => {
		const log = taskTools(true).find((tool) => tool.name === 'log_food')!;
		const properties = log.input_schema.properties as Record<string, Record<string, unknown>>;
		expect(properties.foodId!.anyOf).toEqual([{ type: 'string' }, { type: 'null' }]);
		expect(properties.quickCalories!.anyOf).toEqual([{ type: 'number' }, { type: 'null' }]);
		expect(properties.servings!.type).toBe('number');
	});

	test('no schema uses a type array', () => {
		const hasTypeArray = (value: unknown): boolean =>
			Array.isArray(value)
				? value.some(hasTypeArray)
				: value !== null && typeof value === 'object'
					? Object.entries(value).some(
							([key, inner]) => (key === 'type' && Array.isArray(inner)) || hasTypeArray(inner)
						)
					: false;
		expect(ALL_TOOLS.some((tool) => hasTypeArray(tool.input_schema))).toBe(false);
	});
});

describe('prompt and tools are byte-stable', () => {
	const serialized = JSON.stringify({
		system: TASK_SYSTEM,
		withDatabase: taskTools(true),
		withoutDatabase: taskTools(false)
	});

	test('contain no dates, ids or user data', () => {
		expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}/);
		expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
	});

	test('do not mention tools that do not exist here', () => {
		for (const forbidden of [
			'list_meal_types',
			'supplement',
			'set_food_labels',
			'set_recipe_labels',
			'update_food',
			'delete_',
			'log_weight',
			'mcp'
		]) {
			expect(serialized.toLowerCase()).not.toContain(forbidden);
		}
	});

	test('describe the workflow the loop relies on', () => {
		for (const needle of [
			'complete_ai_task',
			'dismiss_ai_task',
			'AUTO_LOG',
			'REVIEW',
			'cookedWeight',
			'servings',
			'search_nutrient_database',
			'fdcId',
			'never from memory',
			'Open Food Facts',
			'where its nutrition came from'
		]) {
			expect(TASK_SYSTEM_PROMPT).toContain(needle);
		}
	});

	test('the tool lists and prompts are built once, so the cached prefix never changes', () => {
		expect(taskTools(true)).toBe(taskTools(true));
		expect(taskTools(false)).toBe(taskTools(false));
		expect(taskSystem(DEFAULT_ASSISTANT_OPTIONS, taskTools(true))).toBe(TASK_SYSTEM);
		expect(taskSystem({ ...DEFAULT_ASSISTANT_OPTIONS }, taskTools(true))).toBe(TASK_SYSTEM);
		expect(taskSystem(DEFAULT_ASSISTANT_OPTIONS, taskTools(false))).not.toBe(TASK_SYSTEM);
	});

	test('stay identical to the reviewed text', () => {
		expect(createHash('sha256').update(serialized).digest('hex')).toMatchInlineSnapshot(
			`"d784885af065799cb5c8480db1ab962b72324f60260bddff5fa9ed57aafa9ded"`
		);
	});
});

const booleans = [true, false];
const optionSets: AssistantOptions[] = booleans.flatMap((researchNutrients) =>
	booleans.flatMap((webResearch) =>
		booleans.flatMap((realServings) =>
			booleans.map((createFoods) => ({ researchNutrients, webResearch, realServings, createFoods }))
		)
	)
);
const toolSets = booleans.flatMap((database) =>
	booleans.map((createFoods) => ({ database, createFoods }))
);

describe('the system prompt follows the options and the tools', () => {
	const promptFor = (
		options: AssistantOptions,
		caps: { database: boolean; web: boolean; createFoods: boolean }
	) =>
		taskSystemPrompt(options, {
			nutrientDatabase: caps.database,
			webSearch: caps.web,
			webFetch: caps.web,
			createFoods: caps.createFoods
		});

	test.each(optionSets)('%j', (options) => {
		for (const database of booleans) {
			for (const web of booleans) {
				const prompt = promptFor(options, { database, web, createFoods: options.createFoods });
				expect(prompt.includes('search_nutrient_database')).toBe(database && options.createFoods);
				expect(prompt.includes('web search')).toBe(web);
				expect(prompt.includes('create_food')).toBe(options.createFoods);
				expect(prompt).toContain('complete_ai_task');
				expect(prompt).toContain('Only the tools listed here exist.');
				expect(prompt.replace(/AUTO_LOG|REVIEW/g, '')).not.toMatch(/\b[A-Z]{5,}\b/);
				if (!options.createFoods) {
					expect(prompt).toContain('switched off for this user');
					expect(prompt).not.toContain('## Micronutrients');
					expect(prompt).not.toContain('## Units and serving sizes');
					continue;
				}
				expect(prompt.includes('fdcId')).toBe(database);
				expect(prompt.includes('Swiss Food Composition Database')).toBe(web);
				expect(prompt.includes('No web tool is listed')).toBe(!web);
				expect(prompt.includes('The user wants the vitamins and minerals')).toBe(
					options.researchNutrients
				);
				expect(prompt.includes('turned micronutrient research off')).toBe(
					!options.researchNutrients
				);
				expect(prompt).toContain('What the user writes about research wins');
				expect(prompt.includes('A single-serve container is one serving')).toBe(
					options.realServings
				);
				expect(prompt.includes('servingSize 100, with the figures as printed')).toBe(
					!options.realServings
				);
				expect(prompt).toContain('a liquid is stored in ml');
				expect(prompt).toContain('Unknown stays empty');
			}
		}
	});

	test('names the unit rule, the serving order and worked examples', () => {
		const prompt = promptFor(DEFAULT_ASSISTANT_OPTIONS, {
			database: true,
			web: true,
			createFoods: true
		});
		for (const needle of [
			'a liquid is stored in ml',
			'330 ml can is servingSize 330 with ml',
			'"1 slice (67 g)"',
			'Only when the label states no serving',
			'servingSize 67, g, calories 167.5',
			'servings = amount eaten divided by servingSize',
			'a proxy never passes as a measurement',
			'Never fill a gap from memory',
			'Swiss Food Composition Database (naehrwertdaten.ch)',
			'Report what create_food says was stored'
		]) {
			expect(prompt, needle).toContain(needle);
		}
	});

	test('keeps every food on 100 when real servings are off', () => {
		const prompt = promptFor(
			{ ...DEFAULT_ASSISTANT_OPTIONS, realServings: false },
			{ database: true, web: true, createFoods: true }
		);
		expect(prompt).toContain('A whole 330 ml can is 3.3 servings');
		expect(prompt).not.toContain('single-serve container');
		expect(prompt).toContain('a liquid is stored in ml');
	});

	test('reads the capabilities off the tools a request declares', () => {
		expect(capabilitiesOf(taskTools(true))).toEqual({
			nutrientDatabase: true,
			webSearch: false,
			webFetch: false,
			createFoods: true
		});
		expect(capabilitiesOf(taskTools(false, false))).toMatchObject({
			nutrientDatabase: false,
			createFoods: false
		});
		expect(
			capabilitiesOf([
				{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
				{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 },
				...taskTools(false)
			])
		).toMatchObject({ webSearch: true, webFetch: true });
	});

	test.each(toolSets)('a prompt is built once per set of options and tools: %j', (set) => {
		const tools = taskTools(set.database, set.createFoods);
		const first = taskSystem(DEFAULT_ASSISTANT_OPTIONS, tools);
		expect(taskSystem(DEFAULT_ASSISTANT_OPTIONS, tools)).toBe(first);
		expect(first[0]).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } });
		expect(first[0]!.text).toBe(taskSystemPrompt(DEFAULT_ASSISTANT_OPTIONS, capabilitiesOf(tools)));
	});

	test('contains no dates or ids in any combination', () => {
		for (const options of optionSets) {
			const prompt = promptFor(options, { database: true, web: true, createFoods: true });
			expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}/);
			expect(prompt).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
		}
	});
});

describe('buildTaskUserContent', () => {
	const base = {
		description: 'Two eggs',
		date: '2026-10-12',
		mealType: null,
		eatenAt: null
	};
	const ctx = {
		mode: 'auto_log' as const,
		locale: 'en',
		timeZone: 'Europe/Zurich',
		mealTypes: ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Brunch'],
		photos: [] as (string | null)[],
		alreadyLogged: [] as string[]
	};
	const textOf = (content: ReturnType<typeof buildTaskUserContent>) =>
		(content.at(-1) as { text: string }).text;

	test('puts images before the single text block', () => {
		const content = buildTaskUserContent(base, { ...ctx, photos: ['AAA', null, 'BBB'] });
		expect(content.map((block) => block.type)).toEqual(['image', 'image', 'text']);
		expect(content[0]).toEqual({
			type: 'image',
			source: { type: 'base64', media_type: 'image/webp', data: 'AAA' }
		});
		const text = textOf(content);
		expect(text).toContain('Photos: 2 attached');
		expect(text).toContain('Photo 2 is unavailable.');
	});

	test('describes an open task', () => {
		const text = textOf(buildTaskUserContent({ ...base, description: null }, ctx));
		expect(text).toBe(
			[
				'Mode: AUTO_LOG',
				'Language: English',
				'Date: 2026-10-12   Time zone: Europe/Zurich',
				'Meal type: not set (choose one of: Breakfast, Lunch, Dinner, Snacks, Brunch)',
				'Eaten at: not set (pass a plausible eatenAt on the date, ISO 8601 with offset)',
				'Description: none',
				'Photos: 0 attached',
				'Already logged in an earlier attempt (do not log again): nothing'
			].join('\n')
		);
	});

	test('describes a fixed task in the user language and time zone', () => {
		const content = buildTaskUserContent(
			{ ...base, mealType: 'Lunch', eatenAt: new Date('2026-10-12T10:30:00Z') },
			{ ...ctx, mode: 'review', locale: 'de', alreadyLogged: ['Toast (1 slice)', '2 servings Egg'] }
		);
		const text = textOf(content);
		expect(text).toContain('Mode: REVIEW');
		expect(text).toContain('Language: German');
		expect(text).toContain('Meal type: Lunch');
		expect(text).toContain('Eaten at: 2026-10-12T12:30:00+02:00');
		expect(text).toContain('Description: Two eggs');
		expect(text).toContain('(do not log again): Toast (1 slice); 2 servings Egg');
	});

	test('renders offsets for winter time and UTC', () => {
		const winter = textOf(
			buildTaskUserContent({ ...base, eatenAt: new Date('2026-01-12T11:30:00Z') }, ctx)
		);
		expect(winter).toContain('Eaten at: 2026-01-12T12:30:00+01:00');
		const utc = textOf(
			buildTaskUserContent(
				{ ...base, eatenAt: new Date('2026-01-12T11:30:00Z') },
				{ ...ctx, timeZone: 'UTC' }
			)
		);
		expect(utc).toContain('Eaten at: 2026-01-12T11:30:00+00:00');
	});
});
