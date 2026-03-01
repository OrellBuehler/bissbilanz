/**
 * Offline read handlers: serve cached data from Dexie when the network is unavailable.
 * Each handler produces the same JSON shape the server API would return.
 *
 * Route matching uses an explicit function-based approach to avoid
 * fragile prefix/order-dependent pattern matching.
 */
import { db } from '$lib/db';

type OfflineHandler = (url: URL) => Promise<unknown | null>;

/**
 * Parse a URL path into segments: '/api/foods/abc' => ['api', 'foods', 'abc']
 */
function segments(path: string): string[] {
	return path.split('/').filter(Boolean);
}

/**
 * Route table. Each entry has a `match` function that checks the path,
 * ensuring there is no ambiguity or order dependence between similar routes.
 */
const routes: { match: (segs: string[], url: URL) => boolean; handler: OfflineHandler }[] = [
	// ── Foods: /api/foods/recent ──────────────────────────────
	{
		match: (s) => s.length === 3 && s[0] === 'api' && s[1] === 'foods' && s[2] === 'recent',
		handler: async () => {
			const entries = await db.foodEntries.orderBy('createdAt').reverse().limit(50).toArray();
			const foodIds = [...new Set(entries.map((e) => e.foodId).filter(Boolean))] as string[];
			const foods = await db.foods.bulkGet(foodIds);
			return { foods: foods.filter(Boolean) };
		}
	},

	// ── Foods: /api/foods/:id ────────────────────────────────
	{
		match: (s) => s.length === 3 && s[0] === 'api' && s[1] === 'foods' && s[2] !== 'recent',
		handler: async (url) => {
			const id = segments(url.pathname)[2];
			const food = await db.foods.get(id);
			return food ? { food } : null;
		}
	},

	// ── Foods list: /api/foods ────────────────────────────────
	{
		match: (s) => s.length === 2 && s[0] === 'api' && s[1] === 'foods',
		handler: async (url) => {
			const barcode = url.searchParams.get('barcode');
			if (barcode) {
				const food = (await db.foods.where('barcode').equals(barcode).first()) ?? null;
				return { food };
			}
			const q = url.searchParams.get('q');
			const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
			const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

			let collection = db.foods.toCollection();
			if (q) {
				const lower = q.toLowerCase();
				collection = collection.filter(
					(f) => f.name.toLowerCase().includes(lower) || f.brand?.toLowerCase().includes(lower)
				);
			}
			const foods = await collection.offset(offset).limit(limit).toArray();
			return { foods };
		}
	},

	// ── Entries range: /api/entries/range ────────────────────
	{
		match: (s) => s.length === 3 && s[0] === 'api' && s[1] === 'entries' && s[2] === 'range',
		handler: async (url) => {
			const startDate = url.searchParams.get('startDate');
			const endDate = url.searchParams.get('endDate');
			if (!startDate || !endDate) return null;
			const entries = await db.foodEntries
				.where('date')
				.between(startDate, endDate, true, true)
				.toArray();
			entries.sort(
				(a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
			);
			return { entries };
		}
	},

	// ── Entries: /api/entries ─────────────────────────────────
	{
		match: (s) => s.length === 2 && s[0] === 'api' && s[1] === 'entries',
		handler: async (url) => {
			const date = url.searchParams.get('date');
			if (!date) return null;
			const entries = await db.foodEntries.where('date').equals(date).toArray();
			entries.sort(
				(a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
			);
			return { entries };
		}
	},

	// ── Recipes: /api/recipes/:id ────────────────────────────
	{
		match: (s) => s.length === 3 && s[0] === 'api' && s[1] === 'recipes',
		handler: async (url) => {
			const id = segments(url.pathname)[2];
			const recipe = await db.recipes.get(id);
			if (!recipe) return null;
			const ingredients = await db.recipeIngredients.where('recipeId').equals(id).toArray();
			return { recipe: { ...recipe, ingredients } };
		}
	},

	// ── Recipes list: /api/recipes ───────────────────────────
	{
		match: (s) => s.length === 2 && s[0] === 'api' && s[1] === 'recipes',
		handler: async () => {
			const recipes = await db.recipes.toArray();
			return { recipes };
		}
	},

	// ── Goals: /api/goals ────────────────────────────────────
	{
		match: (s) => s.length === 2 && s[0] === 'api' && s[1] === 'goals',
		handler: async () => {
			const goals = await db.userGoals.toArray();
			return { goals: goals[0] ?? null };
		}
	},

	// ── Preferences: /api/preferences ────────────────────────
	{
		match: (s) => s.length === 2 && s[0] === 'api' && s[1] === 'preferences',
		handler: async () => {
			const prefs = await db.userPreferences.toArray();
			return { preferences: prefs[0] ?? null };
		}
	},

	// ── Meal Types: /api/meal-types ──────────────────────────
	{
		match: (s) => s.length === 2 && s[0] === 'api' && s[1] === 'meal-types',
		handler: async () => {
			const mealTypes = await db.customMealTypes.orderBy('sortOrder').toArray();
			return { mealTypes };
		}
	},

	// ── Supplements today: /api/supplements/today OR /api/supplements/:date/checklist ──
	{
		match: (s) =>
			(s.length === 3 && s[0] === 'api' && s[1] === 'supplements' && s[2] === 'today') ||
			(s.length === 4 && s[0] === 'api' && s[1] === 'supplements' && s[3] === 'checklist'),
		handler: async (url) => {
			const segs = segments(url.pathname);
			const supplements = await db.supplements.filter((s) => s.isActive === true).toArray();
			// Extract date: either from /api/supplements/:date/checklist or use today
			const date = segs.length === 4 ? segs[2] : new Date().toISOString().slice(0, 10);
			const checklist = await Promise.all(
				supplements.map(async (s) => {
					const log = await db.supplementLogs
						.where('[supplementId+date]')
						.equals([s.id, date])
						.first();
					return {
						supplement: s,
						taken: !!log,
						takenAt: log?.takenAt ?? null
					};
				})
			);
			return { checklist, date };
		}
	},

	// ── Supplements history: /api/supplements/history ────────
	{
		match: (s) =>
			s.length === 3 && s[0] === 'api' && s[1] === 'supplements' && s[2] === 'history',
		handler: async (url) => {
			const from = url.searchParams.get('from');
			const to = url.searchParams.get('to');
			if (!from || !to) return null;
			const logs = await db.supplementLogs
				.where('date')
				.between(from, to, true, true)
				.toArray();
			const supplements = await db.supplements.toArray();
			const supplementMap = new Map(supplements.map((s) => [s.id, s]));
			const history = logs.map((log) => ({
				...log,
				supplement: supplementMap.get(log.supplementId) ?? null
			}));
			return { history };
		}
	},

	// ── Supplements: /api/supplements/:id ────────────────────
	{
		match: (s) =>
			s.length === 3 &&
			s[0] === 'api' &&
			s[1] === 'supplements' &&
			!['today', 'history'].includes(s[2]),
		handler: async (url) => {
			const id = segments(url.pathname)[2];
			const supplement = await db.supplements.get(id);
			return supplement ? { supplement } : null;
		}
	},

	// ── Supplements list: /api/supplements ───────────────────
	{
		match: (s) => s.length === 2 && s[0] === 'api' && s[1] === 'supplements',
		handler: async (url) => {
			const showAll = url.searchParams.get('all') === 'true';
			const supplements = showAll
				? await db.supplements.toArray()
				: await db.supplements.filter((s) => s.isActive === true).toArray();
			return { supplements };
		}
	},

	// ── Weight latest: /api/weight/latest ────────────────────
	{
		match: (s) => s.length === 3 && s[0] === 'api' && s[1] === 'weight' && s[2] === 'latest',
		handler: async () => {
			const entries = await db.weightEntries.orderBy('entryDate').reverse().limit(1).toArray();
			return { entry: entries[0] ?? null };
		}
	},

	// ── Weight list: /api/weight ─────────────────────────────
	{
		match: (s) => s.length === 2 && s[0] === 'api' && s[1] === 'weight',
		handler: async (url) => {
			const from = url.searchParams.get('from');
			const to = url.searchParams.get('to');
			if (from && to) {
				// Chart query — return { data } shape expected by weight page's loadChart
				const entries = await db.weightEntries
					.where('entryDate')
					.between(from, to, true, true)
					.toArray();
				entries.sort((a, b) => a.entryDate.localeCompare(b.entryDate));
				return { data: entries.map((e) => ({ date: e.entryDate, weight: e.weightKg })) };
			}
			const entries = await db.weightEntries.orderBy('entryDate').toArray();
			return { entries };
		}
	},

	// ── Stats: /api/stats/* ─────────────────────────────────
	// Stats routes require server-side aggregation and cannot be meaningfully
	// served offline. Return null so callers fall through gracefully.
	{
		match: (s) => s.length >= 2 && s[0] === 'api' && s[1] === 'stats',
		handler: async () => null
	},

	// ── Favorites: /api/favorites ────────────────────────────
	{
		match: (s) => s.length === 2 && s[0] === 'api' && s[1] === 'favorites',
		handler: async (url) => {
			const type = url.searchParams.get('type');
			const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
			const result: Record<string, unknown> = {};

			if (!type || type === 'foods') {
				const foods = await db.foods
					.filter((f) => f.isFavorite === true)
					.limit(limit)
					.toArray();
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
	}
];

/**
 * Try to serve a GET request from Dexie.
 * Returns the response data object, or null if no handler/data available.
 */
export async function getOfflineData(url: string): Promise<unknown | null> {
	const parsed = new URL(url, 'http://localhost');
	const segs = segments(parsed.pathname);

	for (const route of routes) {
		if (route.match(segs, parsed)) {
			return route.handler(parsed);
		}
	}

	return null;
}
