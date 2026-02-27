import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { TEST_USER, TEST_FOOD, TEST_RECIPE, TEST_ENTRY, TEST_GOALS, TEST_SUPPLEMENT } from '../helpers/fixtures';

// Mock paraglide (generated at build time, not available in tests)
mock.module('$lib/paraglide/messages', () => new Proxy({}, { get: () => () => '' }));

// Mock state
let mockFoods: any[] = [];
let mockCreateFoodResult: any = null;
let mockRecipes: any[] = [];
let mockCreateRecipeResult: any = null;
let mockCreateEntryResult: any = null;
let mockEntries: any[] = [];
let mockUpdateEntryResult: any = null;
let mockGoals: any = null;
let mockUpsertGoalsResult: any = null;
let mockFood: any = null;
let mockRecipe: any = null;
let mockFavFoods: any[] = [];
let mockFavRecipes: any[] = [];
let mockCreateWeightResult: any = null;
let mockLatestWeight: any = null;
let mockWeightTrend: any = [];
let mockWeeklyStats: any = null;
let mockMonthlyStats: any = null;
let mockCopyResult: any[] = [];
let mockBarcodeFood: any = null;
let mockSupplements: any[] = [];
let mockSupplementLogs: any[] = [];
let mockLogSupplementResult: any = null;
let mockSupplementById: any = null;

// Mock all service modules
mock.module('$lib/server/foods', () => ({
	listFoods: async () => mockFoods,
	createFood: async (_userId: string, payload: unknown) =>
		mockCreateFoodResult
			? { success: true, data: mockCreateFoodResult }
			: { success: false, error: new Error('Validation failed') },
	getFood: async () => mockFood,
	findFoodByBarcode: async () => mockBarcodeFood
}));

mock.module('$lib/server/recipes', () => ({
	listRecipes: async () => mockRecipes,
	createRecipe: async () =>
		mockCreateRecipeResult
			? { success: true, data: mockCreateRecipeResult }
			: { success: false, error: new Error('Validation failed') },
	getRecipe: async () => mockRecipe
}));

mock.module('$lib/server/entries', () => ({
	createEntry: async () =>
		mockCreateEntryResult
			? { success: true, data: mockCreateEntryResult }
			: { success: false, error: new Error('Validation failed') },
	listEntriesByDate: async () => mockEntries,
	updateEntry: async () =>
		mockUpdateEntryResult
			? { success: true, data: mockUpdateEntryResult }
			: { success: false, error: new Error('Update failed') },
	deleteEntry: async () => true,
	copyEntries: async () => mockCopyResult
}));

mock.module('$lib/server/goals', () => ({
	getGoals: async () => mockGoals,
	upsertGoals: async () =>
		mockUpsertGoalsResult
			? { success: true, data: mockUpsertGoalsResult }
			: { success: false, error: new Error('Validation failed') }
}));

mock.module('$lib/server/favorites', () => ({
	listFavoriteFoods: async () => mockFavFoods,
	listFavoriteRecipes: async () => mockFavRecipes
}));

mock.module('$lib/server/weight', () => ({
	createWeightEntry: async () =>
		mockCreateWeightResult
			? { success: true, data: mockCreateWeightResult }
			: { success: false, error: new Error('Validation failed') },
	getLatestWeight: async () => mockLatestWeight,
	getWeightWithTrend: async () => mockWeightTrend
}));

mock.module('$lib/server/stats', () => ({
	getWeeklyStats: async () => mockWeeklyStats,
	getMonthlyStats: async () => mockMonthlyStats
}));

mock.module('$lib/server/supplements', () => ({
	listSupplements: async () => mockSupplements,
	getLogsForDate: async () => mockSupplementLogs,
	logSupplement: async () =>
		mockLogSupplementResult
			? { success: true, data: mockLogSupplementResult }
			: { success: false, error: new Error('Supplement not found') },
	getSupplementById: async () => mockSupplementById
}));

mock.module('$lib/utils/supplements', () => ({
	isSupplementDue: () => true
}));

// Import handlers after mocking
const {
	handleSearchFoods,
	handleCreateFood,
	handleCreateRecipe,
	handleLogFood,
	handleGetDailyStatus,
	handleListEntries,
	handleUpdateEntry,
	handleDeleteEntry,
	handleGetGoals,
	handleUpdateGoals,
	handleListRecipes,
	handleGetRecipe,
	handleGetFood,
	handleListFavorites,
	handleLogWeight,
	handleGetWeight,
	handleGetWeeklyStats,
	handleGetMonthlyStats,
	handleCopyEntries,
	handleFindFoodByBarcode,
	handleGetSupplementStatus,
	handleLogSupplement
} = await import('$lib/server/mcp/handlers');

describe('MCP handlers', () => {
	beforeEach(() => {
		mockFoods = [];
		mockCreateFoodResult = null;
		mockRecipes = [];
		mockCreateRecipeResult = null;
		mockCreateEntryResult = null;
		mockEntries = [];
		mockUpdateEntryResult = null;
		mockGoals = null;
		mockUpsertGoalsResult = null;
		mockFood = null;
		mockRecipe = null;
		mockFavFoods = [];
		mockFavRecipes = [];
		mockCreateWeightResult = null;
		mockLatestWeight = null;
		mockWeightTrend = [];
		mockWeeklyStats = null;
		mockMonthlyStats = null;
		mockCopyResult = [];
		mockBarcodeFood = null;
		mockSupplements = [];
		mockSupplementLogs = [];
		mockLogSupplementResult = null;
		mockSupplementById = null;
	});

	describe('handleSearchFoods', () => {
		test('returns matching foods', async () => {
			mockFoods = [TEST_FOOD];
			const result = await handleSearchFoods(TEST_USER.id, 'Oats');
			expect(result.foods).toHaveLength(1);
			expect(result.foods[0].name).toBe('Oats');
		});

		test('returns empty array when no match', async () => {
			mockFoods = [];
			const result = await handleSearchFoods(TEST_USER.id, 'nonexistent');
			expect(result.foods).toHaveLength(0);
		});
	});

	describe('handleCreateFood', () => {
		test('returns foodId on success', async () => {
			mockCreateFoodResult = { ...TEST_FOOD, id: 'new-food-id' };
			const result = await handleCreateFood(TEST_USER.id, {
				name: 'Oats',
				servingSize: 100,
				servingUnit: 'g',
				calories: 389,
				protein: 13.2,
				carbs: 66.3,
				fat: 6.9,
				fiber: 10.6
			});
			expect(result.success).toBe(true);
			expect(result.foodId).toBe('new-food-id');
		});

		test('returns error on validation failure', async () => {
			mockCreateFoodResult = null;
			const result = await handleCreateFood(TEST_USER.id, {});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleCreateRecipe', () => {
		test('returns recipeId on success', async () => {
			mockCreateRecipeResult = { ...TEST_RECIPE, id: 'new-recipe-id' };
			const result = await handleCreateRecipe(TEST_USER.id, {
				name: 'Shake',
				totalServings: 2,
				ingredients: [{ foodId: TEST_FOOD.id, quantity: 1, servingUnit: 'cup' }]
			});
			expect(result.success).toBe(true);
			expect(result.recipeId).toBe('new-recipe-id');
		});

		test('returns error on failure', async () => {
			mockCreateRecipeResult = null;
			const result = await handleCreateRecipe(TEST_USER.id, {});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleLogFood', () => {
		test('returns entryId on success', async () => {
			mockCreateEntryResult = { ...TEST_ENTRY, id: 'new-entry-id' };
			const result = await handleLogFood(TEST_USER.id, {
				foodId: TEST_FOOD.id,
				mealType: 'breakfast',
				servings: 1,
				date: '2026-02-10'
			});
			expect(result.success).toBe(true);
			expect(result.entryId).toBe('new-entry-id');
		});

		test('returns error on failure', async () => {
			mockCreateEntryResult = null;
			const result = await handleLogFood(TEST_USER.id, {});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleGetDailyStatus', () => {
		test('returns totals and goals', async () => {
			mockEntries = [];
			mockGoals = TEST_GOALS;
			const result = await handleGetDailyStatus(TEST_USER.id, '2026-02-10');
			expect(result.totals).toBeDefined();
			expect(result.goals).toBeDefined();
			expect(result.goals?.calorieGoal).toBe(2000);
		});

		test('returns null goals when user has none', async () => {
			mockEntries = [];
			mockGoals = null;
			const result = await handleGetDailyStatus(TEST_USER.id, '2026-02-10');
			expect(result.goals).toBeNull();
		});
	});

	describe('handleListEntries', () => {
		test('returns entries for date', async () => {
			mockEntries = [TEST_ENTRY];
			const result = await handleListEntries(TEST_USER.id, '2026-02-10');
			expect(result.date).toBe('2026-02-10');
			expect(result.entries).toHaveLength(1);
		});

		test('defaults to today when no date', async () => {
			mockEntries = [];
			const result = await handleListEntries(TEST_USER.id);
			expect(result.date).toBeDefined();
			expect(result.entries).toEqual([]);
		});
	});

	describe('handleUpdateEntry', () => {
		test('returns success on valid update', async () => {
			mockUpdateEntryResult = { ...TEST_ENTRY, servings: 2 };
			const result = await handleUpdateEntry(TEST_USER.id, {
				entryId: TEST_ENTRY.id,
				servings: 2
			});
			expect(result.success).toBe(true);
			expect(result.entryId).toBe(TEST_ENTRY.id);
		});

		test('returns error on failure', async () => {
			mockUpdateEntryResult = null;
			const result = await handleUpdateEntry(TEST_USER.id, {
				entryId: 'nonexistent',
				servings: 2
			});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleDeleteEntry', () => {
		test('returns success', async () => {
			const result = await handleDeleteEntry(TEST_USER.id, TEST_ENTRY.id);
			expect(result.success).toBe(true);
		});
	});

	describe('handleGetGoals', () => {
		test('returns goals when set', async () => {
			mockGoals = TEST_GOALS;
			const result = await handleGetGoals(TEST_USER.id);
			expect(result.goals).toEqual(TEST_GOALS);
		});

		test('returns null when no goals', async () => {
			mockGoals = null;
			const result = await handleGetGoals(TEST_USER.id);
			expect(result.goals).toBeNull();
		});
	});

	describe('handleUpdateGoals', () => {
		test('returns success on valid update', async () => {
			mockUpsertGoalsResult = TEST_GOALS;
			const result = await handleUpdateGoals(TEST_USER.id, {
				calorieGoal: 2000,
				proteinGoal: 150,
				carbGoal: 200,
				fatGoal: 67,
				fiberGoal: 30
			});
			expect(result.success).toBe(true);
		});

		test('returns error on failure', async () => {
			mockUpsertGoalsResult = null;
			const result = await handleUpdateGoals(TEST_USER.id, {});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleListRecipes', () => {
		test('returns recipes', async () => {
			mockRecipes = [TEST_RECIPE];
			const result = await handleListRecipes(TEST_USER.id);
			expect(result.recipes).toHaveLength(1);
		});
	});

	describe('handleGetRecipe', () => {
		test('returns recipe when found', async () => {
			mockRecipe = TEST_RECIPE;
			const result = await handleGetRecipe(TEST_USER.id, TEST_RECIPE.id);
			expect(result.name).toBe('Oatmeal Bowl');
		});

		test('returns error when not found', async () => {
			mockRecipe = null;
			const result = await handleGetRecipe(TEST_USER.id, 'nonexistent');
			expect(result.error).toBe('Recipe not found');
		});
	});

	describe('handleGetFood', () => {
		test('returns food when found', async () => {
			mockFood = TEST_FOOD;
			const result = await handleGetFood(TEST_USER.id, TEST_FOOD.id);
			expect(result.name).toBe('Oats');
		});

		test('returns error when not found', async () => {
			mockFood = null;
			const result = await handleGetFood(TEST_USER.id, 'nonexistent');
			expect(result.error).toBe('Food not found');
		});
	});

	describe('handleListFavorites', () => {
		test('returns both foods and recipes', async () => {
			mockFavFoods = [TEST_FOOD];
			mockFavRecipes = [TEST_RECIPE];
			const result = await handleListFavorites(TEST_USER.id);
			expect(result.foods).toHaveLength(1);
			expect(result.recipes).toHaveLength(1);
		});

		test('returns empty arrays when no favorites', async () => {
			const result = await handleListFavorites(TEST_USER.id);
			expect(result.foods).toEqual([]);
			expect(result.recipes).toEqual([]);
		});
	});

	describe('handleLogWeight', () => {
		test('returns success with entryId', async () => {
			mockCreateWeightResult = { id: 'weight-1', weightKg: 75.5 };
			const result = await handleLogWeight(TEST_USER.id, { weightKg: 75.5 });
			expect(result.success).toBe(true);
			expect(result.entryId).toBe('weight-1');
		});

		test('returns error on failure', async () => {
			mockCreateWeightResult = null;
			const result = await handleLogWeight(TEST_USER.id, { weightKg: -5 });
			expect(result.error).toBeDefined();
		});
	});

	describe('handleGetWeight', () => {
		test('returns latest weight when no date range', async () => {
			mockLatestWeight = { weightKg: 75.5, entryDate: '2026-02-10' };
			const result = await handleGetWeight(TEST_USER.id, {});
			expect(result.weightKg).toBe(75.5);
		});

		test('returns error when no entries and no range', async () => {
			mockLatestWeight = null;
			const result = await handleGetWeight(TEST_USER.id, {});
			expect(result.error).toBe('No weight entries found');
		});

		test('returns error when only from provided', async () => {
			const result = await handleGetWeight(TEST_USER.id, { from: '2026-02-01' });
			expect(result.error).toContain('Provide both');
		});

		test('returns error when only to provided', async () => {
			const result = await handleGetWeight(TEST_USER.id, { to: '2026-02-10' });
			expect(result.error).toContain('Provide both');
		});

		test('returns trend data with from and to', async () => {
			mockWeightTrend = [{ entry_date: '2026-02-01', weight_kg: 75 }];
			const result = await handleGetWeight(TEST_USER.id, {
				from: '2026-02-01',
				to: '2026-02-10'
			});
			expect(Array.isArray(result)).toBe(true);
		});
	});

	describe('handleGetWeeklyStats', () => {
		test('returns weekly stats', async () => {
			mockWeeklyStats = { calories: 2000, protein: 150 };
			const result = await handleGetWeeklyStats(TEST_USER.id);
			expect(result.calories).toBe(2000);
		});
	});

	describe('handleGetMonthlyStats', () => {
		test('returns monthly stats', async () => {
			mockMonthlyStats = { calories: 1800, protein: 140 };
			const result = await handleGetMonthlyStats(TEST_USER.id);
			expect(result.calories).toBe(1800);
		});
	});

	describe('handleCopyEntries', () => {
		test('returns copied count', async () => {
			mockCopyResult = [TEST_ENTRY, { ...TEST_ENTRY, id: 'entry-2' }];
			const result = await handleCopyEntries(TEST_USER.id, {
				fromDate: '2026-02-09',
				toDate: '2026-02-10'
			});
			expect(result.success).toBe(true);
			expect(result.copiedCount).toBe(2);
		});

		test('returns zero when no entries to copy', async () => {
			mockCopyResult = [];
			const result = await handleCopyEntries(TEST_USER.id, {
				fromDate: '2026-02-09'
			});
			expect(result.success).toBe(true);
			expect(result.copiedCount).toBe(0);
		});
	});

	describe('handleFindFoodByBarcode', () => {
		test('returns food when found', async () => {
			mockBarcodeFood = TEST_FOOD;
			const result = await handleFindFoodByBarcode(TEST_USER.id, '1234567890123');
			expect(result.found).toBe(true);
			expect(result.name).toBe('Oats');
		});

		test('returns not found when no match', async () => {
			mockBarcodeFood = null;
			const result = await handleFindFoodByBarcode(TEST_USER.id, '0000000000000');
			expect(result.found).toBe(false);
		});
	});

	describe('handleGetSupplementStatus', () => {
		test('returns checklist with taken status', async () => {
			mockSupplements = [TEST_SUPPLEMENT];
			mockSupplementLogs = [{ supplementId: TEST_SUPPLEMENT.id, takenAt: new Date() }];
			const result = await handleGetSupplementStatus(TEST_USER.id);
			expect(result.total).toBe(1);
			expect(result.taken).toBe(1);
			expect(result.pending).toBe(0);
			expect(result.supplements).toHaveLength(1);
			expect(result.supplements[0].taken).toBe(true);
		});

		test('returns pending supplements', async () => {
			mockSupplements = [TEST_SUPPLEMENT];
			mockSupplementLogs = [];
			const result = await handleGetSupplementStatus(TEST_USER.id);
			expect(result.total).toBe(1);
			expect(result.taken).toBe(0);
			expect(result.pending).toBe(1);
			expect(result.supplements[0].taken).toBe(false);
		});

		test('returns empty checklist when no supplements', async () => {
			const result = await handleGetSupplementStatus(TEST_USER.id);
			expect(result.total).toBe(0);
			expect(result.supplements).toEqual([]);
		});
	});

	describe('handleLogSupplement', () => {
		test('logs supplement by ID', async () => {
			mockLogSupplementResult = { id: 'log-1' };
			mockSupplementById = TEST_SUPPLEMENT;
			const result = await handleLogSupplement(TEST_USER.id, {
				supplementId: TEST_SUPPLEMENT.id
			});
			expect(result.success).toBe(true);
			expect(result.logged?.name).toBe('Vitamin D3');
		});

		test('logs supplement by name search', async () => {
			mockSupplements = [TEST_SUPPLEMENT];
			mockLogSupplementResult = { id: 'log-1' };
			mockSupplementById = TEST_SUPPLEMENT;
			const result = await handleLogSupplement(TEST_USER.id, {
				name: 'vitamin d'
			});
			expect(result.success).toBe(true);
		});

		test('returns error when name not found', async () => {
			mockSupplements = [];
			const result = await handleLogSupplement(TEST_USER.id, {
				name: 'nonexistent'
			});
			expect(result.success).toBe(false);
			expect(result.error).toContain('No supplement found');
		});

		test('returns error when neither name nor id provided', async () => {
			const result = await handleLogSupplement(TEST_USER.id, {});
			expect(result.success).toBe(false);
			expect(result.error).toContain('Provide either');
		});
	});
});
