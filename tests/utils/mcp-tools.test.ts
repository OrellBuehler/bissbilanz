import { describe, expect, test } from 'vitest';
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
