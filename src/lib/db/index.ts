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
	DexieSleepEntry,
	DexieDayProperties,
	DexieFastingSession,
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
	supplementLogs: EntityTable<DexieSupplementLog, 'supplementId'>;
	weightEntries: EntityTable<DexieWeightEntry, 'id'>;
	sleepEntries: EntityTable<DexieSleepEntry, 'id'>;
	dayProperties: EntityTable<DexieDayProperties, 'date'>;
	fastingSessions: EntityTable<DexieFastingSession, 'id'>;
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

// Additive: only new/changed stores need to be listed; existing v1 stores are preserved
db.version(2).stores({
	dayProperties: 'date'
});

db.version(3).stores({
	sleepEntries: 'id, entryDate, loggedAt'
});

// v4: supplements are now nutrient-backed (kind on foods). Existing foods rows
// from v3 lack `kind` — backfill with 'food' so kind-filtered queries don't hide
// them. supplementLogs is DROPPED here (recreated in v6 with a compound key):
// Dexie cannot change a table's primary key in place, so the old `id`-keyed table
// must be deleted and re-added across two versions. Old logs are discarded — the
// server resyncs them on next fetch.
db.version(4)
	.stores({
		foods: 'id, name, barcode, isFavorite, kind, updatedAt',
		supplementLogs: null
	})
	.upgrade(async (tx) => {
		await tx
			.table('foods')
			.toCollection()
			.modify((food: { kind?: string }) => {
				if (!food.kind) food.kind = 'food';
			});
	});

// v5: syncQueue gains a failedAt index — failed writes are parked (dead-letter)
// instead of deleted, so the user can retry or discard them explicitly.
db.version(5).stores({
	syncQueue: '++id, createdAt, failedAt'
});

// v6: recreate supplementLogs with a compound primary key ([supplementId+date]) —
// one log per supplement per day. Split from v4's drop because Dexie models a
// primary-key change as delete-then-create across separate versions. Users
// upgrading from schema v1–v3 previously crashed here with "Not yet support for
// changing primary key" (Sentry BISSBILANZ-1T); fresh installs are unaffected.
db.version(6).stores({
	supplementLogs: '[supplementId+date], supplementId, date'
});

// v7: sync queue items gain idempotency + conflict-resolution + backoff fields.
// `nextAttemptAt` is indexed so the drain query can cheaply skip items still in
// their exponential-backoff window. Existing rows are backfilled so they keep
// draining (key/editedAt absent on legacy items is fine — the server falls back
// to its pre-idempotency behaviour for those).
db.version(7)
	.stores({
		syncQueue: '++id, createdAt, failedAt, nextAttemptAt'
	})
	.upgrade(async (tx) => {
		await tx
			.table('syncQueue')
			.toCollection()
			.modify((item: { retryCount?: number; nextAttemptAt?: number }) => {
				item.retryCount ??= 0;
				item.nextAttemptAt ??= 0;
			});
	});

// v8: completed fasting sessions mirror, so the fasting page renders and edits
// offline. The running fast is not stored here — it stays in localStorage until
// it is ended, matching the mobile apps.
db.version(8).stores({
	fastingSessions: 'id, startedAt'
});

export { db };

/** Clear all user data from Dexie (e.g. on logout). Uses a transaction for atomicity. */
export async function clearAllData(): Promise<void> {
	await db.transaction('rw', db.tables, async () => {
		await Promise.all(db.tables.map((table) => table.clear()));
	});
}

/** Clear all Workbox/PWA Cache Storage entries (e.g. on logout or user switch). */
export async function clearCacheStorage(): Promise<void> {
	if (typeof caches === 'undefined') return;
	const keys = await caches.keys();
	await Promise.all(keys.map((key) => caches.delete(key)));
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
		await clearCacheStorage().catch(() => {});
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
