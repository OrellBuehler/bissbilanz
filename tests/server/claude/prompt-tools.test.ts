import { createHash } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';

vi.mock('$lib/server/mcp/handlers', () => ({}));
vi.mock('$lib/server/db', () => ({ getDB: vi.fn() }));

import {
	TASK_SYSTEM,
	TASK_SYSTEM_PROMPT,
	buildTaskUserContent
} from '$lib/server/claude/tasks/prompt';
import { TASK_TOOLS } from '$lib/server/claude/tasks/tools';

const ALLOWED_SCHEMA_KEYS = new Set([
	'type',
	'properties',
	'required',
	'enum',
	'description',
	'additionalProperties',
	'anyOf'
]);

describe('TASK_TOOLS', () => {
	test('exposes exactly the task tools', () => {
		expect(TASK_TOOLS.map((tool) => tool.name)).toEqual([
			'search_foods',
			'list_recipes',
			'get_recipe',
			'find_food_by_barcode',
			'search_openfoodfacts',
			'log_food',
			'complete_ai_task',
			'dismiss_ai_task'
		]);
	});

	test.each(TASK_TOOLS.map((tool) => [tool.name, tool] as const))(
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

	test('only the last tool and the system block carry a cache breakpoint', () => {
		expect(TASK_TOOLS.at(-1)?.cache_control).toEqual({ type: 'ephemeral' });
		expect(TASK_TOOLS.slice(0, -1).some((tool) => tool.cache_control)).toBe(false);
		expect(TASK_SYSTEM).toHaveLength(1);
		expect(TASK_SYSTEM[0]).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } });
		expect(TASK_SYSTEM[0]!.text).toBe(TASK_SYSTEM_PROMPT);
	});

	test('optional inputs are nullable through anyOf instead of omitted', () => {
		const log = TASK_TOOLS.find((tool) => tool.name === 'log_food')!;
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
		expect(TASK_TOOLS.some((tool) => hasTypeArray(tool.input_schema))).toBe(false);
	});
});

describe('prompt and tools are byte-stable', () => {
	const serialized = JSON.stringify({ system: TASK_SYSTEM, tools: TASK_TOOLS });

	test('contain no dates, ids or user data', () => {
		expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}/);
		expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
	});

	test('do not mention tools that do not exist here', () => {
		for (const forbidden of [
			'create_food',
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
			'servings'
		]) {
			expect(TASK_SYSTEM_PROMPT).toContain(needle);
		}
	});

	test('stay identical to the reviewed text', () => {
		expect(createHash('sha256').update(serialized).digest('hex')).toMatchInlineSnapshot(
			`"60d139dde0b356c339d71032f0ebc3de13a482bb31305cda50805f1a1fd8c887"`
		);
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
