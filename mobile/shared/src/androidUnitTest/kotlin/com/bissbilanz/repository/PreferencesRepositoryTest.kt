package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.api.generated.model.PreferencesUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.PreferencesField
import com.bissbilanz.util.decodeOrNull
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Resetting a preference to "not set" is a clear. [PreferencesUpdate] encodes both
 * "unchanged" and "cleared" as null and the shared Json omits nulls, so it has to be
 * announced separately — otherwise the cache keeps the old value and the picker snaps
 * back on the next visit.
 */
class PreferencesRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private lateinit var syncQueue: SyncQueue
    private lateinit var repository: PreferencesRepository
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
        val appMode = appModeManager()
        syncQueue = SyncQueue(cacheDb, json, appMode)
        repository = PreferencesRepository(api, db, cacheDb, syncQueue, json, appMode)
    }

    /** The cached preferences row, read synchronously so the test never waits on a flow. */
    private fun cached(): Preferences? =
        db.userDataDatabaseQueries
            .selectPreferences()
            .executeAsOneOrNull()
            ?.let { json.decodeOrNull<Preferences>(it.jsonData) }

    @Test
    fun clearingBiologicalSexNullsTheCacheAndQueuesTheKey() =
        runTest {
            repository.updatePreferences(PreferencesUpdate(biologicalSex = PreferencesUpdate.BiologicalSex.male))
            assertEquals(Preferences.BiologicalSex.male, cached()?.biologicalSex)

            val updated =
                repository.updatePreferences(
                    PreferencesUpdate(),
                    cleared = setOf(PreferencesField.BIOLOGICAL_SEX),
                )

            assertNull(updated.biologicalSex)
            assertNull(cached()?.biologicalSex)
            val op = syncQueue.drain().last().operation as SyncOperation.UpdatePreferences
            assertEquals(listOf("biologicalSex"), op.clearedKeys)
        }

    @Test
    fun anUpdateWithoutClearsKeepsBiologicalSex() =
        runTest {
            repository.updatePreferences(PreferencesUpdate(biologicalSex = PreferencesUpdate.BiologicalSex.female))

            val updated = repository.updatePreferences(PreferencesUpdate(timeZone = "Europe/Zurich"))

            assertEquals(Preferences.BiologicalSex.female, updated.biologicalSex)
            assertEquals("Europe/Zurich", updated.timeZone)
            assertEquals(Preferences.BiologicalSex.female, cached()?.biologicalSex)
        }
}
