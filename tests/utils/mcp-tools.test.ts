import { describe, expect, test } from 'bun:test';
import { toolNames } from '../../src/lib/server/mcp/tools';

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
			'find_food_by_barcode'
		] as const;
		for (const name of expected) {
			expect(toolNames).toContain(name);
		}
		expect(toolNames).toHaveLength(22);
	});
});
