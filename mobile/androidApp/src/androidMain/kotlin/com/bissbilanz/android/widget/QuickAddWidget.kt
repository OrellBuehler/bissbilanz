package com.bissbilanz.android.widget

import android.content.Context
import android.content.res.Configuration
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
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import com.bissbilanz.android.MainActivity
import com.bissbilanz.android.R
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.formatAsInt
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlinx.serialization.json.Json
import kotlin.time.Clock

private data class QuickAddRow(
    val id: String,
    val name: String,
    val calories: Double,
)

private const val MAX_ROWS = 5

/**
 * Rows, not tiles: every row *is* the log button, which is what separates this from
 * [FavoritesWidget]'s grid. It lists the foods this device logs most often rather
 * than the favorites — the favorites widget already covers those — so the two
 * surfaces stay worth their home-screen space independently.
 */
class QuickAddWidget : GlanceAppWidget() {
    override val sizeMode =
        SizeMode.Responsive(
            setOf(
                DpSize(140.dp, 110.dp),
                DpSize(250.dp, 110.dp),
                DpSize(250.dp, 180.dp),
                DpSize(250.dp, 250.dp),
            ),
        )

    override suspend fun provideGlance(
        context: Context,
        id: GlanceId,
    ) {
        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val db = koin.get<UserDataDatabase>()
        val json = koin.get<Json>()

        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        val rows =
            RecentFoods
                .load(db, json, today, MAX_ROWS)
                .map { QuickAddRow(it.id, it.name, it.calories) }

        val density = context.resources.displayMetrics.density
        val iconPx = (24 * density).toInt()
        val isDark =
            (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
                Configuration.UI_MODE_NIGHT_YES

        val plusProvider = ImageProvider(PlusPlaceholderRenderer.render(iconPx, isDark))
        val checkProvider = ImageProvider(CheckmarkRenderer.render(iconPx))

        provideContent {
            GlanceTheme {
                QuickAddContent(rows, plusProvider, checkProvider)
            }
        }
    }

    companion object {
        suspend fun updateAllWidgets(context: Context) {
            val manager = GlanceAppWidgetManager(context)
            val ids = manager.getGlanceIds(QuickAddWidget::class.java)
            ids.forEach { id -> QuickAddWidget().update(context, id) }
        }
    }
}

@Composable
private fun QuickAddContent(
    rows: List<QuickAddRow>,
    plusProvider: ImageProvider,
    checkProvider: ImageProvider,
) {
    val context = LocalContext.current
    val height = LocalSize.current.height
    val visible =
        when {
            height >= 240.dp -> MAX_ROWS
            height >= 170.dp -> 3
            else -> 2
        }

    if (rows.isEmpty()) {
        Box(
            modifier =
                GlanceModifier
                    .fillMaxSize()
                    .cornerRadius(16.dp)
                    .background(GlanceTheme.colors.background)
                    .clickable(actionStartActivity<MainActivity>())
                    .padding(12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = context.getString(R.string.quick_add_widget_empty),
                style =
                    TextStyle(
                        color = GlanceTheme.colors.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    ),
            )
        }
        return
    }

    Column(
        modifier =
            GlanceModifier
                .fillMaxSize()
                .cornerRadius(16.dp)
                .background(GlanceTheme.colors.background)
                .padding(8.dp),
    ) {
        rows.take(visible).forEachIndexed { index, row ->
            if (index > 0) Spacer(modifier = GlanceModifier.height(4.dp))
            QuickAddRowItem(row, plusProvider, checkProvider, context)
        }
    }
}

@Composable
private fun QuickAddRowItem(
    row: QuickAddRow,
    plusProvider: ImageProvider,
    checkProvider: ImageProvider,
    context: Context,
) {
    val logged = LogFavoriteFoodAction.isRecentlyLogged(row.id)
    Row(
        modifier =
            GlanceModifier
                .fillMaxWidth()
                .cornerRadius(10.dp)
                .background(GlanceTheme.colors.surfaceVariant)
                .clickable(
                    actionRunCallback<LogFavoriteFoodAction>(
                        actionParametersOf(
                            FoodIdKey to row.id,
                            FoodNameKey to row.name,
                            FallbackRouteKey to "food/${row.id}",
                        ),
                    ),
                ).padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            provider = if (logged) checkProvider else plusProvider,
            contentDescription =
                if (logged) {
                    context.getString(R.string.quick_add_widget_logged)
                } else {
                    context.getString(R.string.quick_add_widget_log, row.name)
                },
            contentScale = ContentScale.Fit,
            modifier =
                GlanceModifier
                    .size(24.dp)
                    .cornerRadius(6.dp),
        )
        Spacer(modifier = GlanceModifier.width(8.dp))
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(
                text = row.name,
                style =
                    TextStyle(
                        color = GlanceTheme.colors.onSurface,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                maxLines = 1,
            )
            Text(
                text = context.getString(R.string.format_kcal, row.calories.formatAsInt()),
                style =
                    TextStyle(
                        color = GlanceTheme.colors.onSurfaceVariant,
                        fontSize = 10.sp,
                    ),
                maxLines = 1,
            )
        }
    }
}
