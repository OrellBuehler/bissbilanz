package com.bissbilanz.android.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.util.formatLocalizedNumber
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.repository.WeightRepository
import kotlinx.coroutines.flow.first
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlin.time.Clock

class QuickWeightWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(QUICK_WEIGHT_COMPACT_SIZE, QUICK_WEIGHT_WIDE_SIZE))

    override suspend fun provideGlance(
        context: Context,
        id: GlanceId,
    ) {
        provideWidgetData(context, id, { loadWeights() }) { data ->
            GlanceTheme {
                if (data == null) SignedOutWidgetContent() else QuickWeightContent(data.today, data.latest)
            }
        }
    }

    companion object {
        suspend fun updateAllWidgets(context: Context) = refreshWidgets(context, QuickWeightWidget())
    }
}

private data class WeightData(
    val today: WeightEntry?,
    val latest: WeightEntry?,
)

/** Null when signed out. */
private suspend fun loadWeights(): WeightData? {
    if (!widgetsSignedIn()) return null
    val koin =
        org.koin.java.KoinJavaComponent
            .getKoin()
    val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
    val entries =
        try {
            koin.get<WeightRepository>().entries().first()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            koin.get<ErrorReporter>().captureException(e)
            emptyList()
        }
    return WeightData(entries.find { it.entryDate == today }, entries.maxByOrNull { it.entryDate })
}

internal val QUICK_WEIGHT_COMPACT_SIZE = DpSize(57.dp, 57.dp)
internal val QUICK_WEIGHT_WIDE_SIZE = DpSize(120.dp, 57.dp)

@Composable
private fun QuickWeightContent(
    todayEntry: WeightEntry?,
    latestEntry: WeightEntry?,
) {
    val context = LocalContext.current
    val shown = todayEntry ?: latestEntry
    // In the widget's own language: "72,5" in German, not "72.5".
    val value = shown?.let { formatLocalizedNumber(it.weightKg, 1, context.resources.configuration.locales[0], minDecimals = 1) }
    val caption =
        context.getString(
            if (todayEntry != null) R.string.weight_widget_today else R.string.weight_widget_tap_to_log,
        )

    if (LocalSize.current.width < QUICK_WEIGHT_WIDE_SIZE.width) {
        QuickWeightCompact(value)
    } else {
        QuickWeightWide(
            value?.let { context.getString(R.string.weight_kg_value, it) } ?: context.getString(R.string.weight_widget_title),
            caption,
        )
    }
}

@Composable
private fun QuickWeightCompact(value: String?) {
    Column(
        modifier =
            GlanceModifier
                .fillMaxSize()
                .cornerRadius(16.dp)
                .background(GlanceTheme.colors.background)
                .clickable(actionStartActivity<QuickWeightActivity>())
                .padding(4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            provider = ImageProvider(R.drawable.ic_widget_scale),
            contentDescription = null,
            modifier = GlanceModifier.size(if (value == null) 28.dp else 18.dp),
        )
        if (value != null) {
            Text(
                text = value,
                style =
                    TextStyle(
                        color = GlanceTheme.colors.onBackground,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                    ),
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun QuickWeightWide(
    headline: String,
    caption: String,
) {
    Row(
        modifier =
            GlanceModifier
                .fillMaxSize()
                .cornerRadius(16.dp)
                .background(GlanceTheme.colors.background)
                .clickable(actionStartActivity<QuickWeightActivity>())
                .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            provider = ImageProvider(R.drawable.ic_widget_scale),
            contentDescription = null,
            modifier = GlanceModifier.size(28.dp),
        )
        Spacer(modifier = GlanceModifier.width(8.dp))
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(
                text = headline,
                style =
                    TextStyle(
                        color = GlanceTheme.colors.onBackground,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                maxLines = 1,
            )
            Text(
                text = caption,
                style =
                    TextStyle(
                        color = GlanceTheme.colors.onBackground,
                        fontSize = 12.sp,
                    ),
                maxLines = 1,
            )
        }
    }
}
