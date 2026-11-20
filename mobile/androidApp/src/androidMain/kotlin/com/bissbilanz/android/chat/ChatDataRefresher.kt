package com.bissbilanz.android.chat

import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.fasting.FastingManager
import com.bissbilanz.chat.ChatChangeScope
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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import java.io.IOException
import kotlin.time.Clock

/**
 * Keeps the local cache in step with what the assistant changes on the server. Each request
 * names the domains (and days or ids) a tool call or run reported; requests arriving within
 * [COALESCE_MS] are merged and refreshed once, with the narrowest refresh each repository
 * has. The screens collect the repositories' flows, so they repaint by themselves; the few
 * values a screen reads once (a day's water or the supplement ticks) are announced through
 * [refreshed].
 */
class ChatDataRefresher(
    private val entryRepo: EntryRepository,
    private val foodRepo: FoodRepository,
    private val recipeRepo: RecipeRepository,
    private val goalsRepo: GoalsRepository,
    private val weightRepo: WeightRepository,
    private val sleepRepo: SleepRepository,
    private val supplementRepo: SupplementRepository,
    private val prefsRepo: PreferencesRepository,
    private val reminderRepo: ReminderRepository,
    private val fastingManager: FastingManager,
    private val syncManager: SyncManager,
    private val syncQueue: SyncQueue,
    private val errorReporter: ErrorReporter,
    scope: CoroutineScope,
    private val today: () -> String = { Clock.System.todayIn(TimeZone.currentSystemDefault()).toString() },
) {
    private class Request(
        val plan: ChatRefreshPlan,
        val viewedDate: String?,
        val account: Int,
    )

    private val requests = Channel<Request>(Channel.UNLIMITED)

    private val _refreshed = MutableSharedFlow<ChatRefreshPlan>(extraBufferCapacity = 8)

    /** Every plan once it has been refreshed. */
    val refreshed: SharedFlow<ChatRefreshPlan> = _refreshed.asSharedFlow()

    @Volatile private var account = 0

    @Volatile private var running: Job? = null

    init {
        scope.launch {
            for (first in requests) {
                delay(COALESCE_MS)
                val batch = mutableListOf(first)
                while (true) batch += requests.tryReceive().getOrNull() ?: break
                val current = batch.filter { it.account == account }
                if (current.isEmpty()) continue
                val plan = current.fold(ChatRefreshPlan.EMPTY) { merged, request -> merged + request.plan }
                val viewed = current.mapNotNullTo(mutableSetOf()) { it.viewedDate }
                running = launch { refresh(plan, viewed) }
                running?.join()
            }
        }
    }

    fun request(
        plan: ChatRefreshPlan,
        viewedDate: String?,
    ) {
        if (!plan.isEmpty) requests.trySend(Request(plan, viewedDate, account))
    }

    /** Sign-out and account switches: what is waiting is dropped and a refresh under way is stopped. */
    fun clear() {
        account++
        while (requests.tryReceive().isSuccess) continue
        running?.cancel()
    }

    /** [viewedDates] stand in for "every day" when a change to entries or day details has no days. */
    suspend fun refresh(
        plan: ChatRefreshPlan,
        viewedDates: Set<String> = emptySet(),
    ) {
        val anyDay = viewedDates + today()
        val days = plan[ChatDomain.ENTRIES]?.days(anyDay).orEmpty() + daysUsingChangedFoodsAndRecipes(plan, anyDay)
        coroutineScope {
            days.sortedDescending().take(MAX_DAYS).forEach { date -> launch { safely { entryRepo.refreshWithoutViewing(date) } } }
            if (plan[ChatDomain.ENTRIES] != null) launch { safely { foodRepo.refreshRecentFoods() } }
            plan[ChatDomain.DAY_PROPERTIES]?.let { scope ->
                scope.days(anyDay).forEach { date -> launch { safely { entryRepo.getDayProperties(date) } } }
            }
            // The change feed only returns what changed since the last sync, which is narrower
            // than reading each id and also catches a deleted food.
            if (plan[ChatDomain.FOODS] != null) {
                launch { safely { foodRepo.refreshFoods() } }
                launch { safely { foodRepo.refreshFavorites() } }
            }
            if (plan[ChatDomain.RECIPES] != null) launch { safely { recipeRepo.refresh() } }
            if (plan[ChatDomain.GOALS] != null) launch { safely { goalsRepo.refresh() } }
            if (plan[ChatDomain.WEIGHT] != null) launch { safely { weightRepo.refresh() } }
            plan[ChatDomain.SLEEP]?.let { scope ->
                launch {
                    safely {
                        if (scope.everything || scope.ids.isNotEmpty() || scope.dates.isEmpty()) {
                            sleepRepo.refresh()
                        } else {
                            sleepRepo.refresh(from = scope.dates.min(), to = scope.dates.max())
                        }
                    }
                }
            }
            if (plan[ChatDomain.SUPPLEMENTS] != null) {
                launch { safely { supplementRepo.refresh() } }
                launch { safely { supplementRepo.getChecklist(today()) } }
            }
            // Custom meal types have no cache here (Settings and Reminders read them when they
            // open); what does cache them is the meal order in the preferences.
            if (plan[ChatDomain.PREFERENCES] != null || plan[ChatDomain.MEAL_TYPES] != null) launch { safely { prefsRepo.refresh() } }
            plan[ChatDomain.FASTING]?.let { scope -> launch { safely { fastingManager.refreshHistory(scope.ids) } } }
            // Re-caching the reminders fires their change hook, which reschedules the alarms.
            if (plan[ChatDomain.REMINDERS] != null) launch { safely { reminderRepo.refresh() } }
        }
        _refreshed.tryEmit(plan)
    }

    /**
     * Uploads what is waiting in the sync queue, so the assistant sees the user's latest edits.
     * Bounded by [FLUSH_TIMEOUT_MS]: a slow upload delays the message, it never blocks it.
     */
    suspend fun flushLocalChanges() {
        try {
            if (syncQueue.pendingCount() == 0L) return
            withTimeoutOrNull(FLUSH_TIMEOUT_MS) {
                syncManager.syncPendingQueue()
                // A drain that was already running when this one was asked for still has to end.
                syncManager.withSyncPaused {}
            } ?: errorReporter.addBreadcrumb("Assistant chat sent before the sync queue drained", CATEGORY)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    /**
     * Editing a food or recipe changes the macros the days using it show, but the server only
     * reports `foods`/`recipes`: those days are found in the cache, and a change without ids
     * falls back to the recent days.
     */
    private suspend fun daysUsingChangedFoodsAndRecipes(
        plan: ChatRefreshPlan,
        anyDay: Set<String>,
    ): Set<String> {
        val foods = plan[ChatDomain.FOODS]
        val recipes = plan[ChatDomain.RECIPES]
        if (foods == null && recipes == null) return emptySet()
        val unscoped = (foods != null && foods.ids.isEmpty()) || (recipes != null && recipes.ids.isEmpty())
        val used =
            try {
                entryRepo.cachedDaysUsing(foods?.ids.orEmpty(), recipes?.ids.orEmpty())
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                emptySet()
            }
        return if (unscoped) used + anyDay else used
    }

    private fun ChatChangeScope.days(anyDay: Set<String>): Set<String> =
        (if (everything) dates + anyDay else dates).sortedDescending().take(MAX_DAYS).toSet()

    private suspend fun safely(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            if (generateSequence<Throwable>(e) { it.cause }.any { it is IOException }) {
                errorReporter.addBreadcrumb("Refresh after an assistant change failed: ${e.message.orEmpty().take(120)}", CATEGORY)
            } else {
                errorReporter.captureException(e)
            }
        }
    }

    companion object {
        const val COALESCE_MS = 400L
        const val FLUSH_TIMEOUT_MS = 5_000L
        const val MAX_DAYS = 31
        private const val CATEGORY = "assistant-chat"
    }
}
