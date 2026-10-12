package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.ClaudeCapability
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.api.generated.model.PreferencesResponse
import com.bissbilanz.api.generated.model.PreferencesUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.PreferencesField
import com.bissbilanz.util.decodeOrNull
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
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

    @Test
    fun anUpdateOfTheLegacyDayPropertiesFlagAppliesToAllThreeSplitFlags() =
        runTest {
            val updated = repository.updatePreferences(PreferencesUpdate(showDayPropertiesWidget = false))

            assertEquals(false, updated.showWaterWidget)
            assertEquals(false, updated.showActivityWidget)
            assertEquals(false, updated.showNotesWidget)
        }

    @Test
    fun aSplitFlagUpdateLeavesTheOtherTwoAlone() =
        runTest {
            val updated = repository.updatePreferences(PreferencesUpdate(showWaterWidget = false))

            assertEquals(false, updated.showWaterWidget)
            assertEquals(true, updated.showActivityWidget)
            assertEquals(true, updated.showNotesWidget)
        }

    @Test
    fun aCachedRowPredatingTheSplitFlagsInheritsTheLegacyFlagInsteadOfBeingDropped() =
        runTest {
            repository.updatePreferences(PreferencesUpdate(showDayPropertiesWidget = false))
            val legacy =
                Json
                    .parseToJsonElement(
                        db.userDataDatabaseQueries
                            .selectPreferences()
                            .executeAsOne()
                            .jsonData,
                    ).jsonObject
                    .filterKeys { it !in setOf("showWaterWidget", "showActivityWidget", "showNotesWidget") }
            db.userDataDatabaseQueries.insertPreferences(JsonObject(legacy).toString())

            val updated = repository.updatePreferences(PreferencesUpdate(timeZone = "Europe/Zurich"))

            assertEquals("Europe/Zurich", updated.timeZone)
            assertEquals(false, updated.showWaterWidget)
            assertEquals(false, updated.showActivityWidget)
            assertEquals(false, updated.showNotesWidget)
        }

    @Test
    fun choosingClaudeKeepsTheLegacyFieldOnAssistantAndStoresTheKind() =
        runTest {
            val updated =
                repository.updatePreferences(PreferencesUpdate(aiTaskProcessor = PreferencesUpdate.AiTaskProcessor.claude))

            assertEquals(Preferences.AiTaskProcessor.assistant, updated.aiTaskProcessor)
            assertEquals("claude", updated.aiTaskProcessorKind)
            assertEquals("claude", cached()?.aiTaskProcessorKind)
            val op = syncQueue.drain().last().operation as SyncOperation.UpdatePreferences
            assertEquals("""{"aiTaskProcessor":"claude"}""", op.body)
        }

    @Test
    fun switchingFromClaudeBackToTheAssistantReplacesTheKind() =
        runTest {
            repository.updatePreferences(PreferencesUpdate(aiTaskProcessor = PreferencesUpdate.AiTaskProcessor.claude))

            val updated =
                repository.updatePreferences(PreferencesUpdate(aiTaskProcessor = PreferencesUpdate.AiTaskProcessor.assistant))

            assertEquals(Preferences.AiTaskProcessor.assistant, updated.aiTaskProcessor)
            assertEquals("assistant", updated.aiTaskProcessorKind)
            assertEquals("assistant", cached()?.aiTaskProcessorKind)
        }

    @Test
    fun anUnrelatedUpdateKeepsTheStoredKind() =
        runTest {
            repository.updatePreferences(PreferencesUpdate(aiTaskProcessor = PreferencesUpdate.AiTaskProcessor.claude))

            val updated = repository.updatePreferences(PreferencesUpdate(timeZone = "Europe/Zurich"))

            assertEquals("claude", updated.aiTaskProcessorKind)
        }

    @Test
    fun aCachedRowFromBeforeTheKindExistedStillDecodes() =
        runTest {
            repository.updatePreferences(PreferencesUpdate(timeZone = "Europe/Zurich"))
            val legacy =
                Json
                    .parseToJsonElement(
                        db.userDataDatabaseQueries
                            .selectPreferences()
                            .executeAsOne()
                            .jsonData,
                    ).jsonObject
                    .filterKeys { it != "aiTaskProcessorKind" }
            db.userDataDatabaseQueries.insertPreferences(JsonObject(legacy).toString())

            assertNull(cached()?.aiTaskProcessorKind)
            assertEquals("Europe/Zurich", cached()?.timeZone)
        }

    @Test
    fun refreshKeepsTheCapabilityFromTheLatestGet() =
        runTest {
            val prefs = TestFixtures.preferences(processorKind = "claude")
            coEvery { api.getPreferencesResponse() } returns
                PreferencesResponse(prefs, ClaudeCapability(available = true, remainingBudgetUsd = 8.31))

            repository.refresh()

            assertEquals(ClaudeCapability(available = true, remainingBudgetUsd = 8.31), repository.claudeCapability.value)
            assertEquals("claude", cached()?.aiTaskProcessorKind)

            coEvery { api.getPreferencesResponse() } returns PreferencesResponse(prefs, ClaudeCapability(available = false))
            repository.refresh()

            assertEquals(ClaudeCapability(available = false), repository.claudeCapability.value)
        }

    @Test
    fun clearingTheCapabilityForgetsTheLastAccount() =
        runTest {
            coEvery { api.getPreferencesResponse() } returns
                PreferencesResponse(TestFixtures.preferences(), ClaudeCapability(available = true))
            repository.refresh()

            repository.clearClaudeCapability()

            assertNull(repository.claudeCapability.value)
        }

    @Test
    fun aRefreshInFlightDuringASignOutIsDropped() =
        runTest {
            coEvery { api.getPreferencesResponse() } coAnswers {
                repository.clearClaudeCapability()
                PreferencesResponse(
                    TestFixtures.preferences(processorKind = "claude"),
                    ClaudeCapability(available = true),
                )
            }

            repository.refresh()

            assertNull(repository.claudeCapability.value)
            assertNull(cached())
        }

    @Test
    fun aServerWithoutTheCapabilityLeavesItUnknown() =
        runTest {
            coEvery { api.getPreferencesResponse() } returns PreferencesResponse(TestFixtures.preferences())

            repository.refresh()

            assertNull(repository.claudeCapability.value)
        }

    @Test
    fun aFailedRefreshKeepsTheLastCapability() =
        runTest {
            coEvery { api.getPreferencesResponse() } returns
                PreferencesResponse(TestFixtures.preferences(), ClaudeCapability(available = true))
            repository.refresh()
            coEvery { api.getPreferencesResponse() } throws RuntimeException("offline")

            assertFailsWith<RuntimeException> { repository.refresh() }

            assertEquals(ClaudeCapability(available = true), repository.claudeCapability.value)
        }
}
