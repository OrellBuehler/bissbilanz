/**
 * Dexie (IndexedDB) types for offline cache.
 * These mirror the server API response shapes — not the raw DB schema —
 * so cached data can be served directly without transformation.
 */

// ── Foods ──────────────────────────────────────────────────────────
export type DexieFood = {
	id: string;
	userId: string;
	name: string;
	brand: string | null;
	kind: 'food' | 'supplement';
	servingSize: number;
	servingUnit: string;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	// Fat breakdown
	saturatedFat: number | null;
	monounsaturatedFat: number | null;
	polyunsaturatedFat: number | null;
	transFat: number | null;
	cholesterol: number | null;
	omega3: number | null;
	omega6: number | null;
	// Sugar & carb details
	sugar: number | null;
	addedSugars: number | null;
	sugarAlcohols: number | null;
	starch: number | null;
	// Minerals
	sodium: number | null;
	potassium: number | null;
	calcium: number | null;
	iron: number | null;
	magnesium: number | null;
	phosphorus: number | null;
	zinc: number | null;
	copper: number | null;
	manganese: number | null;
	selenium: number | null;
	iodine: number | null;
	fluoride: number | null;
	chromium: number | null;
	molybdenum: number | null;
	chloride: number | null;
	// Vitamins
	vitaminA: number | null;
	vitaminC: number | null;
	vitaminD: number | null;
	vitaminE: number | null;
	vitaminK: number | null;
	vitaminB1: number | null;
	vitaminB2: number | null;
	vitaminB3: number | null;
	vitaminB5: number | null;
	vitaminB6: number | null;
	vitaminB7: number | null;
	vitaminB9: number | null;
	vitaminB12: number | null;
	// Other
	caffeine: number | null;
	alcohol: number | null;
	water: number | null;
	salt: number | null;
	barcode: string | null;
	isFavorite: boolean;
	nutriScore: string | null;
	novaGroup: number | null;
	additives: string[] | null;
	ingredientsText: string | null;
	imageUrl: string | null;
	// General en_US nouns for what the food physically is ("banana", "bottle").
	// Server-aggregated; no index needed, so no Dexie version bump.
	labels?: string[] | null;
	createdAt: string | null;
	updatedAt: string | null;
};

// ── Food Entries (denormalized from server JOINs) ──────────────────
export type DexieFoodEntry = {
	id: string;
	foodId: string | null;
	recipeId: string | null;
	date: string;
	mealType: string;
	servings: number;
	notes: string | null;
	// Denormalized fields from server JOIN
	foodName: string | null;
	calories: number | null;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
	fiber: number | null;
	servingSize: number | null;
	servingUnit: string | null;
	quickNutrients?: Record<string, number> | null;
	createdAt: string | null;
};

// ── Recipes ────────────────────────────────────────────────────────
export type DexieRecipe = {
	id: string;
	userId: string;
	name: string;
	totalServings: number;
	isFavorite: boolean;
	imageUrl: string | null;
	// Computed macros (from server aggregation)
	calories: number | null;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
	fiber: number | null;
	createdAt: string | null;
	updatedAt: string | null;
};

export type DexieRecipeIngredient = {
	id: string;
	recipeId: string;
	foodId: string;
	quantity: number;
	servingUnit: string;
	sortOrder: number;
};

// ── Goals ──────────────────────────────────────────────────────────
export type DexieUserGoals = {
	userId: string;
	calorieGoal: number;
	proteinGoal: number;
	carbGoal: number;
	fatGoal: number;
	fiberGoal: number;
	sodiumGoal: number | null;
	sugarGoal: number | null;
	updatedAt: string | null;
};

// ── Preferences ────────────────────────────────────────────────────
export type DexieFavoriteMealTimeframe = {
	id: string;
	userId: string;
	mealType: string;
	customMealTypeId: string | null;
	startMinute: number;
	endMinute: number;
	sortOrder: number;
};

export type DexieUserPreferences = {
	userId: string;
	showChartWidget: boolean;
	showFavoritesWidget: boolean;
	showSupplementsWidget: boolean;
	showWeightWidget: boolean;
	showMealBreakdownWidget: boolean;
	showTopFoodsWidget: boolean;
	showSleepWidget: boolean;
	widgetOrder: string[];
	mealOrder: string[];
	startPage: string;
	favoriteTapAction: string;
	favoriteMealAssignmentMode: string;
	visibleNutrients: string[];
	updatedAt: string | null;
	locale: string | null;
	timeZone: string | null;
	biologicalSex: 'male' | 'female' | null;
	favoriteMealTimeframes: DexieFavoriteMealTimeframe[];
};

// ── Custom Meal Types ──────────────────────────────────────────────
export type DexieCustomMealType = {
	id: string;
	userId: string;
	name: string;
	sortOrder: number;
	createdAt: string | null;
};

// ── Supplements ────────────────────────────────────────────────────
export type DexieSupplementIngredient = {
	id: string;
	supplementId: string;
	foodId: string;
	servings: number;
	sortOrder: number;
	food: DexieFood;
};

export type DexieSupplement = {
	id: string;
	userId: string;
	name: string;
	scheduleType: string;
	scheduleDays: number[] | null;
	scheduleStartDate: string | null;
	isActive: boolean;
	sortOrder: number;
	timeOfDay: string | null;
	/** Local wall-clock 'HH:MM' reminder times; mobile-only delivery. */
	reminderTimes: string[] | null;
	createdAt: string | null;
	updatedAt: string | null;
	ingredients: DexieSupplementIngredient[];
};

/** Client-side representation of a supplement being taken (derived from food_entries). */
export type DexieSupplementLog = {
	supplementId: string;
	date: string;
	takenAt: string;
	entryIds: string[];
};

// ── Weight ─────────────────────────────────────────────────────────
export type DexieWeightEntry = {
	id: string;
	userId: string;
	weightKg: number;
	entryDate: string;
	loggedAt: string;
	notes: string | null;
	createdAt: string | null;
	updatedAt: string | null;
};

// ── Sleep ───────────────────────────────────────────────────────────
export type DexieSleepEntry = {
	id: string;
	userId: string;
	entryDate: string;
	durationMinutes: number;
	quality: number;
	bedtime: string | null;
	wakeTime: string | null;
	wakeUps: number | null;
	sleepLatencyMinutes: number | null;
	deepSleepMinutes: number | null;
	lightSleepMinutes: number | null;
	remSleepMinutes: number | null;
	source: string | null;
	notes: string | null;
	loggedAt: string;
	createdAt: string | null;
	updatedAt: string | null;
};

// ── Day Properties ────────────────────────────────────────────────
export type DexieDayProperties = {
	date: string;
	isFastingDay: boolean;
};

// ── Sync Queue (replaces bissbilanz-offline IndexedDB) ─────────────
export type DexieSyncQueueItem = {
	id?: number;
	method: string;
	url: string;
	body: string;
	createdAt: number;
	affectedTable?: string;
	affectedId?: string;
	failedAt?: number;
	failureReason?: string;
	/**
	 * Stable per-mutation key sent as `Idempotency-Key`. Constant across every
	 * retry so the server dedupes replays instead of applying the write twice.
	 */
	idempotencyKey?: string;
	/**
	 * ISO-8601 instant the user made the edit, sent as `X-Client-Edited-At` for
	 * last-write-wins conflict resolution.
	 */
	clientEditedAt?: string;
	/** Transient-failure retry count, used to drive exponential backoff. */
	retryCount?: number;
	/** Epoch ms before which this item should not be retried (backoff gate). */
	nextAttemptAt?: number;
};

// ── Sync Metadata ──────────────────────────────────────────────────
export type DexieSyncMeta = {
	tableName: string;
	lastSyncedAt: number;
	/** Stores the full userId string for the __userId sentinel row. */
	userId?: string;
};
