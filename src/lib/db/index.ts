import Dexie, { type EntityTable } from 'dexie';
import type {
	DexieFood,
	DexieFoodEntry,
	DexieRecipe,
	DexieRecipeIngredient,
	DexieUserGoals,
	DexieUserPreferences,
	DexieCustomMealType,
	DexieSupplement,
	DexieSupplementLog,
	DexieWeightEntry,
	DexieDayProperties,
	DexieSyncQueueItem,
	DexieSyncMeta
} from './types';

type BissbilanzDB = Dexie & {
	foods: EntityTable<DexieFood, 'id'>;
	foodEntries: EntityTable<DexieFoodEntry, 'id'>;
	recipes: EntityTable<DexieRecipe, 'id'>;
	recipeIngredients: EntityTable<DexieRecipeIngredient, 'id'>;
	userGoals: EntityTable<DexieUserGoals, 'userId'>;
	userPreferences: EntityTable<DexieUserPreferences, 'userId'>;
	customMealTypes: EntityTable<DexieCustomMealType, 'id'>;
	supplements: EntityTable<DexieSupplement, 'id'>;
	supplementLogs: EntityTable<DexieSupplementLog, 'id'>;
	weightEntries: EntityTable<DexieWeightEntry, 'id'>;
	dayProperties: EntityTable<DexieDayProperties, 'date'>;
	syncQueue: EntityTable<DexieSyncQueueItem, 'id'>;
	syncMeta: EntityTable<DexieSyncMeta, 'tableName'>;
};

const db = new Dexie('bissbilanz') as BissbilanzDB;

db.version(1).stores({
	foods: 'id, name, barcode, isFavorite, updatedAt',
	foodEntries: 'id, date, mealType, foodId, recipeId, createdAt',
	recipes: 'id, name, isFavorite, updatedAt',
	recipeIngredients: 'id, recipeId, foodId',
	userGoals: 'userId',
	userPreferences: 'userId',
	customMealTypes: 'id, sortOrder',
	supplements: 'id, isActive, sortOrder',
	supplementLogs: 'id, supplementId, date, [supplementId+date]',
	weightEntries: 'id, entryDate, loggedAt',
	syncQueue: '++id, createdAt',
	syncMeta: 'tableName'
});

db.version(2).stores({
	dayProperties: 'date'
});

export { db };

/** Clear all user data from Dexie (e.g. on logout). Uses a transaction for atomicity. */
export async function clearAllData(): Promise<void> {
	await db.transaction('rw', db.tables, async () => {
		await Promise.all(db.tables.map((table) => table.clear()));
	});
}

/**
 * Ensure cached data belongs to the current user.
 * If a different user logs in on the same device, clear all stale data.
 */
export async function ensureUserScope(userId: string): Promise<void> {
	const USER_KEY = '__userId';
	const stored = await db.syncMeta.get(USER_KEY);

	if (stored && stored.userId !== userId) {
		// Different user — clear all cached data to prevent leaks
		await clearAllData();
	}
	await db.syncMeta.put({ tableName: USER_KEY, lastSyncedAt: 0, userId });
}

/**
 * Migrate pending items from the old `bissbilanz-offline` IndexedDB to Dexie's syncQueue.
 * Call once at app startup. Deletes the old database after migration.
 */
export async function migrateOldOfflineQueue(): Promise<void> {
	if (typeof indexedDB === 'undefined') return;

	const OLD_DB_NAME = 'bissbilanz-offline';
	const OLD_STORE_NAME = 'requests';

	try {
		// Try to open the old database
		const oldDb = await new Promise<IDBDatabase | null>((resolve) => {
			const req = indexedDB.open(OLD_DB_NAME, 1);
			req.onupgradeneeded = () => {
				// If we're creating it for the first time, it doesn't exist — close and delete
				req.transaction?.abort();
				resolve(null);
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => resolve(null);
		});

		if (!oldDb) {
			// Old database doesn't exist — clean up any partial creation
			indexedDB.deleteDatabase(OLD_DB_NAME);
			return;
		}

		// Check if the store exists
		if (!oldDb.objectStoreNames.contains(OLD_STORE_NAME)) {
			oldDb.close();
			indexedDB.deleteDatabase(OLD_DB_NAME);
			return;
		}

		// Read all pending items
		const items = await new Promise<
			Array<{ method: string; url: string; body: string; createdAt: number }>
		>((resolve, reject) => {
			const tx = oldDb.transaction(OLD_STORE_NAME, 'readonly');
			const store = tx.objectStore(OLD_STORE_NAME);
			const req = store.getAll();
			req.onsuccess = () => resolve(req.result ?? []);
			req.onerror = () => reject(req.error);
		});

		// Migrate items to new Dexie syncQueue
		if (items.length > 0) {
			await db.syncQueue.bulkAdd(
				items.map((item) => ({
					method: item.method,
					url: item.url,
					body: item.body,
					createdAt: item.createdAt
				}))
			);
		}

		oldDb.close();
		indexedDB.deleteDatabase(OLD_DB_NAME);
	} catch {
		// Best-effort migration — don't crash the app
	}
}
