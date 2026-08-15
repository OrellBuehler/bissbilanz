package com.bissbilanz.wear

import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import java.time.LocalDate
import kotlin.math.roundToInt

/**
 * Today's calories against goal on the watch face, mirroring the iOS calorie ring
 * complication. Reads the same Data Layer item the app does, so it stays correct
 * without the app being open.
 */
class CalorieComplicationService : SuspendingComplicationDataSourceService() {
    override fun getPreviewData(type: ComplicationType): ComplicationData? = build(type, consumed = 1450.0, goal = 2200.0)

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        WearStateRepository.loadCached(this)
        val state = WearStateRepository.state.value?.resetIfStale(LocalDate.now().toString())
        return build(
            request.complicationType,
            consumed = state?.totals?.calories ?: 0.0,
            goal = state?.goals?.calories ?: 0.0,
        )
    }

    private fun build(
        type: ComplicationType,
        consumed: Double,
        goal: Double,
    ): ComplicationData? {
        val text = getString(R.string.kcal_value, consumed.roundToInt())
        val description = PlainComplicationText.Builder(getString(R.string.tab_today)).build()
        return when (type) {
            ComplicationType.SHORT_TEXT -> {
                ShortTextComplicationData
                    .Builder(
                        text = PlainComplicationText.Builder(consumed.roundToInt().toString()).build(),
                        contentDescription = description,
                    ).build()
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
                    .build()
            }

            else -> {
                null
            }
        }
    }
}
