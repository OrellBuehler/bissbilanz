import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, test, vi } from 'vitest';

vi.mock('$lib/server/claude/config', () => ({
	claudeConfig: () => ({ model: 'claude-opus-5-5', maxWebSearches: 8, maxWebFetches: 5 }),
	claudeApiKey: () => 'key',
	isClaudeConfigured: () => true
}));

const {
	CHAT_TOOL_POLICY,
	FOOD_NUTRITION_FIELDS,
	chatToolPolicy,
	needsConfirmation,
	possibleChanges
} = await import('$lib/server/claude/chat/policy');
const { listMcpTools, chatToolDefinitions } = await import('$lib/server/claude/chat/tools');
const { FIELD_PREVIEW_BUILDERS, PREVIEW_BUILDERS, PREVIEW_SCHEMAS } =
	await import('$lib/server/claude/chat/previews');
const { hasMessage } = await import('$lib/server/claude/chat/labels');
const { CHAT_SYSTEM_PROMPT, buildUserContent } = await import('$lib/server/claude/chat/prompt');
const { CHAT_FIRST_CALL_INPUT_TOKENS } = await import('$lib/server/claude/chat/constants');
const { estimateInputTokens } = await import('$lib/server/claude/call');
const { CLAUDE_MODELS, taskServerTools } = await import('$lib/server/claude/models');
const { chatSystem } = await import('$lib/server/claude/chat/prompt');

const tools = await listMcpTools();

const lookup = {
	today: async () => '2026-11-19',
	entryDate: async (id: unknown) => (id === 'entry-1' ? '2026-11-18' : null)
};

const changesOf = async (
	name: string,
	input: Record<string, unknown>,
	result: Record<string, unknown> | null = null,
	entryDateBefore: string | null = null
) => {
	const policy = chatToolPolicy(name);
	if (!policy || (policy.kind !== 'write' && policy.kind !== 'confirm')) {
		throw new Error(`${name} is not a write`);
	}
	return policy.changes({ input, result, entryDateBefore, lookup });
};

describe('chat tool policy', () => {
	test('classifies every MCP tool and nothing else', () => {
		const names = tools.map((tool) => tool.name).sort();
		expect(names.length).toBeGreaterThan(60);
		expect(Object.keys(CHAT_TOOL_POLICY).sort()).toEqual(names);
	});

	test('never runs destructive, bulk, forced or merging tools without a confirmation', () => {
		for (const tool of tools) {
			const kind = CHAT_TOOL_POLICY[tool.name]!.kind;
			const properties = (tool.inputSchema.properties ?? {}) as Record<string, unknown>;
			const needsConfirmation =
				tool.annotations?.destructiveHint === true ||
				tool.name.endsWith('_batch') ||
				'force' in properties ||
				tool.name === 'merge_foods' ||
				tool.name === 'copy_entries';
			if (needsConfirmation)
				expect([tool.name, kind]).toSatisfy(([, k]) => k !== 'read' && k !== 'write');
			if (tool.annotations?.readOnlyHint === true) {
				expect(['read', 'excluded']).toContain(kind);
			}
		}
	});

	test('excludes the AI task queue and the label sweep, with a reason', () => {
		for (const name of [
			'list_ai_tasks',
			'get_ai_task',
			'complete_ai_task',
			'dismiss_ai_task',
			'list_unlabeled_foods',
			'list_unlabeled_recipes',
			'set_food_labels_batch',
			'set_recipe_labels_batch'
		]) {
			const policy = CHAT_TOOL_POLICY[name]!;
			expect(policy.kind).toBe('excluded');
			expect(policy.kind === 'excluded' && policy.reason.length > 20).toBe(true);
		}
	});

	test('has a label for every offered tool and a preview for every confirmation', () => {
		for (const [name, policy] of Object.entries(CHAT_TOOL_POLICY)) {
			if (policy.kind === 'excluded') continue;
			expect(hasMessage(`chat_tool_${name}`), name).toBe(true);
			expect(Object.hasOwn(PREVIEW_BUILDERS, name), name).toBe(policy.kind === 'confirm');
		}
		expect(hasMessage('chat_tool_web_search')).toBe(true);
		expect(hasMessage('chat_tool_web_fetch')).toBe(true);
		expect(chatToolPolicy('no_such_tool')).toBeNull();
		expect(chatToolPolicy('toString')).toBeNull();
	});

	test('reports what a write changed, scoped where it is known', async () => {
		expect(await changesOf('log_food', {}, { entryId: 'entry-1' })).toEqual([
			{ domain: 'entries', dates: ['2026-11-18'] }
		]);
		expect(await changesOf('log_food', {}, { entryId: 'gone' })).toEqual([{ domain: 'entries' }]);
		expect(await changesOf('update_entry', { entryId: 'entry-1' }, {}, '2026-11-17')).toEqual([
			{ domain: 'entries', dates: ['2026-11-17', '2026-11-18'] }
		]);
		expect(await changesOf('delete_entry', { entryId: 'x' }, {}, '2026-11-17')).toEqual([
			{ domain: 'entries', dates: ['2026-11-17'] }
		]);
		expect(await changesOf('create_food', {}, { foodId: 'f1' })).toEqual([
			{ domain: 'foods', ids: ['f1'] }
		]);
		expect(await changesOf('update_food', { foodId: 'f1' })).toEqual([
			{ domain: 'foods', ids: ['f1'] }
		]);
		expect(await changesOf('delete_food', { foodId: 'f1' }, { blocked: true })).toEqual([]);
		expect(
			await changesOf('delete_food', { foodId: 'f1', force: true }, { success: true })
		).toEqual([
			{ domain: 'foods', ids: ['f1'] },
			{ domain: 'recipes' },
			{ domain: 'supplements' },
			{ domain: 'entries' }
		]);
		expect(
			await changesOf('merge_foods', { keeperId: 'k', sourceIds: ['a', 'b'] }, { success: true })
		).toEqual([
			{ domain: 'foods', ids: ['a', 'b', 'k'] },
			{ domain: 'entries' },
			{ domain: 'recipes' },
			{ domain: 'supplements' },
			{ domain: 'labels' }
		]);
		expect(await changesOf('create_recipe', {}, { recipeId: 'r1' })).toEqual([
			{ domain: 'recipes', ids: ['r1'] }
		]);
		expect(await changesOf('update_recipe', { recipeId: 'r1' })).toEqual([
			{ domain: 'recipes', ids: ['r1'] }
		]);
		expect(await changesOf('delete_recipe', { recipeId: 'r1' }, { blocked: true })).toEqual([]);
		expect(await changesOf('delete_recipe', { recipeId: 'r1', force: true }, {})).toEqual([
			{ domain: 'recipes', ids: ['r1'] },
			{ domain: 'entries' }
		]);
		expect(
			await changesOf('log_supplement', { supplementId: 's1' }, { logged: { date: '2026-11-15' } })
		).toEqual([
			{ domain: 'supplements', ids: ['s1'] },
			{ domain: 'entries', dates: ['2026-11-15'] }
		]);
		expect(await changesOf('log_supplement', { name: 'Zinc' }, {})).toEqual([
			{ domain: 'supplements' },
			{ domain: 'entries', dates: ['2026-11-19'] }
		]);
		expect(await changesOf('create_supplement', {}, { supplementId: 's2' })).toEqual([
			{ domain: 'supplements', ids: ['s2'] }
		]);
		expect(await changesOf('update_supplement', { supplementId: 's2' })).toEqual([
			{ domain: 'supplements', ids: ['s2'] }
		]);
		expect(await changesOf('delete_supplement', { supplementId: 's2' })).toEqual([
			{ domain: 'supplements', ids: ['s2'] }
		]);
		expect(await changesOf('unlog_supplement', { supplementId: 's2', date: '2026-11-10' })).toEqual(
			[
				{ domain: 'supplements', ids: ['s2'] },
				{ domain: 'entries', dates: ['2026-11-10'] }
			]
		);
		expect(await changesOf('update_goals', {})).toEqual([{ domain: 'goals' }]);
		expect(await changesOf('log_weight', {}, { date: '2026-11-19' })).toEqual([
			{ domain: 'weight', dates: ['2026-11-19'] }
		]);
		expect(await changesOf('update_weight', { weightId: 'w' })).toEqual([
			{ domain: 'weight', ids: ['w'] }
		]);
		expect(await changesOf('delete_weight', { weightId: 'w' })).toEqual([
			{ domain: 'weight', ids: ['w'] }
		]);
		expect(await changesOf('copy_entries', { fromDate: '2026-11-01' })).toEqual([
			{ domain: 'entries', dates: ['2026-11-19'] }
		]);
		expect(await changesOf('log_sleep', {})).toEqual([{ domain: 'sleep', dates: ['2026-11-19'] }]);
		expect(await changesOf('update_sleep', { id: 'z' })).toEqual([{ domain: 'sleep', ids: ['z'] }]);
		expect(await changesOf('delete_sleep', { id: 'z' })).toEqual([{ domain: 'sleep', ids: ['z'] }]);
		expect(await changesOf('set_day_properties', { date: '2026-11-19' })).toEqual([
			{ domain: 'dayProperties', dates: ['2026-11-19'] }
		]);
		expect(await changesOf('delete_day_properties', { date: '2026-11-19' })).toEqual([
			{ domain: 'dayProperties', dates: ['2026-11-19'] }
		]);
		expect(await changesOf('set_food_labels', { foodId: 'f1' })).toEqual([
			{ domain: 'labels' },
			{ domain: 'foods', ids: ['f1'] }
		]);
		expect(await changesOf('set_recipe_labels', { recipeId: 'r1' })).toEqual([
			{ domain: 'labels' },
			{ domain: 'recipes', ids: ['r1'] }
		]);
	});
});

describe('confirmations', () => {
	const lookup = (entries: boolean) => ({
		foodHasEntries: async () => entries,
		recipeHasEntries: async () => entries
	});
	const confirms = (name: string, input: Record<string, unknown>, entries = true) =>
		needsConfirmation(chatToolPolicy(name)!, input, lookup(entries));

	test('every field of a confirmable tool is shown on its card or rejected', () => {
		for (const tool of tools) {
			const builder = PREVIEW_BUILDERS[tool.name];
			if (!builder) continue;
			const schema = PREVIEW_SCHEMAS[tool.name as keyof typeof PREVIEW_SCHEMAS];
			expect(schema, tool.name).toBeDefined();
			const accepted = Object.keys(schema.shape);
			const offered = Object.keys((tool.inputSchema.properties ?? {}) as Record<string, unknown>);
			expect(accepted.sort(), tool.name).toEqual(expect.arrayContaining(offered.sort()));
			expect(schema.safeParse({ unexpectedField: 1 }).success, tool.name).toBe(false);
		}
		expect(Object.keys(PREVIEW_SCHEMAS).sort()).toEqual(Object.keys(PREVIEW_BUILDERS).sort());
	});

	test('cards for conditional confirmations exist for every write that can ask', () => {
		for (const [name, policy] of Object.entries(CHAT_TOOL_POLICY)) {
			if (policy.kind === 'write' && policy.confirmWhen) {
				expect(Object.hasOwn(FIELD_PREVIEW_BUILDERS, name), name).toBe(true);
			}
		}
	});

	test('asks before irreversible overwrites and forced calls only', async () => {
		expect(await confirms('delete_entry', {})).toBe(true);
		expect(await confirms('log_food', { foodId: 'f' })).toBe(false);
		expect(await confirms('log_food', { force: true })).toBe(true);
		expect(await confirms('update_goals', { calorieGoal: 2000 })).toBe(false);
		expect(await confirms('update_food', { foodId: 'f', name: 'New name' })).toBe(false);
		expect(await confirms('update_food', { foodId: 'f', calories: 100 })).toBe(true);
		expect(await confirms('update_food', { foodId: 'f', calories: 100 }, false)).toBe(false);
		expect(await confirms('update_food', { foodId: 'f', imageUrl: null })).toBe(true);
		expect(FOOD_NUTRITION_FIELDS).toContain('vitaminC');
		expect(await confirms('update_recipe', { recipeId: 'r', name: 'x' })).toBe(false);
		expect(await confirms('update_recipe', { recipeId: 'r', steps: [] }, false)).toBe(true);
		expect(await confirms('update_recipe', { recipeId: 'r', ingredients: [] }, false)).toBe(true);
		expect(await confirms('update_recipe', { recipeId: 'r', totalServings: 4 })).toBe(true);
		expect(await confirms('update_recipe', { recipeId: 'r', totalServings: 4 }, false)).toBe(false);
		expect(await confirms('update_supplement', { supplementId: 's', ingredients: [] })).toBe(true);
		expect(await confirms('update_supplement', { supplementId: 's', isActive: false })).toBe(false);
		expect(await needsConfirmation({ kind: 'read' }, { force: true }, lookup(true))).toBe(false);
	});

	test('reports the domains a write of unknown outcome may have touched, unscoped', async () => {
		expect(await possibleChanges('log_food', { date: '2026-11-19' })).toEqual([
			{ domain: 'entries' }
		]);
		expect(await possibleChanges('delete_food', { foodId: 'f', force: true })).toEqual([
			{ domain: 'foods' },
			{ domain: 'recipes' },
			{ domain: 'supplements' },
			{ domain: 'entries' }
		]);
		expect(await possibleChanges('search_foods', {})).toEqual([]);
		expect(await possibleChanges('nope', {})).toEqual([]);
	});

	test('reports foods when supplements create them inline', async () => {
		const inline = { ingredients: [{ food: { name: 'Zinc' }, servings: 1 }] };
		expect(await changesOf('create_supplement', inline, { supplementId: 's' })).toEqual([
			{ domain: 'supplements', ids: ['s'] },
			{ domain: 'foods' }
		]);
		expect(await changesOf('update_supplement', { supplementId: 's', ...inline })).toEqual([
			{ domain: 'supplements', ids: ['s'] },
			{ domain: 'foods' }
		]);
		expect(await changesOf('create_supplement', { ingredients: [{ foodId: 'f' }] }, {})).toEqual([
			{ domain: 'supplements' }
		]);
	});
});

describe('chat tool definitions', () => {
	const definitions = chatToolDefinitions(tools);

	test('offers every non-excluded tool in a fixed order with self-contained schemas', () => {
		const names = definitions.map((tool) => tool.name);
		expect(names).toEqual([...names].sort());
		expect(names).not.toContain('complete_ai_task');
		expect(names).toContain('delete_entry');
		const json = JSON.stringify(definitions);
		expect(json).not.toContain('"$ref"');
		expect(json).not.toContain('"$schema"');
		expect(json).not.toContain('"definitions"');
		expect(definitions.every((tool) => tool.input_schema.type === 'object')).toBe(true);
		expect(definitions.some((tool) => 'strict' in tool)).toBe(false);
	});

	test('tells the model which tools wait for the user', () => {
		const byName = new Map(definitions.map((tool) => [tool.name, tool]));
		expect(byName.get('delete_entry')!.description).toContain('confirms this call');
		expect(byName.get('log_food')!.description).not.toContain('confirms this call');
	});

	test('keeps the first-call estimate above the real first request of every model', () => {
		for (const { id } of CLAUDE_MODELS) {
			const request = {
				system: chatSystem(),
				tools: [...taskServerTools(id), ...definitions] as Anthropic.ToolUnion[],
				messages: [
					{
						role: 'user' as const,
						content: buildUserContent('x'.repeat(4000), [], {
							now: new Date('2026-11-19T12:00:00Z'),
							timeZone: 'Europe/Zurich',
							viewedDate: '2026-11-18',
							deviceTimeZone: 'America/New_York',
							locale: 'de'
						}) as Anthropic.ContentBlockParam[]
					}
				]
			};
			expect(estimateInputTokens(request, 0), id).toBeLessThanOrEqual(CHAT_FIRST_CALL_INPUT_TOKENS);
		}
	});

	test('keeps the system prompt free of per-request data', () => {
		expect(CHAT_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
		expect(CHAT_SYSTEM_PROMPT).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
		expect(CHAT_SYSTEM_PROMPT).toContain('Untrusted data');
	});
});
