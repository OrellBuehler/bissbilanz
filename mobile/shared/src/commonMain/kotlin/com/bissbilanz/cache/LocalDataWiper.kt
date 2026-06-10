package com.bissbilanz.cache

import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.userdata.UserDataDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.withContext

/**
 * Wipes every piece of locally stored user data: all user-data tables, the sync queue,
 * all sync metadata (including the one-shot `migration_normalized` marker) and the
 * meal-type cache. Used on deliberate logout — leftover rows would leak into the next
 * account or be re-uploaded as "local data" — and by "start fresh" during migration.
 *
 * The `LocalMeta` table is deliberately kept: it only holds the one-time structural
 * "legacy data copied out of bissbilanz.db" marker, not user data.
 */
class LocalDataWiper(
    private val db: UserDataDatabase,
    private val cacheDb: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
) {
    suspend fun wipeAll() {
        withContext(Dispatchers.IO) {
            syncQueue.clear()
            val queries = db.userDataDatabaseQueries
            queries.transaction {
                queries.clearAllData()
                queries.clearAllFoods()
                queries.clearAllGoals()
                queries.clearAllRecipes()
                queries.clearAllSupplements()
                queries.clearAllSupplementLogs()
                queries.clearAllWeightEntries()
                queries.clearAllSleepEntries()
                queries.clearAllPreferences()
                queries.clearAllDayProperties()
            }
            val cacheQueries = cacheDb.bissbilanzDatabaseQueries
            cacheQueries.transaction {
                cacheQueries.clearAllMealTypes()
                cacheQueries.clearAllSyncMeta()
            }
        }
    }
}
