import { describe, expect, test } from 'vitest';
import { toolNames } from '../../src/lib/server/mcp/tools';
import { createMcpServer } from '../../src/lib/server/mcp/server';

const READ_ONLY_TOOLS = [
	'get_daily_status',
	'search_foods',
	'get_food',
	'find_food_by_barcode',
	'list_recent_foods',
	'list_entries',
	'get_goals',
	'list_recipes',
	'get_recipe',
	'list_favorites',
	'get_weight',
	'get_weekly_stats',
	'get_monthly_stats',
	'get_daily_breakdown',
	'get_meal_breakdown',
	'get_top_foods',
	'get_streaks',
	'get_supplement_status',
	'list_supplements'
] as const;

const WRITE_TOOLS = [
	'create_food',
	'create_recipe',
	'log_food',
	'log_supplement',
	'log_weight',
	'create_supplement',
	'copy_entries'
] as const;

const UPDATE_TOOLS = [
	'update_food',
	'update_recipe',
	'update_entry',
	'update_goals',
	'update_supplement',
	'update_weight'
] as const;

const DESTRUCTIVE_TOOLS = [
	'delete_food',
	'delete_recipe',
	'delete_entry',
	'delete_supplement',
	'delete_weight',
	'unlog_supplement'
] as const;

describe('tool annotations', () => {
	const server = createMcpServer('test-user');
	const tools = (
		server as unknown as {
			_registeredTools: Record<string, { annotations?: Record<string, boolean> }>;
		}
	)._registeredTools;

	test('all tools have annotations', () => {
		for (const name of toolNames) {
			expect(tools[name]?.annotations, `${name} should have annotations`).toBeDefined();
		}
	});

	test('read-only tools have correct annotations', () => {
		for (const name of READ_ONLY_TOOLS) {
			const ann = tools[name]?.annotations;
			expect(ann?.readOnlyHint, `${name}.readOnlyHint`).toBe(true);
			expect(ann?.destructiveHint, `${name}.destructiveHint`).toBe(false);
		}
	});

	test('write tools have correct annotations', () => {
		for (const name of WRITE_TOOLS) {
			const ann = tools[name]?.annotations;
			expect(ann?.readOnlyHint, `${name}.readOnlyHint`).toBe(false);
			expect(ann?.destructiveHint, `${name}.destructiveHint`).toBe(false);
		}
	});

	test('update tools have correct annotations', () => {
		for (const name of UPDATE_TOOLS) {
			const ann = tools[name]?.annotations;
			expect(ann?.readOnlyHint, `${name}.readOnlyHint`).toBe(false);
			expect(ann?.destructiveHint, `${name}.destructiveHint`).toBe(false);
			expect(ann?.idempotentHint, `${name}.idempotentHint`).toBe(true);
		}
	});

	test('destructive tools have correct annotations', () => {
		for (const name of DESTRUCTIVE_TOOLS) {
			const ann = tools[name]?.annotations;
			expect(ann?.readOnlyHint, `${name}.readOnlyHint`).toBe(false);
			expect(ann?.destructiveHint, `${name}.destructiveHint`).toBe(true);
			expect(ann?.idempotentHint, `${name}.idempotentHint`).toBe(true);
		}
	});

	test('all 38 tools are classified', () => {
		const all = [...READ_ONLY_TOOLS, ...WRITE_TOOLS, ...UPDATE_TOOLS, ...DESTRUCTIVE_TOOLS];
		expect(all).toHaveLength(38);
		for (const name of toolNames) {
			expect(all, `${name} should be classified`).toContain(name);
		}
	});
});

describe('toolNames', () => {
	test('includes all required tools', () => {
		const expected = [
			'get_daily_status',
			'create_food',
			'create_recipe',
			'log_food',
			'search_foods',
			'get_supplement_status',
			'log_supplement',
			'list_entries',
			'update_entry',
			'delete_entry',
			'get_goals',
			'update_goals',
			'list_recipes',
			'get_recipe',
			'get_food',
			'list_favorites',
			'log_weight',
			'get_weight',
			'get_weekly_stats',
			'get_monthly_stats',
			'copy_entries',
			'find_food_by_barcode',
			'update_food',
			'delete_food',
			'list_recent_foods',
			'update_recipe',
			'delete_recipe',
			'create_supplement',
			'list_supplements',
			'update_supplement',
			'delete_supplement',
			'unlog_supplement',
			'update_weight',
			'delete_weight',
			'get_daily_breakdown',
			'get_meal_breakdown',
			'get_top_foods',
			'get_streaks'
		] as const;
		for (const name of expected) {
			expect(toolNames).toContain(name);
		}
		expect(toolNames).toHaveLength(38);
	});
});
