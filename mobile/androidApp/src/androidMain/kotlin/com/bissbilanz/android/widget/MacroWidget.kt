package com.bissbilanz.android.widget

import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.RowScope
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.state.PreferencesGlanceStateDefinition
import com.bissbilanz.analytics.adjustGoalsForActivity
import com.bissbilanz.android.MainActivity
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FatYellow
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import com.bissbilanz.model.Goals
import com.bissbilanz.model.MacroTotals
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.util.totalMacros
import kotlinx.coroutines.flow.first
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlin.time.Clock

class MacroWidget : GlanceAppWidget() {
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(
        context: Context,
        id: GlanceId,
    ) {
        if (!widgetsSignedIn()) provideContent { GlanceTheme { SignedOutWidgetContent() } }

        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val entryRepo = koin.get<EntryRepository>()
        val goalsRepo = koin.get<GoalsRepository>()
        val prefsRepo = koin.get<PreferencesRepository>()

        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
        val entries = entryRepo.entriesByDateOnce(today)
        val rawGoals = goalsRepo.goalsOnce()
        val dayProperties = entryRepo.getDayProperties(today)
        val prefs = prefsRepo.preferences().first()
        val goals =
            adjustGoalsForActivity(
                rawGoals,
                dayProperties?.activityCalories,
                enabled = prefs?.activityGoalAdjustment ?: false,
                creditPercent = prefs?.activityCreditPercent ?: 100,
            )?.goals ?: rawGoals
        val totals = entries.totalMacros()

        provideContent {
            GlanceTheme {
                MacroWidgetContent(totals, goals)
            }
        }
    }

    companion object {
        val ShowCaloriesKey = booleanPreferencesKey("show_calories")
        val ShowProteinKey = booleanPreferencesKey("show_protein")
        val ShowCarbsKey = booleanPreferencesKey("show_carbs")
        val ShowFatKey = booleanPreferencesKey("show_fat")
        val ShowFiberKey = booleanPreferencesKey("show_fiber")

        val CaloriesColor = CaloriesBlue.toArgb()
        val ProteinColor = ProteinRed.toArgb()
        val CarbsColor = CarbsOrange.toArgb()
        val FatColor = FatYellow.toArgb()
        val FiberColor = FiberGreen.toArgb()

        suspend fun updateAllWidgets(context: Context) {
            val manager = GlanceAppWidgetManager(context)
            val ids = manager.getGlanceIds(MacroWidget::class.java)
            ids.forEach { id -> MacroWidget().update(context, id) }
        }
    }
}

@Composable
private fun MacroWidgetContent(
    totals: MacroTotals,
    goals: Goals?,
) {
    val context = LocalContext.current
    val prefs = currentState<Preferences>()
    val density = context.resources.displayMetrics.density
    val isDark =
        (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
    val showCalories = prefs[MacroWidget.ShowCaloriesKey] ?: true
    val showProtein = prefs[MacroWidget.ShowProteinKey] ?: true
    val showCarbs = prefs[MacroWidget.ShowCarbsKey] ?: true
    val showFat = prefs[MacroWidget.ShowFatKey] ?: true
    val showFiber = prefs[MacroWidget.ShowFiberKey] ?: true

    val ringPx = (44 * density).toInt()

    val rings =
        listOfNotNull(
            MacroRing(totals.calories, goals?.calorieGoal, MacroWidget.CaloriesColor, R.string.widget_macro_calories)
                .takeIf { showCalories },
            MacroRing(totals.protein, goals?.proteinGoal, MacroWidget.ProteinColor, R.string.widget_macro_protein)
                .takeIf { showProtein },
            MacroRing(totals.carbs, goals?.carbGoal, MacroWidget.CarbsColor, R.string.widget_macro_carbs)
                .takeIf { showCarbs },
            MacroRing(totals.fat, goals?.fatGoal, MacroWidget.FatColor, R.string.widget_macro_fat)
                .takeIf { showFat },
            MacroRing(totals.fiber, goals?.fiberGoal, MacroWidget.FiberColor, R.string.widget_macro_fiber)
                .takeIf { showFiber },
        )

    Row(
        modifier =
            GlanceModifier
                .fillMaxSize()
                .cornerRadius(16.dp)
                .background(GlanceTheme.colors.background)
                .clickable(actionStartActivity<MainActivity>())
                .padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        rings.forEach { ring ->
            RingImage(ring.current, ring.goal ?: 0.0, ring.color, context.getString(ring.label), ringPx, density, isDark)
        }
    }
}

@Composable
private fun RowScope.RingImage(
    current: Double,
    goal: Double,
    color: Int,
    label: String,
    ringPx: Int,
    density: Float,
    isDark: Boolean,
) {
    val bitmap = MacroRingRenderer.render(current, goal, color, label, ringPx, density, isDark)
    val provider = ImageProvider(bitmap)
    // Weighted, so on a narrow widget Fit scales the rings down to share the width
    // instead of the last ones being cut off; on a wide one they keep their size.
    Image(
        provider = provider,
        contentDescription = label,
        contentScale = ContentScale.Fit,
        modifier = GlanceModifier.defaultWeight().padding(horizontal = 2.dp),
    )
}

private data class MacroRing(
    val current: Double,
    val goal: Double?,
    val color: Int,
    val label: Int,
)
