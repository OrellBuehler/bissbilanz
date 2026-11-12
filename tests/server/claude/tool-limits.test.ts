import { describe, expect, test, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

vi.mock('$lib/server/db', () => ({ getDB: vi.fn() }));
vi.mock('$lib/server/mcp/handlers', () => ({}));
vi.mock('$lib/server/claude/config', () => ({
	claudeConfig: () => ({ model: 'claude-opus-5-5', maxWebSearches: 3, maxWebFetches: 3 }),
	isClaudeConfigured: () => true
}));

const { firstRunTools } = await import('$lib/server/claude/tasks/processor');
const { correctionRunTools } = await import('$lib/server/claude/tasks/correction');
const { CLAUDE_MODELS } = await import('$lib/server/claude/models');

// https://platform.claude.com/docs/en/build-with-claude/structured-outputs
// ("Schema complexity limits"): totals across all strict schemas in one request.
const MAX_STRICT_TOOLS = 20;
const MAX_OPTIONAL_PARAMETERS = 24;
const MAX_UNION_PARAMETERS = 16;
// What production has run with; the documented limit is not a safe target,
// because further internal grammar limits apply on top of it.
const PROVEN_UNION_PARAMETERS = 15;

// Keywords the strict JSON Schema subset rejects.
const UNSUPPORTED = [
	'minimum',
	'maximum',
	'exclusiveMinimum',
	'exclusiveMaximum',
	'multipleOf',
	'minLength',
	'maxLength',
	'maxItems',
	'$ref'
];

type Schema = Record<string, unknown>;

const isUnion = (schema: Schema) => Array.isArray(schema.anyOf) || Array.isArray(schema.type);

/** Calls visit for every parameter of the schema, nested ones included. */
function walk(schema: Schema, visit: (parameter: Schema, required: boolean) => void) {
	const required = new Set((schema.required as string[] | undefined) ?? []);
	for (const [key, parameter] of Object.entries(
		(schema.properties as Record<string, Schema> | undefined) ?? {}
	)) {
		visit(parameter, required.has(key));
		walk(parameter, visit);
	}
	if (schema.items) walk(schema.items as Schema, visit);
	for (const branch of (schema.anyOf as Schema[] | undefined) ?? []) walk(branch, visit);
}

function objects(schema: Schema): Schema[] {
	const nested = [
		...Object.values((schema.properties as Record<string, Schema> | undefined) ?? {}),
		...(schema.items ? [schema.items as Schema] : []),
		...((schema.anyOf as Schema[] | undefined) ?? [])
	].flatMap(objects);
	return schema.type === 'object' ? [schema, ...nested] : nested;
}

function keywords(schema: Schema): string[] {
	return Object.entries(schema).flatMap(([key, value]) => [
		key,
		...(value && typeof value === 'object' && !Array.isArray(value)
			? key === 'properties'
				? Object.values(value as Record<string, Schema>).flatMap(keywords)
				: keywords(value as Schema)
			: Array.isArray(value)
				? value.filter((item) => item && typeof item === 'object').flatMap(keywords)
				: [])
	]);
}

function measure(tools: Anthropic.ToolUnion[]) {
	const strict = tools.filter(
		(tool): tool is Anthropic.Tool => 'strict' in tool && tool.strict === true
	);
	let optional = 0;
	let unions = 0;
	for (const tool of strict) {
		walk(tool.input_schema as Schema, (parameter, required) => {
			if (!required) optional++;
			if (isUnion(parameter)) unions++;
		});
	}
	return { strictTools: strict.length, optional, unions, strict };
}

const shapes = CLAUDE_MODELS.flatMap(({ id }) =>
	[true, false].flatMap((database) => [
		{ request: 'first run', model: id, database, tools: firstRunTools(id, database) },
		{ request: 'correction', model: id, database, tools: correctionRunTools(id, database) }
	])
);

describe('strict tool schemas stay inside the API complexity limits', () => {
	test('there is a shape for every selectable model, both requests and both databases', () => {
		expect(shapes.length).toBe(CLAUDE_MODELS.length * 4);
	});

	test.each(shapes)('$request, $model, nutrient database $database', ({ tools }) => {
		const { strictTools, optional, unions, strict } = measure(tools);
		expect(strictTools).toBeLessThanOrEqual(MAX_STRICT_TOOLS);
		expect(optional).toBeLessThanOrEqual(MAX_OPTIONAL_PARAMETERS);
		expect(unions).toBeLessThanOrEqual(MAX_UNION_PARAMETERS);
		expect(unions).toBeLessThanOrEqual(PROVEN_UNION_PARAMETERS);
		for (const tool of strict) {
			for (const object of objects(tool.input_schema as Schema)) {
				expect(object.additionalProperties, `${tool.name}`).toBe(false);
			}
			expect(
				keywords(tool.input_schema as Schema).filter((key) => UNSUPPORTED.includes(key)),
				tool.name
			).toEqual([]);
		}
	});

	test('the counts are the ones the limits were checked against', () => {
		const counts = (tools: Anthropic.ToolUnion[]) => {
			const { strictTools, optional, unions } = measure(tools);
			return { strictTools, optional, unions };
		};
		expect(counts(firstRunTools('claude-opus-5-5', false))).toEqual({
			strictTools: 9,
			optional: 0,
			unions: 15
		});
		expect(counts(firstRunTools('claude-opus-5-5', true))).toEqual({
			strictTools: 10,
			optional: 0,
			unions: 15
		});
		expect(counts(correctionRunTools('claude-opus-5-5', false))).toEqual({
			strictTools: 9,
			optional: 0,
			unions: 4
		});
		expect(counts(correctionRunTools('claude-opus-5-5', true))).toEqual({
			strictTools: 10,
			optional: 0,
			unions: 4
		});
	});

	test('counts nested and type-array unions and optional parameters', () => {
		const tool = {
			name: 'probe',
			strict: true,
			input_schema: {
				type: 'object',
				properties: {
					a: { type: ['string', 'null'] },
					b: {
						type: 'array',
						items: {
							type: 'object',
							properties: { c: { anyOf: [{ type: 'number' }, { type: 'null' }] } },
							required: []
						}
					}
				},
				required: ['b']
			}
		} as unknown as Anthropic.Tool;
		const loose = { ...tool, name: 'loose', strict: undefined } as unknown as Anthropic.Tool;
		expect(measure([tool, loose])).toMatchObject({ strictTools: 1, optional: 2, unions: 2 });
	});
});
