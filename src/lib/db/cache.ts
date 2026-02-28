/**
 * Cache population: write successful API responses into Dexie.
 * Each handler maps a URL pattern to the correct Dexie table(s).
 */
import { db } from '$lib/db';

type CacheHandler = (url: URL, data: Record<string, unknown>) => Promise<void>;

const cacheHandlers: [pattern: string, handler: CacheHandler][] = [
	// ── Foods ───────────────────────────────────────────────────
	[
		'/api/foods',
		async (url, data) => {
			if (Array.isArray(data.foods)) {
				await db.foods.bulkPut(data.foods);
			}
			// Single food lookup by barcode
			if (data.food && typeof data.food === 'object') {
				await db.foods.put(data.food as never);
			}
		}
	],

	// ── Single food by ID (/api/foods/:id) ─────────────────────
	[
		'/api/foods/',
		async (_url, data) => {
			if (data.food && typeof data.food === 'object') {
				await db.foods.put(data.food as never);
			}
		}
	],

	// ── Entries ─────────────────────────────────────────────────
	[
		'/api/entries',
		async (url, data) => {
			if (!Array.isArray(data.entries)) return;
			const date = url.searchParams.get('date');
			if (date) {
				// Replace all cached entries for this date
				await db.foodEntries.where('date').equals(date).delete();
			}
			await db.foodEntries.bulkPut(data.entries);
		}
	],

	// ── Recipes ─────────────────────────────────────────────────
	[
		'/api/recipes',
		async (_url, data) => {
			if (Array.isArray(data.recipes)) {
				await db.recipes.bulkPut(data.recipes);
			}
			// Single recipe with ingredients
			if (data.recipe && typeof data.recipe === 'object') {
				const recipe = data.recipe as Record<string, unknown>;
				await db.recipes.put(recipe as never);
				if (Array.isArray(recipe.ingredients)) {
					// Replace ingredients for this recipe
					await db.recipeIngredients
						.where('recipeId')
						.equals(recipe.id as string)
						.delete();
					await db.recipeIngredients.bulkPut(recipe.ingredients);
				}
			}
		}
	],

	// ── Goals ───────────────────────────────────────────────────
	[
		'/api/goals',
		async (_url, data) => {
			if (data.goals && typeof data.goals === 'object') {
				await db.userGoals.put(data.goals as never);
			}
		}
	],

	// ── Preferences ─────────────────────────────────────────────
	[
		'/api/preferences',
		async (_url, data) => {
			if (data.preferences && typeof data.preferences === 'object') {
				await db.userPreferences.put(data.preferences as never);
			}
		}
	],

	// ── Meal Types ──────────────────────────────────────────────
	[
		'/api/meal-types',
		async (_url, data) => {
			if (Array.isArray(data.mealTypes)) {
				await db.customMealTypes.bulkPut(data.mealTypes);
			}
		}
	],

	// ── Supplements ─────────────────────────────────────────────
	[
		'/api/supplements',
		async (_url, data) => {
			if (Array.isArray(data.supplements)) {
				await db.supplements.bulkPut(data.supplements);
			}
			// Today's checklist — extract supplement logs
			if (Array.isArray(data.checklist)) {
				for (const item of data.checklist) {
					if (item.supplement) {
						await db.supplements.put(item.supplement);
					}
					// Cache the log if taken
					if (item.taken && item.takenAt && item.supplement) {
						await db.supplementLogs.put({
							id: `${item.supplement.id}-${data.date}`,
							supplementId: item.supplement.id,
							userId: item.supplement.userId,
							date: data.date as string,
							takenAt: item.takenAt,
							createdAt: item.takenAt
						});
					}
				}
			}
		}
	],

	// ── Weight ──────────────────────────────────────────────────
	[
		'/api/weight',
		async (_url, data) => {
			if (Array.isArray(data.entries)) {
				await db.weightEntries.bulkPut(data.entries);
			}
			// Single entry (latest)
			if (data.entry && typeof data.entry === 'object') {
				await db.weightEntries.put(data.entry as never);
			}
		}
	],

	// ── Favorites (updates isFavorite flags) ────────────────────
	[
		'/api/favorites',
		async (_url, data) => {
			// Favorites response contains foods/recipes with computed logCount
			// We just update the isFavorite flag on existing cached items
			if (Array.isArray(data.foods)) {
				for (const fav of data.foods) {
					await db.foods.update(fav.id, { isFavorite: true }).catch(() => {});
				}
			}
			if (Array.isArray(data.recipes)) {
				for (const fav of data.recipes) {
					await db.recipes.update(fav.id, { isFavorite: true }).catch(() => {});
				}
			}
		}
	]
];

/**
 * Cache an API response in Dexie. Called after successful network GETs.
 * Fire-and-forget — errors are silently ignored to never block the UI.
 */
export async function cacheApiResponse(url: string, data: unknown): Promise<void> {
	if (!data || typeof data !== 'object') return;

	const parsed = new URL(url, 'http://localhost');
	const path = parsed.pathname;

	for (const [pattern, handler] of cacheHandlers) {
		if (path === pattern || path.startsWith(pattern)) {
			await handler(parsed, data as Record<string, unknown>);
			// Update sync metadata
			const tableName = pathnameToTable(path);
			if (tableName) {
				await db.syncMeta.put({ tableName, lastSyncedAt: Date.now() });
			}
			break;
		}
	}
}

function pathnameToTable(path: string): string | null {
	if (path.startsWith('/api/foods')) return 'foods';
	if (path.startsWith('/api/entries')) return 'foodEntries';
	if (path.startsWith('/api/recipes')) return 'recipes';
	if (path.startsWith('/api/goals')) return 'userGoals';
	if (path.startsWith('/api/preferences')) return 'userPreferences';
	if (path.startsWith('/api/meal-types')) return 'customMealTypes';
	if (path.startsWith('/api/supplements')) return 'supplements';
	if (path.startsWith('/api/weight')) return 'weightEntries';
	if (path.startsWith('/api/favorites')) return 'favorites';
	return null;
}
