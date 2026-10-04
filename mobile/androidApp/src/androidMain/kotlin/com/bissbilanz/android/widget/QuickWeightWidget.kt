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
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
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
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.repository.WeightRepository
import kotlinx.coroutines.flow.first
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import java.util.Locale
import kotlin.time.Clock

class QuickWeightWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(QUICK_WEIGHT_COMPACT_SIZE, QUICK_WEIGHT_WIDE_SIZE))

    override suspend fun provideGlance(
        context: Context,
        id: GlanceId,
    ) {
        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val weightRepo = koin.get<WeightRepository>()
        val errorReporter = koin.get<ErrorReporter>()

        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
        val entries =
            try {
                weightRepo.entries().first()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                emptyList()
            }

        val todayEntry = entries.find { it.entryDate == today }
        val latestEntry = entries.maxByOrNull { it.entryDate }

        provideContent {
            GlanceTheme {
                QuickWeightContent(todayEntry, latestEntry)
            }
        }
    }

    companion object {
        suspend fun updateAllWidgets(context: Context) {
            val manager = GlanceAppWidgetManager(context)
            val ids = manager.getGlanceIds(QuickWeightWidget::class.java)
            ids.forEach { id -> QuickWeightWidget().update(context, id) }
        }
    }
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
    val value = shown?.let { formatWeight(it.weightKg) }
    val caption =
        context.getString(
            if (todayEntry != null) R.string.weight_widget_today else R.string.weight_widget_tap_to_log,
        )

    if (LocalSize.current.width < QUICK_WEIGHT_WIDE_SIZE.width) {
        QuickWeightCompact(value)
    } else {
        QuickWeightWide(value?.let { "$it $WEIGHT_UNIT" } ?: context.getString(R.string.weight_widget_title), caption)
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

private const val WEIGHT_UNIT = "kg"

private fun formatWeight(kg: Double): String = String.format(Locale.US, "%.1f", kg)
