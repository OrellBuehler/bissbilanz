package com.bissbilanz.android.chat

import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.fasting.FastingManager
import com.bissbilanz.api.generated.model.ChatChange
import com.bissbilanz.chat.ChatDomain
import com.bissbilanz.chat.ChatRefreshPlan
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.repository.ReminderRepository
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.repository.SupplementRepository
import com.bissbilanz.repository.WeightRepository
import com.bissbilanz.sync.SyncManager
import com.bissbilanz.sync.SyncQueue
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import java.io.IOException
import kotlin.test.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatDataRefresherTest {
    private val entryRepo: EntryRepository = mockk(relaxed = true)
    private val foodRepo: FoodRepository = mockk(relaxed = true)
    private val recipeRepo: RecipeRepository = mockk(relaxed = true)
    private val goalsRepo: GoalsRepository = mockk(relaxed = true)
    private val weightRepo: WeightRepository = mockk(relaxed = true)
    private val sleepRepo: SleepRepository = mockk(relaxed = true)
    private val supplementRepo: SupplementRepository = mockk(relaxed = true)
    private val prefsRepo: PreferencesRepository = mockk(relaxed = true)
    private val reminderRepo: ReminderRepository = mockk(relaxed = true)
    private val fastingManager: FastingManager = mockk(relaxed = true)
    private val syncManager: SyncManager = mockk(relaxed = true)
    private val syncQueue: SyncQueue = mockk(relaxed = true)
    private val errorReporter: ErrorReporter = mockk(relaxed = true)

    init {
        coEvery { entryRepo.cachedDaysUsing(any(), any()) } returns emptySet()
    }

    private fun TestScope.refresher() =
        ChatDataRefresher(
            entryRepo,
            foodRepo,
            recipeRepo,
            goalsRepo,
            weightRepo,
            sleepRepo,
            supplementRepo,
            prefsRepo,
            reminderRepo,
            fastingManager,
            syncManager,
            syncQueue,
            errorReporter,
            backgroundScope,
            today = { "2026-11-20" },
        )

    private fun plan(vararg changes: ChatChange) = ChatRefreshPlan.of(null, changes.toList())

    @Test
    fun scopedChangesRefreshOnlyTheirDays() =
        runTest {
            refresher().refresh(
                plan(
                    ChatChange(domain = ChatDomain.ENTRIES, dates = listOf("2026-11-18", "2026-11-19")),
                    ChatChange(domain = ChatDomain.DAY_PROPERTIES, dates = listOf("2026-11-18")),
                    ChatChange(domain = ChatDomain.SLEEP, dates = listOf("2026-11-17", "2026-11-19")),
                ),
            )

            coVerify(exactly = 1) { entryRepo.refreshWithoutViewing("2026-11-18") }
            coVerify(exactly = 1) { entryRepo.refreshWithoutViewing("2026-11-19") }
            coVerify(exactly = 0) { entryRepo.refreshWithoutViewing("2026-11-20") }
            coVerify(exactly = 1) { entryRepo.getDayProperties("2026-11-18") }
            coVerify(exactly = 1) { sleepRepo.refresh(from = "2026-11-17", to = "2026-11-19") }
            coVerify(exactly = 1) { foodRepo.refreshRecentFoods() }
            coVerify(exactly = 0) { goalsRepo.refresh() }
            coVerify(exactly = 0) { foodRepo.refreshFoods() }
        }

    @Test
    fun unscopedChangesRefreshTheWholeDomainOrTodayAndTheViewedDay() =
        runTest {
            refresher().refresh(
                ChatRefreshPlan.of(
                    listOf(
                        ChatDomain.ENTRIES,
                        ChatDomain.FOODS,
                        ChatDomain.RECIPES,
                        ChatDomain.GOALS,
                        ChatDomain.WEIGHT,
                        ChatDomain.SLEEP,
                        ChatDomain.SUPPLEMENTS,
                        "telepathy",
                    ),
                    null,
                ),
                viewedDates = setOf("2026-11-15"),
            )

            coVerify { entryRepo.refreshWithoutViewing("2026-11-20") }
            coVerify { entryRepo.refreshWithoutViewing("2026-11-15") }
            coVerify { foodRepo.refreshFoods() }
            coVerify { foodRepo.refreshFavorites() }
            coVerify { recipeRepo.refresh() }
            coVerify { goalsRepo.refresh() }
            coVerify { weightRepo.refresh() }
            coVerify { sleepRepo.refresh() }
            coVerify { supplementRepo.refresh() }
            coVerify { supplementRepo.getChecklist("2026-11-20") }
            coVerify(exactly = 0) { prefsRepo.refresh() }
            coVerify(exactly = 0) { reminderRepo.refresh() }
            coVerify(exactly = 0) { fastingManager.refreshHistory(any()) }
        }

    @Test
    fun aFoodOrRecipeEditRefreshesTheDaysThatUseIt() =
        runTest {
            coEvery { entryRepo.cachedDaysUsing(setOf("f1"), setOf("r1")) } returns setOf("2026-11-10", "2026-11-12")

            refresher().refresh(
                plan(
                    ChatChange(domain = ChatDomain.FOODS, ids = listOf("f1")),
                    ChatChange(domain = ChatDomain.RECIPES, ids = listOf("r1")),
                ),
                viewedDates = setOf("2026-11-15"),
            )

            coVerify(exactly = 1) { entryRepo.refreshWithoutViewing("2026-11-10") }
            coVerify(exactly = 1) { entryRepo.refreshWithoutViewing("2026-11-12") }
            coVerify(exactly = 0) { entryRepo.refreshWithoutViewing("2026-11-15") }
            coVerify(exactly = 0) { foodRepo.refreshRecentFoods() }
        }

    @Test
    fun aRecipeChangeWithoutIdsRefreshesTheRecentDaysOnce() =
        runTest {
            refresher().refresh(
                ChatRefreshPlan.of(
                    listOf(ChatDomain.RECIPES),
                    listOf(ChatChange(domain = ChatDomain.ENTRIES, dates = listOf("2026-11-20"))),
                ),
                viewedDates = setOf("2026-11-15"),
            )

            coVerify(exactly = 1) { entryRepo.refreshWithoutViewing("2026-11-20") }
            coVerify(exactly = 1) { entryRepo.refreshWithoutViewing("2026-11-15") }
        }

    @Test
    fun aSignOutDropsWhatIsWaiting() =
        runTest {
            val refresher = refresher()

            refresher.request(ChatRefreshPlan.of(listOf(ChatDomain.GOALS), null), null)
            refresher.clear()
            advanceTimeBy(ChatDataRefresher.COALESCE_MS + 1)
            runCurrent()

            coVerify(exactly = 0) { goalsRepo.refresh() }
        }

    @Test
    fun fastsAreReReadWithTheIdsThatMayHaveBeenDeleted() =
        runTest {
            refresher().refresh(plan(ChatChange(domain = ChatDomain.FASTING, ids = listOf("f1", "f2"))))

            coVerify(exactly = 1) { fastingManager.refreshHistory(setOf("f1", "f2")) }
            coVerify(exactly = 0) { fastingManager.refresh() }
        }

    @Test
    fun anUnscopedFastingChangeOnlyMerges() =
        runTest {
            refresher().refresh(ChatRefreshPlan.of(listOf(ChatDomain.FASTING), null))

            coVerify(exactly = 1) { fastingManager.refreshHistory(emptySet()) }
        }

    @Test
    fun remindersAreReSyncedWhichReschedulesThem() =
        runTest {
            refresher().refresh(plan(ChatChange(domain = ChatDomain.REMINDERS, ids = listOf("r1"))))

            coVerify(exactly = 1) { reminderRepo.refresh() }
        }

    @Test
    fun preferencesAndMealTypesShareOnePreferencesRefresh() =
        runTest {
            refresher().refresh(
                plan(
                    ChatChange(domain = ChatDomain.MEAL_TYPES, ids = listOf("mt1")),
                    ChatChange(domain = ChatDomain.PREFERENCES),
                ),
            )
            refresher().refresh(plan(ChatChange(domain = ChatDomain.MEAL_TYPES, ids = listOf("mt2"))))

            coVerify(exactly = 2) { prefsRepo.refresh() }
        }

    @Test
    fun aBurstOfRequestsIsRefreshedOnce() =
        runTest {
            val refresher = refresher()

            refresher.request(plan(ChatChange(domain = ChatDomain.ENTRIES, dates = listOf("2026-11-18"))), "2026-11-18")
            refresher.request(plan(ChatChange(domain = ChatDomain.ENTRIES, dates = listOf("2026-11-18"))), "2026-11-18")
            refresher.request(plan(ChatChange(domain = ChatDomain.GOALS)), null)
            advanceTimeBy(ChatDataRefresher.COALESCE_MS + 1)
            runCurrent()

            coVerify(exactly = 1) { entryRepo.refreshWithoutViewing("2026-11-18") }
            coVerify(exactly = 1) { goalsRepo.refresh() }
        }

    @Test
    fun aFailedRefreshOfOneDomainDoesNotStopTheOthers() =
        runTest {
            coEvery { goalsRepo.refresh() } throws IOException("offline")
            refresher().refresh(ChatRefreshPlan.of(listOf(ChatDomain.GOALS, ChatDomain.WEIGHT), null))

            coVerify { weightRepo.refresh() }
            coVerify(exactly = 0) { errorReporter.captureException(any()) }
        }

    @Test
    fun pendingLocalEditsAreUploadedBeforeAMessage() =
        runTest {
            coEvery { syncQueue.pendingCount() } returns 2

            refresher().flushLocalChanges()

            coVerifyOrder {
                syncManager.syncPendingQueue()
                syncManager.withSyncPaused(any())
            }
        }

    @Test
    fun anEmptyQueueIsNotFlushed() =
        runTest {
            coEvery { syncQueue.pendingCount() } returns 0

            refresher().flushLocalChanges()

            coVerify(exactly = 0) { syncManager.syncPendingQueue() }
        }
}
