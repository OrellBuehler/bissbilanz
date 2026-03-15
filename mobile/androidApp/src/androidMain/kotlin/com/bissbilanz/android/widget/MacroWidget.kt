package com.bissbilanz.android.widget

import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.Composable
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
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.state.PreferencesGlanceStateDefinition
import com.bissbilanz.android.MainActivity
import com.bissbilanz.model.Goals
import com.bissbilanz.model.MacroTotals
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.util.totalMacros
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn

class MacroWidget : GlanceAppWidget() {
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(
        context: Context,
        id: GlanceId,
    ) {
        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val entryRepo = koin.get<EntryRepository>()
        val goalsRepo = koin.get<GoalsRepository>()

        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
        val entries = entryRepo.entriesByDateOnce(today)
        val goals = goalsRepo.goalsOnce()
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
    val ringPx = (44 * density).toInt()

    val showCalories = prefs[MacroWidget.ShowCaloriesKey] ?: true
    val showProtein = prefs[MacroWidget.ShowProteinKey] ?: true
    val showCarbs = prefs[MacroWidget.ShowCarbsKey] ?: true
    val showFat = prefs[MacroWidget.ShowFatKey] ?: true
    val showFiber = prefs[MacroWidget.ShowFiberKey] ?: true

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
        if (showCalories) {
            RingImage(totals.calories, goals?.calorieGoal ?: 0.0, 0xFF3B82F6.toInt(), "Cal", ringPx, density, isDark)
        }
        if (showProtein) {
            RingImage(totals.protein, goals?.proteinGoal ?: 0.0, 0xFFEF4444.toInt(), "Prot", ringPx, density, isDark)
        }
        if (showCarbs) {
            RingImage(totals.carbs, goals?.carbGoal ?: 0.0, 0xFFF97316.toInt(), "Carbs", ringPx, density, isDark)
        }
        if (showFat) {
            RingImage(totals.fat, goals?.fatGoal ?: 0.0, 0xFFEAB308.toInt(), "Fat", ringPx, density, isDark)
        }
        if (showFiber) {
            RingImage(totals.fiber, goals?.fiberGoal ?: 0.0, 0xFF22C55E.toInt(), "Fiber", ringPx, density, isDark)
        }
    }
}

@Composable
private fun RingImage(
    current: Double,
    goal: Double,
    color: Int,
    label: String,
    ringPx: Int,
    density: Float,
    isDark: Boolean,
) {
    val bitmap = MacroRingRenderer.render(current, goal, color, label, ringPx, density, isDark)
    Image(
        provider = ImageProvider(bitmap),
        contentDescription = label,
        contentScale = ContentScale.Fit,
        modifier = GlanceModifier.padding(horizontal = 2.dp),
    )
}
