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
 * What a watch request did here — the two answers the watch has to tell apart.
 *
 * A watch that reads a failure as success reports "Logged" for an entry that does
 * not exist and drops the write from its outbox, so there is nothing left to retry.
 */
private sealed interface WearRequestOutcome {
    /** The write happened, or repeated one that already had. [state] is the refresh, if there was one. */
    data class Applied(
        val state: WearState?,
    ) : WearRequestOutcome

    /** The write did not happen; the watch keeps it queued. */
    data object Failed : WearRequestOutcome
}

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
     * state as JSON, a bare ack when the write landed but there was no state to
     * send, or an explicit error the watch keeps queued and retries.
     */
    override fun onRequest(
        nodeId: String,
        path: String,
        data: ByteArray,
    ): Task<ByteArray>? {
        if (path !in HANDLED_PATHS) return null
        val body =
            when (val outcome = runBlocking { handle(path, String(data)) }) {
                is WearRequestOutcome.Applied -> outcome.state?.let { json.encodeToString(it) } ?: WearPaths.RESPONSE_OK
                WearRequestOutcome.Failed -> WearPaths.RESPONSE_ERROR
            }
        return Tasks.forResult(body.toByteArray())
    }

    /**
     * Claims the request id, writes, then clears the claim.
     *
     * The claim has to come first so two deliveries of the same request can't both
     * write, and it has to be given back when the write throws: a burned id makes
     * every retry of a log that never happened look like a duplicate, and the watch
     * retries by design.
     */
    private suspend fun handle(
        path: String,
        payload: String,
    ): WearRequestOutcome {
        val koin = KoinJavaComponent.getKoin()
        val errorReporter = koin.get<ErrorReporter>()
        // Set between claiming an id and the write landing. Still set in the catch
        // means the claim outlived the write it was made for.
        var claimed: String? = null

        return try {
            when (path) {
                WearPaths.LOG_FOOD -> {
                    val request = json.decodeFromString<WearLogRequest>(payload)
                    if (WearAppliedRequests.markApplied(this@WearMessageService, request.requestId)) {
                        claimed = request.requestId
                        koin.get<EntryRepository>().createEntry(
                            EntryCreate(
                                foodId = request.foodId,
                                recipeId = request.recipeId,
                                mealType = request.mealType,
                                servings = request.servings,
                                date = request.date,
                            ),
                        )
                        claimed = null
                    }
                }

                WearPaths.LOG_WEIGHT -> {
                    val request = json.decodeFromString<WearWeightLogRequest>(payload)
                    if (WearAppliedRequests.markApplied(this@WearMessageService, request.requestId)) {
                        claimed = request.requestId
                        koin.get<WeightRepository>().createEntry(
                            WeightCreate(weightKg = request.weightKg, entryDate = request.date),
                        )
                        claimed = null
                    }
                }

                WearPaths.LOG_SLEEP -> {
                    val request = json.decodeFromString<WearSleepLogRequest>(payload)
                    if (WearAppliedRequests.markApplied(this@WearMessageService, request.requestId)) {
                        claimed = request.requestId
                        koin.get<SleepRepository>().createEntry(
                            SleepCreate(
                                durationMinutes = request.durationMinutes,
                                quality = request.quality,
                                entryDate = request.date,
                            ),
                        )
                        claimed = null
                    }
                }

                WearPaths.REQUEST_STATE -> Unit
            }
            // Always re-publish: the watch's own copy is now stale, whether it
            // just logged something or simply asked for a refresh. The published
            // state is also what the RPC answers with. A publish that comes back
            // empty is not a failed write — the entry is there either way.
            WearRequestOutcome.Applied(koin.get<WearStatePublisher>().publish())
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            WearAppliedRequests.release(this@WearMessageService, claimed)
            errorReporter.captureException(e)
            WearRequestOutcome.Failed
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
