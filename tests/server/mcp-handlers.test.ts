import { describe, test, expect, beforeEach } from 'vitest';
import {
	TEST_USER,
	TEST_FOOD,
	TEST_RECIPE,
	TEST_ENTRY,
	TEST_GOALS,
	TEST_SUPPLEMENT,
	TEST_MEAL_TYPE
} from '../helpers/fixtures';
import { createHandlers, type HandlerDeps } from '../../src/lib/server/mcp/create-handlers';
import { foodCreateSchema } from '../../src/lib/server/validation/foods';

// Mock state
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
let mockDeleteEntryResult: any = null;
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
let mockCreateFoodError: any = null;
let mockListFoodsArgs: any = null;
let mockSetLabelCalls: Array<{
	userId: string;
	foodId: string;
	labels: string[];
	source: string;
}> = [];
let mockLabelFoodMissing = false;
let mockOFFProduct: any = null;
let mockOFFSearchResults: any[] = [];
let mockCreateSleepResult: any = null;
let mockSleepEntries: any[] = [];
let mockLatestSleep: any = null;
let mockUpdateSleepResult: any = null;
let mockDeleteSleepResult: any = true;
let mockRangeWeights: any[] = [];
let mockSupplementHistory: any[] = [];
let mockFoodDiversity: any = null;
let mockMealTiming: any = null;
let mockSleepFoodCorrelation: any = null;
let mockWeightFoodSeries: any = null;
let mockExtendedNutrients: any = null;
let mockDailyNutrients: any = null;
let mockRdaEntries: any = [];
let mockNutrientCandidates: any = [];
let mockNutrientCandidateArgs: any = null;
let mockBiologicalSex: 'male' | 'female' | null = null;
let mockMealTypes: any[] = [];
let mockDayProperties: any = null;
let mockCalendarStats: any = null;
let mockComputedAverages: any = null;
let mockDateRangeEntries: any[] = [];
let mockFastingDays: Set<string> = new Set();
let mockAiTasks: any[] = [];
let mockAiTasksTotal = 0;
let mockListAiTasksArgs: any = null;
let mockAiTask: any = null;
let mockUpdateAiTaskResult: any = null;
let mockUpdateAiTaskCalls: any[] = [];
let mockDismissAiTaskByAgentCalls: any[] = [];

const TEST_AI_TASK = {
	id: 'ai-task-1',
	userId: TEST_USER.id,
	status: 'pending' as const,
	description: 'Chicken salad for lunch',
	photoUrl: '/uploads/10000000-0000-4000-8000-000000000099.webp',
	date: '2026-02-10',
	mealType: 'Lunch',
	source: 'ios',
	resultSummary: null,
	createdEntryIds: null,
	completedAt: null,
	createdAt: new Date('2026-02-10T08:00:00Z'),
	updatedAt: new Date('2026-02-10T08:00:00Z')
};

const mockDeps = {
	listFoods: async (userId: string, options: any) => {
		mockListFoodsArgs = options;
		return { items: mockFoods, total: mockFoods.length };
	},
	createFood: async () =>
		mockCreateFoodResult
			? { success: true, data: mockCreateFoodResult }
			: { success: false, error: mockCreateFoodError ?? new Error('Validation failed') },
	getFood: async () => mockFood,
	findFoodByBarcode: async () => mockBarcodeFood,
	updateFood: async () =>
		mockUpdateFoodResult
			? { success: true, data: mockUpdateFoodResult }
			: { success: false, error: new Error('Validation failed') },
	deleteFood: async () => mockDeleteFoodResult,
	listRecentFoods: async () => mockRecentFoods,
	listRecipes: async () => ({ items: mockRecipes, total: mockRecipes.length }),
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
	listEntriesByDate: async () => ({ items: mockEntries, total: mockEntries.length }),
	updateEntry: async () =>
		mockUpdateEntryResult
			? { success: true, data: mockUpdateEntryResult }
			: { success: false, error: new Error('Update failed') },
	deleteEntry: async () => mockDeleteEntryResult,
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
		goals,
		progress: goals ? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 } : null,
		entryCount: entries.length,
		byMeal: {}
	}),
	todayForUser: async () => '2026-02-10',
	getSupplementChecklist: async () => {
		const logMap = new Map(mockSupplementLogs.map((l: any) => [l.supplementId, l]));
		return mockSupplements.map((s: any) => ({
			supplement: s,
			taken: logMap.has(s.id),
			takenAt: logMap.get(s.id)?.takenAt ?? null
		}));
	},
	fetchProduct: async () => mockOFFProduct,
	searchProducts: async () => mockOFFSearchResults,
	createSleepEntry: async () =>
		mockCreateSleepResult
			? { success: true, data: mockCreateSleepResult }
			: { success: false, error: new Error('Validation failed') },
	getSleepEntriesByDateRange: async () => mockSleepEntries,
	getLatestSleep: async () => mockLatestSleep,
	updateSleepEntry: async () =>
		mockUpdateSleepResult
			? { success: true, data: mockUpdateSleepResult }
			: { success: false, error: new Error('Validation failed') },
	deleteSleepEntry: async () => mockDeleteSleepResult,
	getLogsForRange: async () => mockSupplementHistory,
	getFoodDiversityData: async () => mockFoodDiversity,
	getMealTimingData: async () => mockMealTiming,
	getSleepFoodCorrelationData: async () => mockSleepFoodCorrelation,
	getWeightFoodSeries: async () => mockWeightFoodSeries,
	getExtendedNutrientEntries: async () => mockExtendedNutrients,
	getDailyNutrientTotals: async () => mockDailyNutrients,
	getRdaNutrientEntries: async () => mockRdaEntries,
	getNutrientCandidates: async (userId: string, options: any) => {
		mockNutrientCandidateArgs = options;
		return mockNutrientCandidates;
	},
	getBiologicalSex: async () => mockBiologicalSex,
	getUserTimeZone: async () => 'UTC',
	listMealTypes: async () => mockMealTypes,
	getDayProperties: async () => mockDayProperties,
	setDayProperties: async () => mockDayProperties,
	deleteDayProperties: async () => {},
	getCalendarStats: async () => mockCalendarStats,
	computeAverages: () => mockComputedAverages,
	listEntriesByDateRange: async () => mockDateRangeEntries,
	getWeightEntriesByDateRange: async () => mockRangeWeights,
	getFastingDays: async () => mockFastingDays,
	listAiTasks: async (userId: string, options: any) => {
		mockListAiTasksArgs = options;
		return { tasks: mockAiTasks, total: mockAiTasksTotal };
	},
	getAiTask: async () => mockAiTask,
	updateAiTask: async (userId: string, id: string, payload: any) => {
		mockUpdateAiTaskCalls.push({ userId, id, payload });
		return { success: true, data: mockUpdateAiTaskResult ?? undefined };
	},
	dismissAiTaskByAgent: async (userId: string, id: string, reason: string) => {
		mockDismissAiTaskByAgentCalls.push({ userId, id, reason });
		return { success: true, data: mockUpdateAiTaskResult ?? undefined };
	},
	setFoodLabels: async (userId: string, foodId: string, labels: string[], source: string) => {
		mockSetLabelCalls.push({ userId, foodId, labels, source });
		return mockLabelFoodMissing ? null : labels;
	},
	setFoodLabelsBatch: async (userId: string, items: any[], source: string) => {
		for (const item of items) {
			mockSetLabelCalls.push({ userId, foodId: item.foodId, labels: item.labels, source });
		}
		return items.map((item, i) => ({ foodId: item.foodId, ok: i === 0, labels: item.labels }));
	}
} satisfies Record<string, Function> as unknown as HandlerDeps;

const {
	handleListUnlabeledFoods,
	handleSetFoodLabels,
	handleSetFoodLabelsBatch,
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
	handleGetMaintenanceCalories,
	handleCopyEntries,
	handleFindFoodByBarcode,
	handleGetSupplementStatus,
	handleLogSupplement,
	handleCreateSupplement,
	handleListSupplements,
	handleUpdateSupplement,
	handleDeleteSupplement,
	handleUnlogSupplement,
	handleSearchOpenFoodFacts,
	handleLogSleep,
	handleGetSleep,
	handleUpdateSleep,
	handleDeleteSleep,
	handleGetFoodDiversity,
	handleGetMealTiming,
	handleGetSleepFoodCorrelation,
	handleGetWeightFoodSeries,
	handleGetExtendedNutrients,
	handleGetDailyNutrients,
	handleGetNutrientGaps,
	handleFindNutrientSources,
	handleGetEatingPatterns,
	handleGetMealPlanContext,
	handleListMealTypes,
	handleGetSupplementHistory,
	handleGetDayProperties,
	handleSetDayProperties,
	handleDeleteDayProperties,
	handleGetCalendarStats,
	handleListAiTasks,
	handleGetAiTask,
	handleCompleteAiTask,
	handleDismissAiTask
} = createHandlers(mockDeps);

describe('MCP handlers', () => {
	beforeEach(() => {
		mockFoods = [];
		mockListFoodsArgs = null;
		mockSetLabelCalls = [];
		mockLabelFoodMissing = false;
		mockCreateFoodResult = null;
		mockCreateFoodError = null;
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
		mockDeleteEntryResult = { id: TEST_ENTRY.id, date: TEST_ENTRY.date };
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
		mockOFFProduct = null;
		mockOFFSearchResults = [];
		mockCreateSleepResult = null;
		mockSleepEntries = [];
		mockLatestSleep = null;
		mockUpdateSleepResult = null;
		mockDeleteSleepResult = true;
		mockSupplementHistory = [];
		mockFoodDiversity = null;
		mockMealTiming = null;
		mockSleepFoodCorrelation = null;
		mockWeightFoodSeries = null;
		mockExtendedNutrients = null;
		mockDailyNutrients = null;
		mockRdaEntries = [];
		mockNutrientCandidates = [];
		mockNutrientCandidateArgs = null;
		mockBiologicalSex = null;
		mockMealTypes = [];
		mockDayProperties = null;
		mockCalendarStats = null;
		mockComputedAverages = null;
		mockDateRangeEntries = [];
		mockFastingDays = new Set();
		mockAiTasks = [];
		mockAiTasksTotal = 0;
		mockListAiTasksArgs = null;
		mockAiTask = null;
		mockUpdateAiTaskResult = null;
		mockUpdateAiTaskCalls = [];
		mockDismissAiTaskByAgentCalls = [];
	});

	describe('handleSearchFoods', () => {
		test('returns matching foods with per-food recentlyUsed annotation', async () => {
			mockFoods = [TEST_FOOD];
			mockRecentFoods = [{ id: TEST_FOOD.id }];
			const result = await handleSearchFoods(TEST_USER.id, 'Oats');
			expect(result.foods).toHaveLength(1);
			expect((result.foods[0] as any).name).toBe('Oats');
			expect(result.foods[0].recentlyUsed).toBe(true);
		});

		test('returns empty array when no match', async () => {
			mockFoods = [];
			mockRecentFoods = [];
			const result = await handleSearchFoods(TEST_USER.id, 'nonexistent');
			expect(result.foods).toHaveLength(0);
		});

		test('marks non-recent foods as recentlyUsed false', async () => {
			mockFoods = [TEST_FOOD];
			mockRecentFoods = [];
			const result = await handleSearchFoods(TEST_USER.id, 'Oats');
			expect(result.foods[0].recentlyUsed).toBe(false);
		});
	});

	describe('handleCreateFood', () => {
		test('returns foodId and food on success', async () => {
			mockCreateFoodResult = { ...TEST_FOOD, id: 'new-food-id' };
			const result: any = await handleCreateFood(TEST_USER.id, {
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
			expect(result.food).toBeDefined();
		});

		test('returns error on validation failure', async () => {
			mockCreateFoodResult = null;
			const result: any = await handleCreateFood(TEST_USER.id, {});
			expect(result.error).toBeDefined();
		});

		test('create_food validation failure returns structured issues', async () => {
			mockCreateFoodError = foodCreateSchema.safeParse({ name: '' }).error;
			const result = await handleCreateFood(TEST_USER.id, { name: '' });
			expect(result).toMatchObject({ error: 'validation_failed' });
			expect(
				(result as unknown as { issues: Array<{ path: string }> }).issues.some(
					(i) => i.path === 'name'
				)
			).toBe(true);
		});
	});

	describe('handleCreateRecipe', () => {
		test('returns recipeId and recipe on success', async () => {
			mockCreateRecipeResult = { ...TEST_RECIPE, id: 'new-recipe-id' };
			const result: any = await handleCreateRecipe(TEST_USER.id, {
				name: 'Shake',
				totalServings: 2,
				ingredients: [{ foodId: TEST_FOOD.id, quantity: 1, servingUnit: 'cup' }]
			});
			expect(result.success).toBe(true);
			expect(result.recipeId).toBe('new-recipe-id');
			expect(result.recipe).toBeDefined();
		});

		test('returns error on failure', async () => {
			mockCreateRecipeResult = null;
			const result: any = await handleCreateRecipe(TEST_USER.id, {});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleLogFood', () => {
		test('returns entryId and dailyStatus on success', async () => {
			mockCreateEntryResult = { ...TEST_ENTRY, id: 'new-entry-id' };
			mockGoals = TEST_GOALS;
			const result: any = await handleLogFood(TEST_USER.id, {
				foodId: TEST_FOOD.id,
				mealType: 'breakfast',
				servings: 1,
				date: '2026-02-10'
			});
			expect(result.success).toBe(true);
			expect(result.entryId).toBe('new-entry-id');
			expect(result.dailyStatus).toBeDefined();
		});

		test('returns error on failure', async () => {
			mockCreateEntryResult = null;
			const result: any = await handleLogFood(TEST_USER.id, {});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleGetDailyStatus', () => {
		test('returns totals, goals, progress, entryCount, byMeal, and date', async () => {
			mockEntries = [];
			mockGoals = TEST_GOALS;
			const result = await handleGetDailyStatus(TEST_USER.id, '2026-02-10');
			expect(result.totals).toBeDefined();
			expect(result.goals).toBeDefined();
			expect(result.goals?.calorieGoal).toBe(2000);
			expect(result.progress).toBeDefined();
			expect(result.entryCount).toBeDefined();
			expect(result.byMeal).toBeDefined();
			expect(result.date).toBe('2026-02-10');
		});

		test('returns null goals and progress when user has none', async () => {
			mockEntries = [];
			mockGoals = null;
			const result = await handleGetDailyStatus(TEST_USER.id, '2026-02-10');
			expect(result.goals).toBeNull();
			expect(result.progress).toBeNull();
		});

		test('includes entries when includeEntries is true', async () => {
			mockEntries = [TEST_ENTRY];
			mockGoals = TEST_GOALS;
			const result = await handleGetDailyStatus(TEST_USER.id, '2026-02-10', true);
			expect((result as any).entries).toBeDefined();
			expect((result as any).entries).toHaveLength(1);
		});
	});

	describe('handleListEntries', () => {
		test('returns entries for date', async () => {
			mockEntries = [TEST_ENTRY];
			const result = await handleListEntries(TEST_USER.id, '2026-02-10');
			expect(result.date).toBe('2026-02-10');
			expect((result as any).entries).toHaveLength(1);
		});

		test('defaults to today when no date', async () => {
			mockEntries = [];
			const result = await handleListEntries(TEST_USER.id);
			expect(result.date).toBeDefined();
			expect(result.entries).toEqual([]);
		});
	});

	describe('handleUpdateEntry', () => {
		test('returns success and dailyStatus on valid update', async () => {
			mockUpdateEntryResult = { ...TEST_ENTRY, servings: 2 };
			const result: any = await handleUpdateEntry(TEST_USER.id, {
				entryId: TEST_ENTRY.id,
				servings: 2
			});
			expect(result.success).toBe(true);
			expect(result.entryId).toBe(TEST_ENTRY.id);
			expect(result.dailyStatus).toBeDefined();
		});

		test('returns error on failure', async () => {
			mockUpdateEntryResult = null;
			const result: any = await handleUpdateEntry(TEST_USER.id, {
				entryId: 'nonexistent',
				servings: 2
			});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleDeleteEntry', () => {
		test('returns success and dailyStatus', async () => {
			const result = await handleDeleteEntry(TEST_USER.id, TEST_ENTRY.id);
			expect(result.success).toBe(true);
			expect(result.dailyStatus).toBeDefined();
		});

		test('returns error when no entry matches', async () => {
			mockDeleteEntryResult = null;
			const result = await handleDeleteEntry(TEST_USER.id, TEST_ENTRY.id);
			expect(result.error).toBe('Entry not found');
			expect(result.success).toBeUndefined();
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
		test('returns success and goals on valid update', async () => {
			mockUpsertGoalsResult = TEST_GOALS;
			const result: any = await handleUpdateGoals(TEST_USER.id, {
				calorieGoal: 2000,
				proteinGoal: 150,
				carbGoal: 200,
				fatGoal: 67,
				fiberGoal: 30
			});
			expect(result.success).toBe(true);
			expect(result.goals).toBeDefined();
		});

		test('returns error on failure', async () => {
			mockUpsertGoalsResult = null;
			const result: any = await handleUpdateGoals(TEST_USER.id, {});
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
		test('returns success with weight details and structured change', async () => {
			mockLatestWeight = { id: 'weight-0', weightKg: 76.0, entryDate: '2026-02-09' };
			mockCreateWeightResult = { id: 'weight-1', weightKg: 75.5, entryDate: '2026-02-10' };
			const result: any = await handleLogWeight(TEST_USER.id, { weightKg: 75.5 });
			expect(result.success).toBe(true);
			expect(result.entryId).toBe('weight-1');
			expect(result.weightKg).toBe(75.5);
			expect(result.date).toBe('2026-02-10');
			expect(result.change).toEqual({
				previousKg: 76.0,
				previousDate: '2026-02-09',
				deltaKg: -0.5
			});
		});

		test('returns null change when no previous weight', async () => {
			mockLatestWeight = null;
			mockCreateWeightResult = { id: 'weight-1', weightKg: 75.5, entryDate: '2026-02-10' };
			const result: any = await handleLogWeight(TEST_USER.id, { weightKg: 75.5 });
			expect(result.success).toBe(true);
			expect(result.change).toBeNull();
		});

		test('returns error on failure', async () => {
			mockCreateWeightResult = null;
			const result: any = await handleLogWeight(TEST_USER.id, { weightKg: -5 });
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
			const result = (await handleGetWeeklyStats(TEST_USER.id)) as any;
			expect(result.calories).toBe(2000);
		});
	});

	describe('handleGetMonthlyStats', () => {
		test('returns monthly stats', async () => {
			mockMonthlyStats = { calories: 1800, protein: 140 };
			const result = (await handleGetMonthlyStats(TEST_USER.id)) as any;
			expect(result.calories).toBe(1800);
		});
	});

	describe('handleCopyEntries', () => {
		test('returns copied count and dailyStatus', async () => {
			mockCopyResult = [TEST_ENTRY, { ...TEST_ENTRY, id: 'entry-2' }];
			const result = await handleCopyEntries(TEST_USER.id, {
				fromDate: '2026-02-09',
				toDate: '2026-02-10'
			});
			expect(result.success).toBe(true);
			expect(result.copiedCount).toBe(2);
			expect(result.dailyStatus).toBeDefined();
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
		test('returns food from database when found', async () => {
			mockBarcodeFood = TEST_FOOD;
			const result = (await handleFindFoodByBarcode(TEST_USER.id, '1234567890123')) as any;
			expect(result.found).toBe(true);
			expect(result.source).toBe('database');
			expect(result.name).toBe('Oats');
		});

		test('falls back to Open Food Facts when not in database', async () => {
			mockBarcodeFood = null;
			mockOFFProduct = {
				name: 'OFF Product',
				brand: 'OFF Brand',
				calories: 200,
				protein: 10,
				carbs: 30,
				fat: 5,
				fiber: 3,
				barcode: '0000000000000'
			};
			const result = (await handleFindFoodByBarcode(TEST_USER.id, '0000000000000')) as any;
			expect(result.found).toBe(true);
			expect(result.source).toBe('openfoodfacts');
			expect(result.name).toBe('OFF Product');
			expect(result.hint).toBe(
				'This food was found in Open Food Facts. Use create_food to save it to your database.'
			);
		});

		test('returns not found when no match anywhere', async () => {
			mockBarcodeFood = null;
			mockOFFProduct = null;
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
		test('logs supplement by ID and returns status', async () => {
			mockLogSupplementResult = { id: 'log-1' };
			mockSupplementById = TEST_SUPPLEMENT;
			// Set up checklist mock state BEFORE calling handler
			mockSupplements = [TEST_SUPPLEMENT];
			mockSupplementLogs = [{ supplementId: TEST_SUPPLEMENT.id, takenAt: new Date() }];
			const result = await handleLogSupplement(TEST_USER.id, {
				supplementId: TEST_SUPPLEMENT.id
			});
			expect(result.success).toBe(true);
			expect(result.logged?.name).toBe('Vitamin D3');
			expect(result.status).toBeDefined();
			expect(result.status?.total).toBe(1);
			expect(result.status?.taken).toBe(1);
		});

		test('logs supplement by name search', async () => {
			mockSupplements = [TEST_SUPPLEMENT];
			mockLogSupplementResult = { id: 'log-1' };
			mockSupplementById = TEST_SUPPLEMENT;
			mockSupplementLogs = [{ supplementId: TEST_SUPPLEMENT.id, takenAt: new Date() }];
			const result = await handleLogSupplement(TEST_USER.id, {
				name: 'vitamin d'
			});
			expect(result.success).toBe(true);
		});

		test('returns error when name not found', async () => {
			mockSupplements = [];
			const result: any = await handleLogSupplement(TEST_USER.id, {
				name: 'nonexistent'
			});
			expect(result.success).toBe(false);
			expect(result.error).toContain('No supplement found');
		});

		test('returns error when neither name nor id provided', async () => {
			const result: any = await handleLogSupplement(TEST_USER.id, {});
			expect(result.success).toBe(false);
			expect(result.error).toContain('Provide either');
		});
	});

	describe('handleUpdateFood', () => {
		test('returns success on valid update', async () => {
			mockUpdateFoodResult = { ...TEST_FOOD, name: 'Updated Oats' };
			const result: any = await handleUpdateFood(TEST_USER.id, {
				foodId: TEST_FOOD.id,
				name: 'Updated Oats'
			});
			expect(result.success).toBe(true);
			expect(result.foodId).toBe(TEST_FOOD.id);
		});

		test('returns error on failure', async () => {
			mockUpdateFoodResult = null;
			const result: any = await handleUpdateFood(TEST_USER.id, {
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
			const result: any = await handleUpdateRecipe(TEST_USER.id, {
				recipeId: TEST_RECIPE.id,
				name: 'Updated Bowl'
			});
			expect(result.success).toBe(true);
			expect(result.recipeId).toBe(TEST_RECIPE.id);
		});

		test('returns error on failure', async () => {
			mockUpdateRecipeResult = null;
			const result: any = await handleUpdateRecipe(TEST_USER.id, {
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
			const result: any = await handleCreateSupplement(TEST_USER.id, {
				name: 'Vitamin D3',
				scheduleType: 'daily',
				ingredients: [{ foodId: '10000000-0000-4000-8000-000000000099' }]
			});
			expect(result.success).toBe(true);
			expect(result.supplementId).toBe('new-supp');
		});

		test('returns error on failure', async () => {
			mockCreateSupplementResult = null;
			const result: any = await handleCreateSupplement(TEST_USER.id, {});
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
			const result: any = await handleUpdateSupplement(TEST_USER.id, {
				supplementId: TEST_SUPPLEMENT.id,
				name: 'Updated D3'
			});
			expect(result.success).toBe(true);
			expect(result.supplementId).toBe(TEST_SUPPLEMENT.id);
		});

		test('returns error on failure', async () => {
			mockUpdateSupplementResult = null;
			const result: any = await handleUpdateSupplement(TEST_USER.id, {
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
			const result: any = await handleUpdateWeight(TEST_USER.id, {
				weightId: 'weight-1',
				weightKg: 76.0
			});
			expect(result.success).toBe(true);
			expect(result.weightId).toBe('weight-1');
		});

		test('returns error on failure', async () => {
			mockUpdateWeightResult = null;
			const result: any = await handleUpdateWeight(TEST_USER.id, {
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
			const result = (await handleGetDailyBreakdown(TEST_USER.id, {
				startDate: '2026-02-10',
				endDate: '2026-02-10'
			})) as any;
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

		test('rejects date range exceeding 366 days', async () => {
			const result = (await handleGetDailyBreakdown(TEST_USER.id, {
				startDate: '2020-01-01',
				endDate: '2026-02-07'
			})) as any;
			expect(result.error).toContain('exceeds maximum');
		});

		test('rejects inverted date range', async () => {
			const result = (await handleGetDailyBreakdown(TEST_USER.id, {
				startDate: '2026-02-07',
				endDate: '2026-02-01'
			})) as any;
			expect(result.error).toContain('before');
		});
	});

	describe('handleGetMealBreakdown', () => {
		test('returns meal breakdown data', async () => {
			mockMealBreakdown = [
				{ mealType: 'breakfast', calories: 500, protein: 30, carbs: 60, fat: 15, fiber: 8 }
			];
			const result = (await handleGetMealBreakdown(TEST_USER.id, {
				startDate: '2026-02-01',
				endDate: '2026-02-07'
			})) as any;
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
				{
					foodId: TEST_FOOD.id,
					recipeId: null,
					foodName: 'Oats',
					count: 5,
					calories: 389,
					protein: 13,
					carbs: 66,
					fat: 7,
					fiber: 11
				}
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

	describe('handleSearchOpenFoodFacts', () => {
		test('returns products from search', async () => {
			mockOFFSearchResults = [
				{
					name: 'Nutella',
					brand: 'Ferrero',
					calories: 539,
					protein: 6.3,
					carbs: 57.5,
					fat: 30.9,
					fiber: 3.4,
					barcode: '3017620422003'
				}
			];
			const result = await handleSearchOpenFoodFacts('nutella');
			expect(result.products).toHaveLength(1);
			expect(result.products[0].name).toBe('Nutella');
			expect(result.count).toBe(1);
		});

		test('returns empty array when no results', async () => {
			mockOFFSearchResults = [];
			const result = await handleSearchOpenFoodFacts('xyznonexistent');
			expect(result.products).toEqual([]);
			expect(result.count).toBe(0);
		});

		test('respects limit parameter', async () => {
			mockOFFSearchResults = [
				{ name: 'A', barcode: '1' },
				{ name: 'B', barcode: '2' },
				{ name: 'C', barcode: '3' }
			];
			const result = await handleSearchOpenFoodFacts('test', 3);
			expect(result.products).toHaveLength(3);
			expect(result.count).toBe(3);
		});
	});

	describe('handleGetSupplementStatus (with date param)', () => {
		test('returns checklist for explicit date', async () => {
			mockSupplements = [TEST_SUPPLEMENT];
			mockSupplementLogs = [];
			const result = await handleGetSupplementStatus(TEST_USER.id, '2026-02-09');
			expect(result.date).toBe('2026-02-09');
			expect(result.total).toBe(1);
			expect(result.pending).toBe(1);
		});
	});

	describe('handleLogSleep', () => {
		test('returns success with entryId and entry', async () => {
			mockCreateSleepResult = { id: 'sleep-1', durationMinutes: 480, quality: 4 };
			const result: any = await handleLogSleep(TEST_USER.id, {
				durationMinutes: 480,
				quality: 4
			});
			expect(result.success).toBe(true);
			expect(result.entryId).toBe('sleep-1');
			expect(result.entry).toBeDefined();
		});

		test('returns error on validation failure', async () => {
			mockCreateSleepResult = null;
			const result: any = await handleLogSleep(TEST_USER.id, {
				durationMinutes: 480,
				quality: 4
			});
			expect(result.error).toBeDefined();
		});
	});

	describe('handleGetSleep', () => {
		test('returns latest sleep when no range', async () => {
			mockLatestSleep = { id: 'sleep-1', durationMinutes: 480, quality: 4 };
			const result = (await handleGetSleep(TEST_USER.id, {})) as any;
			expect(result.id).toBe('sleep-1');
		});

		test('returns error when no entries and no range', async () => {
			mockLatestSleep = null;
			const result = (await handleGetSleep(TEST_USER.id, {})) as any;
			expect(result.error).toBe('No sleep entries found');
		});

		test('returns entries for date range', async () => {
			mockSleepEntries = [
				{ id: 'sleep-1', durationMinutes: 480, quality: 4, entryDate: '2026-02-10' }
			];
			const result = (await handleGetSleep(TEST_USER.id, {
				from: '2026-02-01',
				to: '2026-02-10'
			})) as any;
			expect(result.entries).toHaveLength(1);
		});

		test('respects limit when fetching range', async () => {
			mockSleepEntries = [
				{ id: 'sleep-1', durationMinutes: 480, quality: 4 },
				{ id: 'sleep-2', durationMinutes: 420, quality: 3 },
				{ id: 'sleep-3', durationMinutes: 360, quality: 2 }
			];
			const result = (await handleGetSleep(TEST_USER.id, {
				from: '2026-02-01',
				to: '2026-02-10',
				limit: 2
			})) as any;
			expect(result.entries).toHaveLength(2);
		});

		test('returns error when only from provided', async () => {
			const result = (await handleGetSleep(TEST_USER.id, { from: '2026-02-01' })) as any;
			expect(result.error).toContain('Provide both');
		});
	});

	describe('handleUpdateSleep', () => {
		test('returns success on valid update', async () => {
			mockUpdateSleepResult = { id: 'sleep-1', durationMinutes: 500, quality: 5 };
			const result: any = await handleUpdateSleep(TEST_USER.id, {
				id: 'sleep-1',
				durationMinutes: 500,
				quality: 5
			});
			expect(result.success).toBe(true);
			expect(result.entryId).toBe('sleep-1');
		});

		test('accepts entryDate param', async () => {
			mockUpdateSleepResult = { id: 'sleep-1', durationMinutes: 480, quality: 4 };
			const result: any = await handleUpdateSleep(TEST_USER.id, {
				id: 'sleep-1',
				entryDate: '2026-02-09'
			});
			expect(result.success).toBe(true);
		});

		test('returns error on failure', async () => {
			mockUpdateSleepResult = null;
			const result: any = await handleUpdateSleep(TEST_USER.id, { id: 'nonexistent' });
			expect(result.error).toBeDefined();
		});
	});

	describe('handleDeleteSleep', () => {
		test('returns success when entry found', async () => {
			mockDeleteSleepResult = true;
			const result = await handleDeleteSleep(TEST_USER.id, { id: 'sleep-1' });
			expect(result.success).toBe(true);
		});

		test('returns error when not found', async () => {
			mockDeleteSleepResult = null;
			const result = await handleDeleteSleep(TEST_USER.id, { id: 'nonexistent' });
			expect(result.error).toBe('Sleep entry not found');
		});
	});

	describe('handleGetFoodDiversity', () => {
		test('returns food diversity analytics data', async () => {
			mockFoodDiversity = { uniqueFoods: 10, categories: [] };
			const result = await handleGetFoodDiversity(TEST_USER.id, {
				startDate: '2026-02-01',
				endDate: '2026-02-28'
			});
			expect(result).toEqual(mockFoodDiversity);
		});
	});

	describe('handleGetMealTiming', () => {
		test('returns meal timing analytics data', async () => {
			mockMealTiming = { averageMealTimes: [], mealFrequency: [] };
			const result = await handleGetMealTiming(TEST_USER.id, {
				startDate: '2026-02-01',
				endDate: '2026-02-28'
			});
			expect(result).toEqual(mockMealTiming);
		});
	});

	describe('handleGetSleepFoodCorrelation', () => {
		test('returns sleep-food correlation data', async () => {
			mockSleepFoodCorrelation = { correlation: 0.42, dataPoints: [] };
			const result = await handleGetSleepFoodCorrelation(TEST_USER.id, {
				startDate: '2026-02-01',
				endDate: '2026-02-28'
			});
			expect(result).toEqual(mockSleepFoodCorrelation);
		});
	});

	describe('handleGetWeightFoodSeries', () => {
		test('returns weight-food series data', async () => {
			mockWeightFoodSeries = { series: [] };
			const result = await handleGetWeightFoodSeries(TEST_USER.id, {
				startDate: '2026-02-01',
				endDate: '2026-02-28'
			});
			expect(result).toEqual(mockWeightFoodSeries);
		});
	});

	describe('handleGetExtendedNutrients', () => {
		test('returns extended nutrient entries', async () => {
			mockExtendedNutrients = { days: [], averages: {} };
			const result = await handleGetExtendedNutrients(TEST_USER.id, {
				startDate: '2026-02-01',
				endDate: '2026-02-28'
			});
			expect(result).toEqual(mockExtendedNutrients);
		});
	});

	describe('handleGetDailyNutrients', () => {
		test('returns daily nutrient totals', async () => {
			mockDailyNutrients = [{ date: '2026-02-10', vitaminD: 20, calcium: 800 }];
			const result = await handleGetDailyNutrients(TEST_USER.id, {
				startDate: '2026-02-10',
				endDate: '2026-02-10'
			});
			expect(result).toEqual(mockDailyNutrients);
		});
	});

	describe('handleGetNutrientGaps', () => {
		/** One entry a day carrying the named nutrients, so coverage is a clean 1.0. */
		const entryDay = (date: string, nutrients: Record<string, number | null>) => ({
			date,
			mealType: 'Dinner',
			eatenAt: `${date}T18:00:00.000Z`,
			foodId: 'food-1',
			recipeId: null,
			foodName: 'Spinach',
			calories: 500,
			protein: 20,
			servings: 1,
			nutrients
		});

		test('flags a shortfall below the EAR as likely inadequate', async () => {
			mockBiologicalSex = 'male';
			mockRdaEntries = [
				entryDay('2026-02-08', { vitaminC: 10 }),
				entryDay('2026-02-09', { vitaminC: 10 })
			];
			const result: any = await handleGetNutrientGaps(TEST_USER.id, {});
			const vitaminC = result.nutrients.find((n: any) => n.key === 'vitaminC');
			expect(vitaminC.verdict).toBe('likely_inadequate');
			expect(vitaminC.avgIntake).toBe(10);
			expect(vitaminC.deficitPerDay).toBeCloseTo(80, 5);
			expect(result.biologicalSex).toBe('male');
			expect(result.biologicalSexSource).toBe('preference');
		});

		test('reports a nutrient nothing carried as unmeasured, never as adequate', async () => {
			mockRdaEntries = [entryDay('2026-02-09', { vitaminC: 200, calcium: null })];
			const result: any = await handleGetNutrientGaps(TEST_USER.id, {});
			const calcium = result.unmeasured.find((n: any) => n.key === 'calcium');
			expect(calcium.reason).toBe('no_data');
			expect(result.nutrients.some((n: any) => n.key === 'calcium')).toBe(false);
			expect(result.summary.unmeasured).toBeGreaterThan(0);
		});

		test('an explicit biologicalSex argument overrides the stored preference', async () => {
			mockBiologicalSex = 'male';
			mockRdaEntries = [entryDay('2026-02-09', { iron: 9 })];
			const male: any = await handleGetNutrientGaps(TEST_USER.id, {});
			const female: any = await handleGetNutrientGaps(TEST_USER.id, { biologicalSex: 'female' });
			const ironMale = male.nutrients.find((n: any) => n.key === 'iron');
			const ironFemale = female.nutrients.find((n: any) => n.key === 'iron');
			expect(ironFemale.target).toBeGreaterThan(ironMale.target);
			expect(female.biologicalSexSource).toBe('argument');
		});

		test('sodium is a ceiling, so going over it reports above_limit', async () => {
			mockBiologicalSex = 'male';
			mockRdaEntries = [entryDay('2026-02-09', { sodium: 4000 })];
			const result: any = await handleGetNutrientGaps(TEST_USER.id, {});
			const sodium = result.nutrients.find((n: any) => n.key === 'sodium');
			expect(sodium.verdict).toBe('above_limit');
			expect(sodium.deficitPerDay).toBeGreaterThan(0);
		});

		test('includeAdequate=false drops the nutrients that are fine', async () => {
			mockBiologicalSex = 'male';
			mockRdaEntries = [entryDay('2026-02-09', { vitaminC: 500 })];
			const result: any = await handleGetNutrientGaps(TEST_USER.id, { includeAdequate: false });
			expect(result.nutrients.every((n: any) => n.verdict !== 'likely_adequate')).toBe(true);
		});

		test('rejects a range longer than the maximum', async () => {
			const result: any = await handleGetNutrientGaps(TEST_USER.id, {
				startDate: '2024-01-01',
				endDate: '2026-02-10'
			});
			expect(result.error).toContain('exceeds maximum');
		});
	});

	describe('handleFindNutrientSources', () => {
		const candidate = (name: string, amounts: Record<string, number>, extra: any = {}) => ({
			kind: 'food' as const,
			id: name,
			name,
			brand: null,
			servingSize: 100,
			servingUnit: 'g',
			caloriesPerServing: 100,
			amounts,
			isFavorite: false,
			timesLogged: 0,
			lastLoggedDate: null,
			...extra
		});

		test('names the valid keys when given an unknown one', async () => {
			const result: any = await handleFindNutrientSources(TEST_USER.id, {
				nutrients: ['unobtainium']
			});
			expect(result.error).toContain('unobtainium');
			expect(result.error).toContain('vitaminC');
		});

		test('ranks the richer source first and passes the gap keys through', async () => {
			mockBiologicalSex = 'male';
			mockRdaEntries = [
				{
					date: '2026-02-09',
					mealType: 'Dinner',
					eatenAt: '2026-02-09T18:00:00.000Z',
					foodId: 'f1',
					recipeId: null,
					foodName: 'Rice',
					calories: 500,
					protein: 10,
					servings: 1,
					nutrients: { vitaminC: 5 }
				}
			];
			mockNutrientCandidates = [
				candidate('Weak pepper', { vitaminC: 5 }),
				candidate('Strong pepper', { vitaminC: 60 })
			];
			const result: any = await handleFindNutrientSources(TEST_USER.id, {
				nutrients: ['vitaminC']
			});
			expect(mockNutrientCandidateArgs.keys).toEqual(['vitaminC']);
			expect(result.candidates[0].name).toBe('Strong pepper');
			expect(result.candidates[0].perNutrient[0].pctOfGap).toBeGreaterThan(0);
			expect(result.candidates[0].practical).toBe(true);
		});

		test('says so instead of ranking when nothing is short', async () => {
			mockBiologicalSex = 'male';
			mockRdaEntries = [
				{
					date: '2026-02-09',
					mealType: 'Dinner',
					eatenAt: '2026-02-09T18:00:00.000Z',
					foodId: 'f1',
					recipeId: null,
					foodName: 'Pepper',
					calories: 500,
					protein: 10,
					servings: 1,
					nutrients: { vitaminC: 500 }
				}
			];
			const result: any = await handleFindNutrientSources(TEST_USER.id, {
				nutrients: ['vitaminC']
			});
			expect(result.candidates).toEqual([]);
			expect(result.notes[0]).toContain('nothing to close');
		});

		test('warns that catalog results are not in the database yet', async () => {
			mockBiologicalSex = 'male';
			mockRdaEntries = [
				{
					date: '2026-02-09',
					mealType: 'Dinner',
					eatenAt: '2026-02-09T18:00:00.000Z',
					foodId: 'f1',
					recipeId: null,
					foodName: 'Rice',
					calories: 500,
					protein: 10,
					servings: 1,
					nutrients: { vitaminC: 5 }
				}
			];
			mockNutrientCandidates = [
				{ ...candidate('Catalog pepper', { vitaminC: 60 }), kind: 'catalog' as const }
			];
			const result: any = await handleFindNutrientSources(TEST_USER.id, {
				nutrients: ['vitaminC'],
				catalogQuery: 'pepper'
			});
			expect(mockNutrientCandidateArgs.catalogQuery).toBe('pepper');
			expect(result.notes.join(' ')).toContain('create_food');
		});
	});

	describe('handleGetEatingPatterns', () => {
		test('summarises meal slots and omits per-day windows', async () => {
			mockDailyNutrients = [
				{ date: '2026-02-09', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 }
			];
			mockRdaEntries = [
				{
					date: '2026-02-09',
					mealType: 'Breakfast',
					eatenAt: '2026-02-09T07:00:00.000Z',
					foodId: 'f1',
					recipeId: null,
					foodName: 'Oats',
					calories: 400,
					protein: 15,
					servings: 1,
					nutrients: {}
				},
				{
					date: '2026-02-09',
					mealType: 'Dinner',
					eatenAt: '2026-02-09T19:00:00.000Z',
					foodId: 'f2',
					recipeId: null,
					foodName: 'Salmon',
					calories: 600,
					protein: 45,
					servings: 1,
					nutrients: {}
				}
			];
			const result: any = await handleGetEatingPatterns(TEST_USER.id, {});
			expect(result.mealSlots.map((s: any) => s.mealType)).toEqual(['Dinner', 'Breakfast']);
			expect(result.mealSlots[0].avgTimeHHmm).toBe('19:00');
			expect(result.mealSlots[0].sharePct).toBeCloseTo(60, 5);
			expect(result.mealTiming).not.toHaveProperty('dailyWindows');
			expect(result.proteinThresholdG).toBeGreaterThan(0);
		});
	});

	describe('handleGetMealPlanContext', () => {
		test('bundles goals, gaps and habits within a sane payload size', async () => {
			mockBiologicalSex = 'male';
			mockGoals = TEST_GOALS;
			mockRecipes = [];
			mockTopFoods = [];
			mockMealTypes = ['Breakfast', 'Dinner'];
			mockDailyNutrients = [
				{ date: '2026-02-09', calories: 2000, protein: 100, carbs: 200, fat: 70, fiber: 25 }
			];
			mockRdaEntries = [
				{
					date: '2026-02-09',
					mealType: 'Dinner',
					eatenAt: '2026-02-09T19:00:00.000Z',
					foodId: 'f1',
					recipeId: null,
					foodName: 'Salmon',
					calories: 2000,
					protein: 100,
					servings: 1,
					nutrients: { vitaminC: 5 }
				}
			];
			const result: any = await handleGetMealPlanContext(TEST_USER.id, {});
			expect(result.planDays).toBe(7);
			expect(result.timeZone).toBe('UTC');
			expect(result.mealTypes).toEqual(['Breakfast', 'Dinner']);
			expect(result.gaps.priority.some((g: any) => g.key === 'vitaminC')).toBe(true);
			expect(result.gaps.unmeasuredKeys.length).toBeGreaterThan(0);
			expect(result.notes.join(' ')).toContain('unknown, not adequate');
			expect(JSON.stringify(result).length).toBeLessThan(40_000);
		});

		test('caps the priority gap list', async () => {
			mockBiologicalSex = 'male';
			mockDailyNutrients = [];
			mockRdaEntries = [
				{
					date: '2026-02-09',
					mealType: 'Dinner',
					eatenAt: '2026-02-09T19:00:00.000Z',
					foodId: 'f1',
					recipeId: null,
					foodName: 'Salmon',
					calories: 2000,
					protein: 100,
					servings: 1,
					nutrients: { vitaminC: 1, iron: 1, calcium: 1, zinc: 1, magnesium: 1 }
				}
			];
			const result: any = await handleGetMealPlanContext(TEST_USER.id, { maxGapNutrients: 2 });
			expect(result.gaps.priority).toHaveLength(2);
		});
	});

	describe('handleListMealTypes', () => {
		test('returns meal types', async () => {
			mockMealTypes = [TEST_MEAL_TYPE];
			const result = await handleListMealTypes(TEST_USER.id);
			expect(result.mealTypes).toHaveLength(1);
			expect(result.mealTypes[0].name).toBe('Pre-Workout');
		});

		test('returns empty array when no custom meal types', async () => {
			mockMealTypes = [];
			const result = await handleListMealTypes(TEST_USER.id);
			expect(result.mealTypes).toEqual([]);
		});
	});

	describe('handleGetSupplementHistory', () => {
		test('returns supplement history for date range', async () => {
			mockSupplementHistory = [
				{ supplementId: TEST_SUPPLEMENT.id, date: '2026-02-10', takenAt: new Date() }
			];
			const result = (await handleGetSupplementHistory(TEST_USER.id, {
				from: '2026-02-01',
				to: '2026-02-28'
			})) as any;
			expect(result.history).toHaveLength(1);
		});

		test('returns empty history when no logs in range', async () => {
			mockSupplementHistory = [];
			const result = (await handleGetSupplementHistory(TEST_USER.id, {
				from: '2026-01-01',
				to: '2026-01-31'
			})) as any;
			expect(result.history).toEqual([]);
		});
	});

	describe('handleGetDayProperties', () => {
		test('returns day properties for date', async () => {
			mockDayProperties = { isFastingDay: true };
			const result = await handleGetDayProperties(TEST_USER.id, { date: '2026-02-10' });
			expect(result.date).toBe('2026-02-10');
			expect(result.properties).toEqual(mockDayProperties);
		});

		test('returns null properties when none set', async () => {
			mockDayProperties = null;
			const result = await handleGetDayProperties(TEST_USER.id, { date: '2026-02-10' });
			expect(result.date).toBe('2026-02-10');
			expect(result.properties).toBeNull();
		});
	});

	describe('handleSetDayProperties', () => {
		test('returns success and properties', async () => {
			mockDayProperties = { isFastingDay: true };
			const result = await handleSetDayProperties(TEST_USER.id, {
				date: '2026-02-10',
				isFastingDay: true
			});
			expect(result.success).toBe(true);
			expect(result.properties).toEqual(mockDayProperties);
		});
	});

	describe('handleDeleteDayProperties', () => {
		test('returns success', async () => {
			const result = await handleDeleteDayProperties(TEST_USER.id, { date: '2026-02-10' });
			expect(result.success).toBe(true);
		});
	});

	describe('handleGetCalendarStats', () => {
		test('returns calendar stats for month', async () => {
			mockCalendarStats = { days: [], totalDays: 28 };
			const result = await handleGetCalendarStats(TEST_USER.id, { month: '2026-02' });
			expect(result).toEqual(mockCalendarStats);
		});
	});

	describe('handleGetWeeklyStats (with date range)', () => {
		test('uses computeAverages when startDate and endDate provided', async () => {
			mockComputedAverages = { calories: 1900, protein: 145 };
			mockDateRangeEntries = [TEST_ENTRY];
			mockFastingDays = new Set(['2026-02-05']);
			const result = await handleGetWeeklyStats(TEST_USER.id, '2026-02-01', '2026-02-07');
			expect(result).toEqual(mockComputedAverages);
		});

		test('uses getWeeklyStats when no date range provided', async () => {
			mockWeeklyStats = { calories: 2000, protein: 150 };
			const result = await handleGetWeeklyStats(TEST_USER.id);
			expect(result).toEqual(mockWeeklyStats);
		});
	});

	describe('handleGetMonthlyStats (with date range)', () => {
		test('uses computeAverages when startDate and endDate provided', async () => {
			mockComputedAverages = { calories: 1850, protein: 140 };
			mockDateRangeEntries = [TEST_ENTRY];
			mockFastingDays = new Set();
			const result = await handleGetMonthlyStats(TEST_USER.id, '2026-01-01', '2026-01-31');
			expect(result).toEqual(mockComputedAverages);
		});

		test('uses getMonthlyStats when no date range provided', async () => {
			mockMonthlyStats = { calories: 1800, protein: 140 };
			const result = await handleGetMonthlyStats(TEST_USER.id);
			expect(result).toEqual(mockMonthlyStats);
		});
	});

	describe('handleSearchFoods (with limit and offset)', () => {
		test('passes limit param through', async () => {
			mockFoods = [TEST_FOOD];
			mockRecentFoods = [];
			const result = await handleSearchFoods(TEST_USER.id, 'Oats', 10);
			expect(result.foods).toHaveLength(1);
		});

		test('passes offset param through', async () => {
			mockFoods = [];
			mockRecentFoods = [];
			const result = await handleSearchFoods(TEST_USER.id, 'Oats', 10, 5);
			expect(result.foods).toHaveLength(0);
		});
	});

	describe('handleListAiTasks', () => {
		test('serializes tasks and hides the raw photoUrl behind hasPhoto', async () => {
			mockAiTasks = [TEST_AI_TASK, { ...TEST_AI_TASK, id: 'ai-task-2', photoUrl: null }];
			mockAiTasksTotal = 2;
			const result = await handleListAiTasks(TEST_USER.id, {});
			expect(result.total).toBe(2);
			expect(result.tasks).toHaveLength(2);
			expect(result.tasks[0]).not.toHaveProperty('photoUrl');
			expect(result.tasks[0].hasPhoto).toBe(true);
			expect(result.tasks[1].hasPhoto).toBe(false);
			expect(result.tasks[0].id).toBe(TEST_AI_TASK.id);
			expect(result.tasks[0].status).toBe('pending');
		});

		test('defaults status to pending when not provided', async () => {
			await handleListAiTasks(TEST_USER.id, {});
			expect(mockListAiTasksArgs.status).toBe('pending');
		});

		test('passes through an explicit status, limit, and offset', async () => {
			await handleListAiTasks(TEST_USER.id, { status: 'completed', limit: 10, offset: 5 });
			expect(mockListAiTasksArgs).toEqual({ status: 'completed', limit: 10, offset: 5 });
		});

		test('returns empty list when there are no tasks', async () => {
			mockAiTasks = [];
			mockAiTasksTotal = 0;
			const result = await handleListAiTasks(TEST_USER.id, {});
			expect(result.tasks).toEqual([]);
			expect(result.total).toBe(0);
		});
	});

	describe('handleGetAiTask', () => {
		test('returns an isError result when the task is not found', async () => {
			mockAiTask = null;
			const result = await handleGetAiTask(TEST_USER.id, 'nonexistent');
			expect(result.isError).toBe(true);
			expect(result.content[0].type).toBe('text');
			expect((result.content[0] as { text: string }).text).toContain('not found');
		});

		test('returns a single text block with no photo', async () => {
			mockAiTask = { ...TEST_AI_TASK, photoUrl: null };
			const result = await handleGetAiTask(TEST_USER.id, TEST_AI_TASK.id);
			expect(result.isError).toBeUndefined();
			expect(result.content).toHaveLength(1);
			expect(result.content[0].type).toBe('text');
			const payload = JSON.parse((result.content[0] as { text: string }).text);
			expect(payload.hasPhoto).toBe(false);
			expect(payload).not.toHaveProperty('photoUrl');
		});

		test('appends an unavailable note when the photo file is missing', async () => {
			mockAiTask = TEST_AI_TASK;
			const result = await handleGetAiTask(TEST_USER.id, TEST_AI_TASK.id);
			expect(result.isError).toBeUndefined();
			expect(result.content).toHaveLength(2);
			expect(result.content[0].type).toBe('text');
			const payload = JSON.parse((result.content[0] as { text: string }).text);
			expect(payload.hasPhoto).toBe(true);
			expect(result.content[1].type).toBe('text');
			expect((result.content[1] as { text: string }).text).toContain('unavailable');
		});
	});

	describe('handleCompleteAiTask', () => {
		test('stamps status completed with resultSummary and entryIds', async () => {
			mockUpdateAiTaskResult = {
				...TEST_AI_TASK,
				status: 'completed',
				resultSummary: 'Logged chicken salad',
				createdEntryIds: ['entry-1', 'entry-2']
			};
			const result: any = await handleCompleteAiTask(TEST_USER.id, {
				id: TEST_AI_TASK.id,
				resultSummary: 'Logged chicken salad',
				entryIds: ['entry-1', 'entry-2']
			});
			expect(result.success).toBe(true);
			expect(result.task.status).toBe('completed');
			expect(result.task.resultSummary).toBe('Logged chicken salad');
			expect(result.task.createdEntryIds).toEqual(['entry-1', 'entry-2']);
			expect(mockUpdateAiTaskCalls).toHaveLength(1);
			expect(mockUpdateAiTaskCalls[0].payload).toEqual({
				status: 'completed',
				resultSummary: 'Logged chicken salad',
				createdEntryIds: ['entry-1', 'entry-2']
			});
		});

		test('returns error when task not found', async () => {
			mockUpdateAiTaskResult = null;
			const result: any = await handleCompleteAiTask(TEST_USER.id, {
				id: 'nonexistent',
				resultSummary: 'Logged something'
			});
			expect(result.error).toBe('AI task not found');
		});
	});

	describe('handleDismissAiTask', () => {
		test('dismisses through the agent path with the given reason', async () => {
			mockUpdateAiTaskResult = {
				...TEST_AI_TASK,
				status: 'dismissed',
				resultSummary: 'Duplicate task'
			};
			const result: any = await handleDismissAiTask(TEST_USER.id, {
				id: TEST_AI_TASK.id,
				reason: 'Duplicate task'
			});
			expect(result.success).toBe(true);
			expect(result.task.status).toBe('dismissed');
			expect(result.task.resultSummary).toBe('Duplicate task');
			expect(mockDismissAiTaskByAgentCalls).toEqual([
				{ userId: TEST_USER.id, id: TEST_AI_TASK.id, reason: 'Duplicate task' }
			]);
		});

		test('never routes through updateAiTask, which would mark the task as seen', async () => {
			mockUpdateAiTaskResult = { ...TEST_AI_TASK, status: 'dismissed' };
			await handleDismissAiTask(TEST_USER.id, {
				id: TEST_AI_TASK.id,
				reason: 'Photo is too blurry to identify'
			});
			expect(mockUpdateAiTaskCalls).toHaveLength(0);
		});

		test('returns error when task not found', async () => {
			mockUpdateAiTaskResult = null;
			const result: any = await handleDismissAiTask(TEST_USER.id, {
				id: 'nonexistent',
				reason: 'Duplicate task'
			});
			expect(result.error).toBe('AI task not found');
		});
	});
});

describe('handleGetMaintenanceCalories', () => {
	beforeEach(() => {
		mockRangeWeights = [];
		mockDateRangeEntries = [];
		mockFastingDays = new Set();
	});

	test('returns insufficient_data with fewer than two weights', async () => {
		mockRangeWeights = [{ entryDate: '2026-02-01', weightKg: 80 }];
		const result = await handleGetMaintenanceCalories(TEST_USER.id, {
			startDate: '2026-02-01',
			endDate: '2026-02-28'
		});
		expect(result).toMatchObject({ error: 'insufficient_data' });
	});

	test('computes a report from weights and entries', async () => {
		mockRangeWeights = [
			{ entryDate: '2026-02-01', weightKg: 80 },
			{ entryDate: '2026-02-28', weightKg: 79 }
		];
		mockDateRangeEntries = [
			{ date: '2026-02-01', calories: 2000, protein: 0, carbs: 0, fat: 0, fiber: 0, servings: 1 },
			{ date: '2026-02-02', calories: 2000, protein: 0, carbs: 0, fat: 0, fiber: 0, servings: 1 }
		];
		const result = await handleGetMaintenanceCalories(TEST_USER.id, {
			startDate: '2026-02-01',
			endDate: '2026-02-28'
		});
		expect(result).toMatchObject({
			result: { weightChangeKg: -1, days: 27 },
			meta: { weightEntries: 2, foodEntryDays: 2, totalDays: 28 }
		});
	});

	test('defaults to the 28 days ending today', async () => {
		mockRangeWeights = [
			{ entryDate: '2026-02-01', weightKg: 80 },
			{ entryDate: '2026-02-28', weightKg: 79 }
		];
		mockDateRangeEntries = [
			{ date: '2026-02-10', calories: 2000, protein: 0, carbs: 0, fat: 0, fiber: 0, servings: 1 }
		];
		const result = (await handleGetMaintenanceCalories(TEST_USER.id, {})) as any;
		expect(result.meta.totalDays).toBe(28);
		expect(result.meta.endDate).toBe(await mockDeps.todayForUser(TEST_USER.id));
	});

	test('rejects an inverted range', async () => {
		const result = await handleGetMaintenanceCalories(TEST_USER.id, {
			startDate: '2026-03-01',
			endDate: '2026-02-01'
		});
		expect(result).toMatchObject({ error: 'startDate must be before endDate' });
	});
});

describe('food label handlers', () => {
	beforeEach(() => {
		mockFoods = [];
		mockListFoodsArgs = null;
		mockSetLabelCalls = [];
		mockLabelFoodMissing = false;
	});

	test('list_unlabeled_foods asks for unlabeled foods only', async () => {
		mockFoods = [
			{
				...TEST_FOOD,
				brand: 'Chiquita',
				ingredientsText: 'x'.repeat(500)
			}
		];
		const result: any = await handleListUnlabeledFoods(TEST_USER.id, { limit: 10, offset: 5 });

		expect(mockListFoodsArgs).toMatchObject({ unlabeled: true, limit: 10, offset: 5 });
		expect(result.total).toBe(1);
		// Only what the model needs to identify the food — not the full nutrition row.
		expect(Object.keys(result.foods[0]).sort()).toEqual(['brand', 'id', 'ingredientsText', 'name']);
		expect(result.foods[0].ingredientsText).toHaveLength(200);
	});

	test('list_unlabeled_foods defaults to a page of 50', async () => {
		await handleListUnlabeledFoods(TEST_USER.id, {});
		expect(mockListFoodsArgs.limit).toBe(50);
	});

	test('set_food_labels forces source llm — a client cannot write as the user', async () => {
		const result: any = await handleSetFoodLabels(TEST_USER.id, {
			foodId: TEST_FOOD.id,
			labels: ['banana']
		});
		expect(mockSetLabelCalls).toEqual([
			{ userId: TEST_USER.id, foodId: TEST_FOOD.id, labels: ['banana'], source: 'llm' }
		]);
		expect(result).toEqual({ success: true, foodId: TEST_FOOD.id, labels: ['banana'] });
	});

	test('set_food_labels reports a missing food instead of throwing', async () => {
		mockLabelFoodMissing = true;
		const result: any = await handleSetFoodLabels(TEST_USER.id, {
			foodId: TEST_FOOD.id,
			labels: ['banana']
		});
		expect(result).toEqual({ error: 'Food not found' });
	});

	test('set_food_labels_batch forces source llm and counts the successes', async () => {
		const result: any = await handleSetFoodLabelsBatch(TEST_USER.id, {
			items: [
				{ foodId: TEST_FOOD.id, labels: ['banana'] },
				{ foodId: TEST_RECIPE.id, labels: ['ghost'] }
			]
		});
		expect(mockSetLabelCalls.every((c) => c.source === 'llm')).toBe(true);
		expect(result.labeled).toBe(1);
		expect(result.results).toHaveLength(2);
	});
});
