package com.bissbilanz.wear

import android.app.PendingIntent
import android.content.Intent
import android.content.res.Resources
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import kotlinx.coroutines.withTimeoutOrNull
import java.time.LocalDate
import kotlin.math.roundToInt

/**
 * Today's calories against goal on the watch face, mirroring the iOS calorie ring
 * complication. Reads the same Data Layer item the app does, so it stays correct
 * without the app being open, and a tap opens the quick-log screen — the whole
 * point of putting it on the face.
 */
class CalorieComplicationService : SuspendingComplicationDataSourceService() {
    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        build(
            resources = forAppLocale(WearStateRepository.state.value?.localeCode).resources,
            type = type,
            consumed = 1450.0,
            goal = 2200.0,
            macros = Macros(protein = 96.0, carbs = 152.0, fat = 48.0),
        )

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        WearStateRepository.loadCached(this)

        // While the app is closed this refresh is the only thing that runs on a
        // schedule, which makes it the watch's one chance to retry a log made
        // out of range without the user opening the app again. Budgeted like the
        // listener's flush but on a tighter budget: a full queue at fifteen
        // seconds an item would use up the whole request and the complication
        // would then never update at all.
        if (WearStateRepository.pendingCount(this) > 0) {
            withTimeoutOrNull(WearStateRepository.COMPLICATION_FLUSH_BUDGET_MS) {
                WearStateRepository.flushOutbox(this@CalorieComplicationService)
            }
        }

        // Read after the flush: a successful drain applies the phone's response to the
        // state, and this is the only refresh for up to fifteen minutes.
        val state = WearStateRepository.state.value?.resetIfStale(LocalDate.now().toString())

        return build(
            resources = forAppLocale(state?.localeCode).resources,
            type = request.complicationType,
            consumed = state?.totals?.calories ?: 0.0,
            goal = state?.goals?.calories ?: 0.0,
            macros =
                Macros(
                    protein = state?.totals?.protein ?: 0.0,
                    carbs = state?.totals?.carbs ?: 0.0,
                    fat = state?.totals?.fat ?: 0.0,
                ),
        )
    }

    private data class Macros(
        val protein: Double,
        val carbs: Double,
        val fat: Double,
    )

    private fun build(
        resources: Resources,
        type: ComplicationType,
        consumed: Double,
        goal: Double,
        macros: Macros,
    ): ComplicationData? {
        val text = resources.getString(R.string.kcal_value, consumed.roundToInt())
        val description = PlainComplicationText.Builder(resources.getString(R.string.tab_today)).build()
        val tap = logScreenIntent()
        return when (type) {
            ComplicationType.SHORT_TEXT -> {
                ShortTextComplicationData
                    .Builder(
                        text = PlainComplicationText.Builder(consumed.roundToInt().toString()).build(),
                        contentDescription = description,
                    ).setTapAction(tap)
                    .build()
            }

            ComplicationType.RANGED_VALUE -> {
                RangedValueComplicationData
                    .Builder(
                        // A zero goal would make the range degenerate, so fall back
                        // to a nominal max and report no progress.
                        value = if (goal > 0) consumed.toFloat().coerceIn(0f, goal.toFloat()) else 0f,
                        min = 0f,
                        max = if (goal > 0) goal.toFloat() else 1f,
                        contentDescription = description,
                    ).setText(PlainComplicationText.Builder(text).build())
                    .setTapAction(tap)
                    .build()
            }

            // The wide slot: calories against goal plus the macro line, the same
            // information the Apple Watch's rectangular complication carries.
            ComplicationType.LONG_TEXT -> {
                val macroLine =
                    resources.getString(
                        R.string.macro_line,
                        macros.protein.roundToInt(),
                        macros.carbs.roundToInt(),
                        macros.fat.roundToInt(),
                    )
                LongTextComplicationData
                    .Builder(
                        text = PlainComplicationText.Builder(macroLine).build(),
                        contentDescription = description,
                    ).setTitle(
                        PlainComplicationText
                            .Builder(
                                resources.getString(R.string.calorie_progress, consumed.roundToInt(), goal.roundToInt()),
                            ).build(),
                    ).setTapAction(tap)
                    .build()
            }

            else -> {
                null
            }
        }
    }

    /** Explicit and immutable: the only thing it can do is open our own log screen. */
    private fun logScreenIntent(): PendingIntent =
        PendingIntent.getActivity(
            this,
            0,
            Intent(this, WearMainActivity::class.java)
                .setAction(WearMainActivity.ACTION_OPEN_LOG)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
}
