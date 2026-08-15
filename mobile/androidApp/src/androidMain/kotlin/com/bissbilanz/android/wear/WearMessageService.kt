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
import com.bissbilanz.wear.WearWeightLogRequest
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
        val koin = KoinJavaComponent.getKoin()
        val errorReporter = koin.get<ErrorReporter>()
        val payload = String(event.data)

        runBlocking {
            try {
                when (event.path) {
                    WearPaths.LOG_FOOD -> {
                        val request = json.decodeFromString<WearLogRequest>(payload)
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

                    WearPaths.LOG_WEIGHT -> {
                        val request = json.decodeFromString<WearWeightLogRequest>(payload)
                        koin.get<WeightRepository>().createEntry(
                            WeightCreate(weightKg = request.weightKg, entryDate = request.date),
                        )
                    }

                    WearPaths.LOG_SLEEP -> {
                        val request = json.decodeFromString<WearSleepLogRequest>(payload)
                        koin.get<SleepRepository>().createEntry(
                            SleepCreate(
                                durationMinutes = request.durationMinutes,
                                quality = request.quality,
                                entryDate = request.date,
                            ),
                        )
                    }

                    WearPaths.REQUEST_STATE -> {
                        Unit
                    }
                }
                // Always re-publish: the watch's own copy is now stale, whether it
                // just logged something or simply asked for a refresh.
                koin.get<WearStatePublisher>().publish()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
            }
        }
    }
}
