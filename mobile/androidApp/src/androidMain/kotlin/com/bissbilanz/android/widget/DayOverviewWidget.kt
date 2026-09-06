package com.bissbilanz.android.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.bissbilanz.android.MainActivity
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.CarbsOrange
import com.bissbilanz.android.ui.theme.FatYellow
import com.bissbilanz.android.ui.theme.FiberGreen
import com.bissbilanz.android.ui.theme.ProteinRed
import com.bissbilanz.model.Entry
import com.bissbilanz.model.Goals
import com.bissbilanz.model.MacroTotals
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.util.formatAsInt
import com.bissbilanz.util.mealTypes
import com.bissbilanz.util.normalizeMealType
import com.bissbilanz.util.resolvedCalories
import com.bissbilanz.util.totalMacros
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlin.time.Clock

internal data class MealCalories(
    val mealType: String,
    val calories: Double,
)

/**
 * The large counterpart to [MacroWidget]: the whole day at a glance — calories per
 * meal, every macro total and a one-tap route into logging — matching the iOS
 * `DayOverviewWidget`.
 */
class DayOverviewWidget : GlanceAppWidget() {
    override val sizeMode =
        SizeMode.Responsive(
            setOf(
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
        val entryRepo = koin.get<EntryRepository>()
        val goalsRepo = koin.get<GoalsRepository>()

        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
        val entries = entryRepo.entriesByDateOnce(today)
        val goals = goalsRepo.goalsOnce()

        val meals = mealBreakdown(entries)
        val totals = entries.totalMacros()

        provideContent {
            GlanceTheme {
                DayOverviewContent(meals, totals, goals)
            }
        }
    }

    companion object {
        suspend fun updateAllWidgets(context: Context) {
            val manager = GlanceAppWidgetManager(context)
            val ids = manager.getGlanceIds(DayOverviewWidget::class.java)
            ids.forEach { id -> DayOverviewWidget().update(context, id) }
        }
    }
}

/**
 * The four default meals always show, at zero when nothing was logged, so the layout
 * doesn't jump around during the day. Custom meal types only appear once they hold
 * something, sorted by name so their order is stable across refreshes.
 */
internal fun mealBreakdown(entries: List<Entry>): List<MealCalories> {
    val byType =
        entries
            .groupBy { normalizeMealType(it.mealType) }
            .mapValues { (_, logged) -> logged.sumOf { it.resolvedCalories() } }
    val standard = mealTypes.map { MealCalories(it, byType[it] ?: 0.0) }
    val custom =
        byType.keys
            .filterNot { it in mealTypes }
            .sorted()
            .map { MealCalories(it, byType.getValue(it)) }
    return standard + custom
}

/** Opens the food list, which is where a log starts. */
class OpenLogFoodAction : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters,
    ) {
        val intent =
            Intent(context, MainActivity::class.java).apply {
                putExtra(MainActivity.EXTRA_NAVIGATE_TO, "foods")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
        context.startActivity(intent)
    }
}

@Composable
private fun DayOverviewContent(
    meals: List<MealCalories>,
    totals: MacroTotals,
    goals: Goals?,
) {
    val context = LocalContext.current
    val compact = LocalSize.current.height < 220.dp
    val visibleMeals = meals.take(if (compact) 4 else 7)

    Column(
        modifier =
            GlanceModifier
                .fillMaxSize()
                .cornerRadius(16.dp)
                .background(GlanceTheme.colors.background)
                .clickable(actionStartActivity<MainActivity>())
                .padding(12.dp),
    ) {
        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = context.getString(R.string.day_overview_today),
                style =
                    TextStyle(
                        color = GlanceTheme.colors.onBackground,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                    ),
            )
            Spacer(modifier = GlanceModifier.defaultWeight())
            Text(
                text = calorieSummary(context, totals, goals),
                style =
                    TextStyle(
                        color = GlanceTheme.colors.onSurfaceVariant,
                        fontSize = 12.sp,
                    ),
                maxLines = 1,
            )
        }

        Spacer(modifier = GlanceModifier.height(8.dp))

        visibleMeals.forEach { meal ->
            MealRow(meal, context)
        }

        Spacer(modifier = GlanceModifier.height(8.dp))
        Spacer(
            modifier =
                GlanceModifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(GlanceTheme.colors.outline),
        )
        Spacer(modifier = GlanceModifier.height(8.dp))

        Row(modifier = GlanceModifier.fillMaxWidth()) {
            MacroValue(
                value = totals.calories.formatAsInt(),
                label = context.getString(R.string.widget_macro_calories),
                color = CaloriesBlue,
                modifier = GlanceModifier.defaultWeight(),
            )
            MacroValue(
                value = context.getString(R.string.widget_grams_format, totals.protein.formatAsInt()),
                label = context.getString(R.string.widget_macro_protein),
                color = ProteinRed,
                modifier = GlanceModifier.defaultWeight(),
            )
            MacroValue(
                value = context.getString(R.string.widget_grams_format, totals.carbs.formatAsInt()),
                label = context.getString(R.string.widget_macro_carbs),
                color = CarbsOrange,
                modifier = GlanceModifier.defaultWeight(),
            )
            MacroValue(
                value = context.getString(R.string.widget_grams_format, totals.fat.formatAsInt()),
                label = context.getString(R.string.widget_macro_fat),
                color = FatYellow,
                modifier = GlanceModifier.defaultWeight(),
            )
            MacroValue(
                value = context.getString(R.string.widget_grams_format, totals.fiber.formatAsInt()),
                label = context.getString(R.string.widget_macro_fiber),
                color = FiberGreen,
                modifier = GlanceModifier.defaultWeight(),
            )
        }

        Spacer(modifier = GlanceModifier.defaultWeight())

        Row(
            modifier =
                GlanceModifier
                    .fillMaxWidth()
                    .cornerRadius(12.dp)
                    .background(GlanceTheme.colors.primaryContainer)
                    .clickable(actionRunCallback<OpenLogFoodAction>())
                    .padding(vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = context.getString(R.string.day_overview_log_food),
                style =
                    TextStyle(
                        color = GlanceTheme.colors.onPrimaryContainer,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    ),
            )
        }
    }
}

@Composable
private fun MealRow(
    meal: MealCalories,
    context: Context,
) {
    val logged = meal.calories > 0
    Row(
        modifier =
            GlanceModifier
                .fillMaxWidth()
                .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = mealLabel(context, meal.mealType),
            style =
                TextStyle(
                    color = if (logged) GlanceTheme.colors.onBackground else GlanceTheme.colors.onSurfaceVariant,
                    fontSize = 13.sp,
                ),
            maxLines = 1,
            modifier = GlanceModifier.defaultWeight(),
        )
        Text(
            text =
                if (logged) {
                    context.getString(R.string.format_kcal, meal.calories.formatAsInt())
                } else {
                    context.getString(R.string.day_overview_meal_empty)
                },
            style =
                TextStyle(
                    color = GlanceTheme.colors.onSurfaceVariant,
                    fontSize = 13.sp,
                ),
            maxLines = 1,
        )
    }
}

@Composable
private fun MacroValue(
    value: String,
    label: String,
    color: Color,
    modifier: GlanceModifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = value,
            style =
                TextStyle(
                    color = ColorProvider(color),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center,
                ),
            maxLines = 1,
        )
        Text(
            text = label,
            style =
                TextStyle(
                    color = GlanceTheme.colors.onSurfaceVariant,
                    fontSize = 10.sp,
                    textAlign = TextAlign.Center,
                ),
            maxLines = 1,
        )
    }
}

private fun calorieSummary(
    context: Context,
    totals: MacroTotals,
    goals: Goals?,
): String {
    val goal = goals?.calorieGoal ?: 0.0
    return if (goal > 0) {
        context.getString(R.string.day_overview_calorie_summary, totals.calories.formatAsInt(), goal.formatAsInt())
    } else {
        context.getString(R.string.format_kcal, totals.calories.formatAsInt())
    }
}

/**
 * Glance has no Compose `stringResource`, so the localized meal names come off the
 * context directly. Custom meal types stay as the user typed them, matching
 * `mealTypeDisplayName` in the app UI.
 */
private fun mealLabel(
    context: Context,
    mealType: String,
): String =
    when (mealType.lowercase()) {
        "breakfast" -> context.getString(R.string.meal_type_breakfast)
        "lunch" -> context.getString(R.string.meal_type_lunch)
        "dinner" -> context.getString(R.string.meal_type_dinner)
        "snack", "snacks" -> context.getString(R.string.meal_type_snack)
        else -> mealType.replaceFirstChar { it.uppercase() }
    }
