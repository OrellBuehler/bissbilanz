package com.bissbilanz.android.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
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
import androidx.glance.text.TextStyle
import com.bissbilanz.android.R
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.repository.WeightRepository
import kotlinx.coroutines.flow.first
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn

class QuickWeightWidget : GlanceAppWidget() {
    override suspend fun provideGlance(
        context: Context,
        id: GlanceId,
    ) {
        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val weightRepo = koin.get<WeightRepository>()

        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
        val entries =
            try {
                weightRepo.entries().first()
            } catch (_: Exception) {
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

@Composable
private fun QuickWeightContent(
    todayEntry: WeightEntry?,
    latestEntry: WeightEntry?,
) {
    Row(
        modifier =
            GlanceModifier
                .fillMaxSize()
                .cornerRadius(16.dp)
                .background(GlanceTheme.colors.background)
                .clickable(actionStartActivity<QuickWeightActivity>())
                .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            provider = ImageProvider(R.drawable.ic_widget_scale),
            contentDescription = null,
            modifier = GlanceModifier.size(28.dp),
        )
        Spacer(modifier = GlanceModifier.width(8.dp))
        Column {
            if (todayEntry != null) {
                Text(
                    text = "%.1f kg".format(todayEntry.weightKg),
                    style =
                        TextStyle(
                            color = GlanceTheme.colors.onBackground,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                )
                Text(
                    text = "Today",
                    style =
                        TextStyle(
                            color = GlanceTheme.colors.onBackground,
                            fontSize = 12.sp,
                        ),
                )
            } else if (latestEntry != null) {
                Text(
                    text = "%.1f kg".format(latestEntry.weightKg),
                    style =
                        TextStyle(
                            color = GlanceTheme.colors.onBackground,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                )
                Text(
                    text = "Tap to log",
                    style =
                        TextStyle(
                            color = GlanceTheme.colors.onBackground,
                            fontSize = 12.sp,
                        ),
                )
            } else {
                Text(
                    text = "Weight",
                    style =
                        TextStyle(
                            color = GlanceTheme.colors.onBackground,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                )
                Text(
                    text = "Tap to log",
                    style =
                        TextStyle(
                            color = GlanceTheme.colors.onBackground,
                            fontSize = 12.sp,
                        ),
                )
            }
        }
    }
}
