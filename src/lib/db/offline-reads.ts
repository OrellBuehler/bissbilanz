/**
 * Offline read handlers: serve cached data from Dexie when the network is unavailable.
 * Each handler produces the same JSON shape the server API would return.
 */
import { db } from '$lib/db';

type OfflineHandler = (url: URL) => Promise<unknown | null>;

const handlers: [pattern: string, handler: OfflineHandler][] = [
	// ── Foods list ──────────────────────────────────────────────
	[
		'/api/foods',
		async (url) => {
			const barcode = url.searchParams.get('barcode');
			if (barcode) {
				const food = (await db.foods.where('barcode').equals(barcode).first()) ?? null;
				return { food };
			}

			const q = url.searchParams.get('q');
			const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
			const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

			let foods = await db.foods.toArray();
			if (q) {
				const lower = q.toLowerCase();
				foods = foods.filter(
					(f) =>
						f.name.toLowerCase().includes(lower) ||
						f.brand?.toLowerCase().includes(lower)
				);
			}
			return { foods: foods.slice(offset, offset + limit) };
		}
	],

	// ── Single food ────────────────────────────────────────────
	[
		'/api/foods/',
		async (url) => {
			const id = extractId(url.pathname, '/api/foods/');
			if (!id) return null;
			const food = await db.foods.get(id);
			return food ? { food } : null;
		}
	],

	// ── Entries by date ────────────────────────────────────────
	[
		'/api/entries',
		async (url) => {
			const date = url.searchParams.get('date');
			if (!date) return null;
			const entries = await db.foodEntries.where('date').equals(date).toArray();
			// Sort by createdAt to match server order
			entries.sort(
				(a, b) =>
					new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
			);
			return { entries };
		}
	],

	// ── Recipes list ───────────────────────────────────────────
	[
		'/api/recipes',
		async (url) => {
			const pathParts = url.pathname.split('/').filter(Boolean);
			// Single recipe: /api/recipes/:id
			if (pathParts.length >= 3 && pathParts[2] !== '') {
				const id = pathParts[2];
				const recipe = await db.recipes.get(id);
				if (!recipe) return null;
				const ingredients = await db.recipeIngredients
					.where('recipeId')
					.equals(id)
					.toArray();
				return { recipe: { ...recipe, ingredients } };
			}
			// List
			const recipes = await db.recipes.toArray();
			return { recipes };
		}
	],

	// ── Goals ──────────────────────────────────────────────────
	[
		'/api/goals',
		async () => {
			const goals = await db.userGoals.toArray();
			return { goals: goals[0] ?? null };
		}
	],

	// ── Preferences ────────────────────────────────────────────
	[
		'/api/preferences',
		async () => {
			const prefs = await db.userPreferences.toArray();
			return { preferences: prefs[0] ?? null };
		}
	],

	// ── Meal Types ─────────────────────────────────────────────
	[
		'/api/meal-types',
		async () => {
			const mealTypes = await db.customMealTypes.orderBy('sortOrder').toArray();
			return { mealTypes };
		}
	],

	// ── Supplements list ───────────────────────────────────────
	[
		'/api/supplements/today',
		async () => {
			// Build checklist from cached supplements + logs
			const supplements = await db.supplements.filter((s) => s.isActive === true).toArray();
			const today = new Date().toISOString().slice(0, 10);
			const checklist = await Promise.all(
				supplements.map(async (s) => {
					const log = await db.supplementLogs
						.where('[supplementId+date]')
						.equals([s.id, today])
						.first();
					return {
						supplement: s,
						taken: !!log,
						takenAt: log?.takenAt ?? null
					};
				})
			);
			return { checklist, date: today };
		}
	],
	[
		'/api/supplements',
		async (url) => {
			const pathParts = url.pathname.split('/').filter(Boolean);
			// Single supplement: /api/supplements/:id
			if (pathParts.length >= 3 && !['today', 'history'].includes(pathParts[2])) {
				const id = pathParts[2];
				const supplement = await db.supplements.get(id);
				return supplement ? { supplement } : null;
			}
			const showAll = url.searchParams.get('all') === 'true';
			let supplements;
			if (showAll) {
				supplements = await db.supplements.toArray();
			} else {
				supplements = await db.supplements.filter((s) => s.isActive === true).toArray();
			}
			return { supplements };
		}
	],

	// ── Weight ─────────────────────────────────────────────────
	[
		'/api/weight/latest',
		async () => {
			const entries = await db.weightEntries.orderBy('entryDate').reverse().limit(1).toArray();
			return { entry: entries[0] ?? null };
		}
	],
	[
		'/api/weight',
		async () => {
			const entries = await db.weightEntries.orderBy('entryDate').toArray();
			return { entries };
		}
	],

	// ── Favorites ──────────────────────────────────────────────
	[
		'/api/favorites',
		async (url) => {
			const type = url.searchParams.get('type');
			const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
			const result: Record<string, unknown> = {};

			if (!type || type === 'foods') {
				const foods = await db.foods.filter((f) => f.isFavorite === true).limit(limit).toArray();
				result.foods = foods.map((f) => ({
					id: f.id,
					name: f.name,
					imageUrl: f.imageUrl,
					calories: f.calories,
					protein: f.protein,
					carbs: f.carbs,
					fat: f.fat,
					fiber: f.fiber,
					logCount: 0,
					type: 'food' as const
				}));
			}
			if (!type || type === 'recipes') {
				const recipes = await db.recipes
					.filter((r) => r.isFavorite === true)
					.limit(limit)
					.toArray();
				result.recipes = recipes.map((r) => ({
					id: r.id,
					name: r.name,
					imageUrl: r.imageUrl,
					calories: r.calories,
					protein: r.protein,
					carbs: r.carbs,
					fat: r.fat,
					logCount: 0,
					type: 'recipe' as const
				}));
			}
			return result;
		}
	],

	// ── Auth (serve from cache so layout load doesn't break) ───
	[
		'/api/auth/me',
		async () => {
			// Auth is cached by Workbox; this is a last-resort fallback
			return null;
		}
	],

	// ── Foods recent ───────────────────────────────────────────
	[
		'/api/foods/recent',
		async () => {
			// Return recently-used foods from cached entries
			const entries = await db.foodEntries
				.orderBy('createdAt')
				.reverse()
				.limit(50)
				.toArray();
			const foodIds = [...new Set(entries.map((e) => e.foodId).filter(Boolean))] as string[];
			const foods = await db.foods.bulkGet(foodIds);
			return { foods: foods.filter(Boolean) };
		}
	]
];

/**
 * Try to serve a GET request from Dexie.
 * Returns the response data object, or null if no handler/data available.
 */
export async function getOfflineData(url: string): Promise<unknown | null> {
	const parsed = new URL(url, 'http://localhost');
	const path = parsed.pathname;

	for (const [pattern, handler] of handlers) {
		if (path === pattern || (pattern.endsWith('/') && path.startsWith(pattern))) {
			return handler(parsed);
		}
		// Exact subpath match (e.g. /api/supplements/today)
		if (path.startsWith(pattern.replace(/\/$/, '') + '/') || path === pattern) {
			return handler(parsed);
		}
	}

	return null;
}

function extractId(pathname: string, prefix: string): string | null {
	const rest = pathname.slice(prefix.length);
	const id = rest.split('/')[0];
	return id || null;
}
