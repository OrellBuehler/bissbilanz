import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/db', () => ({ db: {} }));
vi.mock('$lib/nutrients', () => ({
	ALL_NUTRIENTS: [
		{ key: 'saturatedFat', unit: 'g' },
		{ key: 'sodium', unit: 'mg' }
	]
}));
vi.mock('$lib/server/mcp/handlers', () => ({
	handleCreateFood: vi.fn(),
	handleUpdateFood: vi.fn(),
	handleDeleteFood: vi.fn(),
	handleListRecentFoods: vi.fn(),
	handleCreateRecipe: vi.fn(),
	handleUpdateRecipe: vi.fn(),
	handleDeleteRecipe: vi.fn(),
	handleGetDailyStatus: vi.fn(),
	handleLogFood: vi.fn(),
	handleSearchFoods: vi.fn(),
	handleGetSupplementStatus: vi.fn(),
	handleLogSupplement: vi.fn(),
	handleCreateSupplement: vi.fn(),
	handleListSupplements: vi.fn(),
	handleUpdateSupplement: vi.fn(),
	handleDeleteSupplement: vi.fn(),
	handleUnlogSupplement: vi.fn(),
	handleListEntries: vi.fn(),
	handleUpdateEntry: vi.fn(),
	handleDeleteEntry: vi.fn(),
	handleGetGoals: vi.fn(),
	handleUpdateGoals: vi.fn(),
	handleListRecipes: vi.fn(),
	handleGetRecipe: vi.fn(),
	handleGetFood: vi.fn(),
	handleListFavorites: vi.fn(),
	handleLogWeight: vi.fn(),
	handleUpdateWeight: vi.fn(),
	handleDeleteWeight: vi.fn(),
	handleGetWeight: vi.fn(),
	handleGetWeeklyStats: vi.fn(),
	handleGetMonthlyStats: vi.fn(),
	handleGetDailyBreakdown: vi.fn(),
	handleGetMealBreakdown: vi.fn(),
	handleGetTopFoods: vi.fn(),
	handleGetStreaks: vi.fn(),
	handleCopyEntries: vi.fn(),
	handleFindFoodByBarcode: vi.fn()
}));

import { createMcpServer } from '$lib/server/mcp/server';

describe('MCP resources', () => {
	let server: ReturnType<typeof createMcpServer>;

	beforeEach(() => {
		server = createMcpServer('test-user');
	});

	const staticResourceUris = [
		'diary://today',
		'status://today',
		'goals://current',
		'favorites://list',
		'recipes://list',
		'supplements://list',
		'supplements://status',
		'weight://latest',
		'stats://weekly',
		'stats://monthly',
		'streaks://current'
	];

	it('registers all 11 static resources', () => {
		const resources = (server as any)._registeredResources as Record<string, unknown>;
		const keys = Object.keys(resources);
		for (const uri of staticResourceUris) {
			expect(keys, `missing static resource: ${uri}`).toContain(uri);
		}
		expect(keys.filter((k) => staticResourceUris.includes(k)).length).toBe(11);
	});

	const templateResourceNames = [
		'Diary by Date',
		'Status by Date',
		'Food by ID',
		'Recipe by ID',
		'Weight Trend'
	];

	it('registers all 5 template resources', () => {
		const templates = (server as any)._registeredResourceTemplates as Record<string, unknown>;
		const keys = Object.keys(templates);
		for (const name of templateResourceNames) {
			expect(keys, `missing template resource: ${name}`).toContain(name);
		}
		expect(keys.filter((k) => templateResourceNames.includes(k)).length).toBe(5);
	});
});
