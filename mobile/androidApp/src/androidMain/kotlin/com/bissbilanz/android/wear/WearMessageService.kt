package com.bissbilanz.android.wear

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.generated.model.SleepCreate
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.WeightCreate
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.repository.WeightRepository
import com.bissbilanz.wear.WearLogRequest
import com.bissbilanz.wear.WearPaths
import com.bissbilanz.wear.WearSleepLogRequest
import com.bissbilanz.wear.WearState
import com.bissbilanz.wear.WearWeightLogRequest
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.koin.java.KoinJavaComponent

/**
 * Turns the watch's short commands into real writes.
 *
 * The watch deliberately owns no persistence: it describes what to log, and the
 * write runs here through the normal repositories, so it picks up sync, offline
 * queuing and widget refresh for free — the same split as the Apple Watch app.
 *
 * Two ways in, both handled the same way:
 * - [onRequest] is the RPC the watch prefers. It answers with the refreshed
 *   [WearState], so a log made on the watch moves its rings straight away
 *   instead of waiting for the state push that follows.
 * - [onMessageReceived] is the fire-and-forget fallback for a watch talking to a
 *   phone build with no RPC service registered, and for anything the watch had
 *   to queue while the phone was out of range.
 */
class WearMessageService : WearableListenerService() {
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Runs the write on the binder thread this callback already arrives on, rather
     * than launching it into a service-scoped coroutine: the service can be
     * destroyed as soon as this returns, which would cancel a scoped write
     * mid-flight while the watch had already reported success.
     */
    override fun onMessageReceived(event: MessageEvent) {
        runBlocking { handle(event.path, String(event.data)) }
    }

    /**
     * The RPC half of the same handler. Returning null tells the Data Layer we
     * don't serve this path; anything we do serve answers with the refreshed
     * state as JSON, or an empty body when there is none to give.
     */
    override fun onRequest(
        nodeId: String,
        path: String,
        data: ByteArray,
    ): Task<ByteArray>? {
        if (path !in HANDLED_PATHS) return null
        val state = runBlocking { handle(path, String(data)) }
        val body = state?.let { json.encodeToString(it).toByteArray() } ?: ByteArray(0)
        return Tasks.forResult(body)
    }

    private suspend fun handle(
        path: String,
        payload: String,
    ): WearState? {
        val koin = KoinJavaComponent.getKoin()
        val errorReporter = koin.get<ErrorReporter>()

        return try {
            when (path) {
                WearPaths.LOG_FOOD -> {
                    val request = json.decodeFromString<WearLogRequest>(payload)
                    if (WearAppliedRequests.markApplied(this@WearMessageService, request.requestId)) {
                        koin.get<EntryRepository>().createEntry(
                            EntryCreate(
                                foodId = request.foodId,
                                recipeId = request.recipeId,
                                mealType = request.mealType,
                                servings = request.servings,
                                date = request.date,
                            ),
                        )
                    }
                }

                WearPaths.LOG_WEIGHT -> {
                    val request = json.decodeFromString<WearWeightLogRequest>(payload)
                    if (WearAppliedRequests.markApplied(this@WearMessageService, request.requestId)) {
                        koin.get<WeightRepository>().createEntry(
                            WeightCreate(weightKg = request.weightKg, entryDate = request.date),
                        )
                    }
                }

                WearPaths.LOG_SLEEP -> {
                    val request = json.decodeFromString<WearSleepLogRequest>(payload)
                    if (WearAppliedRequests.markApplied(this@WearMessageService, request.requestId)) {
                        koin.get<SleepRepository>().createEntry(
                            SleepCreate(
                                durationMinutes = request.durationMinutes,
                                quality = request.quality,
                                entryDate = request.date,
                            ),
                        )
                    }
                }

                WearPaths.REQUEST_STATE -> Unit
            }
            // Always re-publish: the watch's own copy is now stale, whether it
            // just logged something or simply asked for a refresh. The published
            // state is also what the RPC answers with.
            koin.get<WearStatePublisher>().publish()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            errorReporter.captureException(e)
            null
        }
    }

    private companion object {
        val HANDLED_PATHS =
            setOf(
                WearPaths.LOG_FOOD,
                WearPaths.LOG_WEIGHT,
                WearPaths.LOG_SLEEP,
                WearPaths.REQUEST_STATE,
            )
    }
}
