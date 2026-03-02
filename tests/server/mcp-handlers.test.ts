import { describe, test, expect, beforeEach } from 'vitest';
import {
	TEST_USER,
	TEST_FOOD,
	TEST_RECIPE,
	TEST_ENTRY,
	TEST_GOALS,
	TEST_SUPPLEMENT
} from '../helpers/fixtures';
import { createHandlers, type HandlerDeps } from '../../src/lib/server/mcp/create-handlers';

// Mock state — each variable is referenced by the mock deps via closure,
// so resetting them in beforeEach changes what handlers see.
let mockFoods: any[] = [];
let mockCreateFoodResult: any = null;
let mockUpdateFoodResult: any = null;
let mockDeleteFoodResult: any = { blocked: false };
let mockRecipes: any[] = [];
let mockCreateRecipeResult: any = null;
let mockUpdateRecipeResult: any = null;
let mockDeleteRecipeResult: any = { blocked: false };
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
let mockUpdateWeightResult: any = null;
let mockDeleteWeightResult: any = true;
let mockLatestWeight: any = null;
let mockWeightTrend: any = [];
let mockWeeklyStats: any = null;
let mockMonthlyStats: any = null;
let mockDailyBreakdown: any[] = [];
let mockMealBreakdown: any[] = [];
let mockTopFoods: any[] = [];
let mockStreaks: any = { currentStreak: 0, longestStreak: 0 };
let mockCopyResult: any[] = [];
let mockBarcodeFood: any = null;
let mockRecentFoods: any[] = [];
let mockSupplements: any[] = [];
let mockSupplementLogs: any[] = [];
let mockLogSupplementResult: any = null;
let mockSupplementById: any = null;
let mockCreateSupplementResult: any = null;
let mockUpdateSupplementResult: any = null;

// Create handlers with mock deps — no mock.module needed!
// Uses type assertion because mock functions return `any`-typed test state variables.
const mockDeps = {
	listFoods: async () => mockFoods,
	createFood: async () =>
		mockCreateFoodResult
			? { success: true, data: mockCreateFoodResult }
			: { success: false, error: new Error('Validation failed') },
	getFood: async () => mockFood,
	findFoodByBarcode: async () => mockBarcodeFood,
	updateFood: async () =>
		mockUpdateFoodResult
			? { success: true, data: mockUpdateFoodResult }
			: { success: false, error: new Error('Validation failed') },
	deleteFood: async () => mockDeleteFoodResult,
	listRecentFoods: async () => mockRecentFoods,
	listRecipes: async () => mockRecipes,
	createRecipe: async () =>
		mockCreateRecipeResult
			? { success: true, data: mockCreateRecipeResult }
			: { success: false, error: new Error('Validation failed') },
	getRecipe: async () => mockRecipe,
	updateRecipe: async () =>
		mockUpdateRecipeResult
			? { success: true, data: mockUpdateRecipeResult }
			: { success: false, error: new Error('Validation failed') },
	deleteRecipe: async () => mockDeleteRecipeResult,
	createEntry: async () =>
		mockCreateEntryResult
			? { success: true, data: mockCreateEntryResult }
			: { success: false, error: new Error('Validation failed') },
	listEntriesByDate: async () => mockEntries,
	updateEntry: async () =>
		mockUpdateEntryResult
			? { success: true, data: mockUpdateEntryResult }
			: { success: false, error: new Error('Update failed') },
	deleteEntry: async () => {},
	copyEntries: async () => mockCopyResult,
	getGoals: async () => mockGoals,
	upsertGoals: async () =>
		mockUpsertGoalsResult
			? { success: true, data: mockUpsertGoalsResult }
			: { success: false, error: new Error('Validation failed') },
	listFavoriteFoods: async () => mockFavFoods,
	listFavoriteRecipes: async () => mockFavRecipes,
	createWeightEntry: async () =>
		mockCreateWeightResult
			? { success: true, data: mockCreateWeightResult }
			: { success: false, error: new Error('Validation failed') },
	updateWeightEntry: async () =>
		mockUpdateWeightResult
			? { success: true, data: mockUpdateWeightResult }
			: { success: false, error: new Error('Validation failed') },
	deleteWeightEntry: async () => mockDeleteWeightResult,
	getLatestWeight: async () => mockLatestWeight,
	getWeightWithTrend: async () => mockWeightTrend,
	getWeeklyStats: async () => mockWeeklyStats,
	getMonthlyStats: async () => mockMonthlyStats,
	getDailyBreakdown: async () => mockDailyBreakdown,
	getMealBreakdown: async () => mockMealBreakdown,
	getTopFoods: async () => mockTopFoods,
	getStreaks: async () => mockStreaks,
	listSupplements: async () => mockSupplements,
	getLogsForDate: async () => mockSupplementLogs,
	logSupplement: async () =>
		mockLogSupplementResult
			? { success: true, data: mockLogSupplementResult }
			: { success: false, error: new Error('Supplement not found') },
	getSupplementById: async () => mockSupplementById,
	createSupplement: async () =>
		mockCreateSupplementResult
			? { success: true, data: mockCreateSupplementResult }
			: { success: false, error: new Error('Validation failed') },
	updateSupplement: async () =>
		mockUpdateSupplementResult
			? { success: true, data: mockUpdateSupplementResult }
			: { success: false, error: new Error('Validation failed') },
	deleteSupplement: async () => {},
	unlogSupplement: async () => {},
	formatDailyStatus: ({ entries, goals }: { entries: unknown[]; goals: unknown }) => ({
		totals: {
			calories: 0,
			protein: 0,
			carbs: 0,
			fat: 0,
			fiber: 0
		},
		goals
	}),
	today: () => '2026-02-10',
	isSupplementDue: () => true
} satisfies Record<string, Function> as unknown as HandlerDeps;

const {
	handleSearchFoods,
	handleCreateFood,
	handleUpdateFood,
	handleDeleteFood,
	handleListRecentFoods,
	handleCreateRecipe,
	handleUpdateRecipe,
	handleDeleteRecipe,
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
	handleUpdateWeight,
	handleDeleteWeight,
	handleGetWeeklyStats,
	handleGetMonthlyStats,
	handleGetDailyBreakdown,
	handleGetMealBreakdown,
	handleGetTopFoods,
	handleGetStreaks,
	handleCopyEntries,
	handleFindFoodByBarcode,
	handleGetSupplementStatus,
	handleLogSupplement,
	handleCreateSupplement,
	handleListSupplements,
	handleUpdateSupplement,
	handleDeleteSupplement,
	handleUnlogSupplement
} = createHandlers(mockDeps);

describe('MCP handlers', () => {
	beforeEach(() => {
		mockFoods = [];
		mockCreateFoodResult = null;
		mockUpdateFoodResult = null;
		mockDeleteFoodResult = { blocked: false };
		mockRecipes = [];
		mockCreateRecipeResult = null;
		mockUpdateRecipeResult = null;
		mockDeleteRecipeResult = { blocked: false };
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
		mockUpdateWeightResult = null;
		mockDeleteWeightResult = true;
		mockLatestWeight = null;
		mockWeightTrend = [];
		mockWeeklyStats = null;
		mockMonthlyStats = null;
		mockDailyBreakdown = [];
		mockMealBreakdown = [];
		mockTopFoods = [];
		mockStreaks = { currentStreak: 0, longestStreak: 0 };
		mockCopyResult = [];
		mockBarcodeFood = null;
		mockRecentFoods = [];
		mockSupplements = [];
		mockSupplementLogs = [];
		mockLogSupplementResult = null;
		mockSupplementById = null;
		mockCreateSupplementResult = null;
		mockUpdateSupplementResult = null;
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
			const result = (await handleGetRecipe(TEST_USER.id, TEST_RECIPE.id)) as any;
			expect(result.name).toBe('Oatmeal Bowl');
		});

		test('returns error when not found', async () => {
			mockRecipe = null;
			const result = (await handleGetRecipe(TEST_USER.id, 'nonexistent')) as any;
			expect(result.error).toBe('Recipe not found');
		});
	});

	describe('handleGetFood', () => {
		test('returns food when found', async () => {
			mockFood = TEST_FOOD;
			const result = (await handleGetFood(TEST_USER.id, TEST_FOOD.id)) as any;
			expect(result.name).toBe('Oats');
		});

		test('returns error when not found', async () => {
			mockFood = null;
			const result = (await handleGetFood(TEST_USER.id, 'nonexistent')) as any;
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
			const result = (await handleGetWeight(TEST_USER.id, {})) as any;
			expect(result.weightKg).toBe(75.5);
		});

		test('returns error when no entries and no range', async () => {
			mockLatestWeight = null;
			const result = (await handleGetWeight(TEST_USER.id, {})) as any;
			expect(result.error).toBe('No weight entries found');
		});

		test('returns error when only from provided', async () => {
			const result = (await handleGetWeight(TEST_USER.id, { from: '2026-02-01' })) as any;
			expect(result.error).toContain('Provide both');
		});

		test('returns error when only to provided', async () => {
			const result = (await handleGetWeight(TEST_USER.id, { to: '2026-02-10' })) as any;
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
			const result = (await handleFindFoodByBarcode(TEST_USER.id, '1234567890123')) as any;
			expect(result.found).toBe(true);
			expect(result.name).toBe('Oats');
		});

		test('returns not found when no match', async () => {
			mockBarcodeFood = null;
			const result = (await handleFindFoodByBarcode(TEST_USER.id, '0000000000000')) as any;
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

	describe('handleUpdateFood', () => {
		test('returns success on valid update', async () => {
			mockUpdateFoodResult = { ...TEST_FOOD, name: 'Updated Oats' };
			const result = await handleUpdateFood(TEST_USER.id, {
				foodId: TEST_FOOD.id,
				name: 'Updated Oats'
			});
			expect(result.success).toBe(true);
			expect(result.foodId).toBe(TEST_FOOD.id);
		});

		test('returns error on failure', async () => {
			mockUpdateFoodResult = null;
			const result = await handleUpdateFood(TEST_USER.id, {
				foodId: 'nonexistent'
			});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleDeleteFood', () => {
		test('returns success when not blocked', async () => {
			mockDeleteFoodResult = { blocked: false };
			const result = await handleDeleteFood(TEST_USER.id, { foodId: TEST_FOOD.id });
			expect(result.success).toBe(true);
		});

		test('returns blocked when food has entries', async () => {
			mockDeleteFoodResult = { blocked: true, entryCount: 3 };
			const result = await handleDeleteFood(TEST_USER.id, { foodId: TEST_FOOD.id });
			expect(result.blocked).toBe(true);
			expect(result.entryCount).toBe(3);
			expect(result.hint).toContain('force=true');
		});
	});

	describe('handleListRecentFoods', () => {
		test('returns recent foods with default limit', async () => {
			mockRecentFoods = [TEST_FOOD];
			const result = await handleListRecentFoods(TEST_USER.id, {});
			expect(result).toHaveLength(1);
		});

		test('returns empty array when no recent foods', async () => {
			mockRecentFoods = [];
			const result = await handleListRecentFoods(TEST_USER.id, { limit: 10 });
			expect(result).toHaveLength(0);
		});
	});

	describe('handleUpdateRecipe', () => {
		test('returns success on valid update', async () => {
			mockUpdateRecipeResult = { ...TEST_RECIPE, name: 'Updated Bowl' };
			const result = await handleUpdateRecipe(TEST_USER.id, {
				recipeId: TEST_RECIPE.id,
				name: 'Updated Bowl'
			});
			expect(result.success).toBe(true);
			expect(result.recipeId).toBe(TEST_RECIPE.id);
		});

		test('returns error on failure', async () => {
			mockUpdateRecipeResult = null;
			const result = await handleUpdateRecipe(TEST_USER.id, {
				recipeId: 'nonexistent'
			});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleDeleteRecipe', () => {
		test('returns success when not blocked', async () => {
			mockDeleteRecipeResult = { blocked: false };
			const result = await handleDeleteRecipe(TEST_USER.id, { recipeId: TEST_RECIPE.id });
			expect(result.success).toBe(true);
		});

		test('returns blocked when recipe has entries', async () => {
			mockDeleteRecipeResult = { blocked: true, entryCount: 2 };
			const result = await handleDeleteRecipe(TEST_USER.id, { recipeId: TEST_RECIPE.id });
			expect(result.blocked).toBe(true);
			expect(result.entryCount).toBe(2);
			expect(result.hint).toContain('force=true');
		});
	});

	describe('handleCreateSupplement', () => {
		test('returns supplementId on success', async () => {
			mockCreateSupplementResult = { ...TEST_SUPPLEMENT, id: 'new-supp' };
			const result = await handleCreateSupplement(TEST_USER.id, {
				name: 'Vitamin D3',
				dosage: 1000,
				dosageUnit: 'IU',
				scheduleType: 'daily'
			});
			expect(result.success).toBe(true);
			expect(result.supplementId).toBe('new-supp');
		});

		test('returns error on failure', async () => {
			mockCreateSupplementResult = null;
			const result = await handleCreateSupplement(TEST_USER.id, {});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleListSupplements', () => {
		test('returns supplements', async () => {
			mockSupplements = [TEST_SUPPLEMENT];
			const result = await handleListSupplements(TEST_USER.id, {});
			expect(result.supplements).toHaveLength(1);
		});

		test('returns empty array when no supplements', async () => {
			mockSupplements = [];
			const result = await handleListSupplements(TEST_USER.id, { activeOnly: true });
			expect(result.supplements).toEqual([]);
		});
	});

	describe('handleUpdateSupplement', () => {
		test('returns success on valid update', async () => {
			mockUpdateSupplementResult = { ...TEST_SUPPLEMENT, name: 'Updated D3' };
			const result = await handleUpdateSupplement(TEST_USER.id, {
				supplementId: TEST_SUPPLEMENT.id,
				name: 'Updated D3'
			});
			expect(result.success).toBe(true);
			expect(result.supplementId).toBe(TEST_SUPPLEMENT.id);
		});

		test('returns error on failure', async () => {
			mockUpdateSupplementResult = null;
			const result = await handleUpdateSupplement(TEST_USER.id, {
				supplementId: 'nonexistent'
			});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleDeleteSupplement', () => {
		test('returns success', async () => {
			const result = await handleDeleteSupplement(TEST_USER.id, {
				supplementId: TEST_SUPPLEMENT.id
			});
			expect(result.success).toBe(true);
		});
	});

	describe('handleUnlogSupplement', () => {
		test('returns success', async () => {
			const result = await handleUnlogSupplement(TEST_USER.id, {
				supplementId: TEST_SUPPLEMENT.id
			});
			expect(result.success).toBe(true);
		});

		test('accepts explicit date', async () => {
			const result = await handleUnlogSupplement(TEST_USER.id, {
				supplementId: TEST_SUPPLEMENT.id,
				date: '2026-02-09'
			});
			expect(result.success).toBe(true);
		});
	});

	describe('handleUpdateWeight', () => {
		test('returns success on valid update', async () => {
			mockUpdateWeightResult = { id: 'weight-1', weightKg: 76.0 };
			const result = await handleUpdateWeight(TEST_USER.id, {
				weightId: 'weight-1',
				weightKg: 76.0
			});
			expect(result.success).toBe(true);
			expect(result.weightId).toBe('weight-1');
		});

		test('returns error on failure', async () => {
			mockUpdateWeightResult = null;
			const result = await handleUpdateWeight(TEST_USER.id, {
				weightId: 'nonexistent'
			});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleDeleteWeight', () => {
		test('returns success when found', async () => {
			mockDeleteWeightResult = true;
			const result = await handleDeleteWeight(TEST_USER.id, { weightId: 'weight-1' });
			expect(result.success).toBe(true);
		});

		test('returns error when not found', async () => {
			mockDeleteWeightResult = null;
			const result = await handleDeleteWeight(TEST_USER.id, { weightId: 'nonexistent' });
			expect(result.error).toBe('Weight entry not found');
		});
	});

	describe('handleGetDailyBreakdown', () => {
		test('returns daily breakdown data', async () => {
			mockDailyBreakdown = [
				{ date: '2026-02-10', calories: 2000, protein: 150, carbs: 200, fat: 67, fiber: 30 }
			];
			const result = await handleGetDailyBreakdown(TEST_USER.id, {
				startDate: '2026-02-10',
				endDate: '2026-02-10'
			});
			expect(result).toHaveLength(1);
			expect(result[0].calories).toBe(2000);
		});

		test('returns empty array for no data', async () => {
			mockDailyBreakdown = [];
			const result = await handleGetDailyBreakdown(TEST_USER.id, {
				startDate: '2026-02-01',
				endDate: '2026-02-07'
			});
			expect(result).toEqual([]);
		});
	});

	describe('handleGetMealBreakdown', () => {
		test('returns meal breakdown data', async () => {
			mockMealBreakdown = [
				{ mealType: 'breakfast', calories: 500, protein: 30, carbs: 60, fat: 15, fiber: 8 }
			];
			const result = await handleGetMealBreakdown(TEST_USER.id, {
				startDate: '2026-02-01',
				endDate: '2026-02-07'
			});
			expect(result).toHaveLength(1);
			expect(result[0].mealType).toBe('breakfast');
		});

		test('returns empty array for no data', async () => {
			mockMealBreakdown = [];
			const result = await handleGetMealBreakdown(TEST_USER.id, {
				startDate: '2026-02-01',
				endDate: '2026-02-07'
			});
			expect(result).toEqual([]);
		});
	});

	describe('handleGetTopFoods', () => {
		test('returns top foods with defaults', async () => {
			mockTopFoods = [
				{ foodId: TEST_FOOD.id, recipeId: null, foodName: 'Oats', count: 5, calories: 389, protein: 13, carbs: 66, fat: 7, fiber: 11 }
			];
			const result = await handleGetTopFoods(TEST_USER.id, {});
			expect(result).toHaveLength(1);
			expect(result[0].foodName).toBe('Oats');
		});

		test('returns empty array when no data', async () => {
			mockTopFoods = [];
			const result = await handleGetTopFoods(TEST_USER.id, { days: 30, limit: 5 });
			expect(result).toEqual([]);
		});
	});

	describe('handleGetStreaks', () => {
		test('returns streak data', async () => {
			mockStreaks = { currentStreak: 5, longestStreak: 10 };
			const result = await handleGetStreaks(TEST_USER.id);
			expect(result.currentStreak).toBe(5);
			expect(result.longestStreak).toBe(10);
		});

		test('returns zero streaks when no data', async () => {
			mockStreaks = { currentStreak: 0, longestStreak: 0 };
			const result = await handleGetStreaks(TEST_USER.id);
			expect(result.currentStreak).toBe(0);
			expect(result.longestStreak).toBe(0);
		});
	});
});
