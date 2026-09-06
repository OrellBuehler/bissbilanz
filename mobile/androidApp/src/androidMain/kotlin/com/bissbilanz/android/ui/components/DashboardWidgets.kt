package com.bissbilanz.android.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.macroTextTone
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.api.generated.model.TopFoodItem
import com.bissbilanz.model.Entry
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.repository.StatsRepository
import com.bissbilanz.util.formatAsInt
import com.bissbilanz.util.normalizeMealType
import com.bissbilanz.util.resolveDefaultMeal
import com.bissbilanz.util.resolvedCalories
import kotlinx.coroutines.launch
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.minus
import org.koin.compose.koinInject

/**
 * A cheap value that changes whenever the day's entries do — a new log, an edit, a
 * delete, or the sync manager swapping a temp id for the server one.
 *
 * The cards that read a server-side aggregate use it as a `LaunchedEffect` key so they
 * refetch instead of showing the figures the day started with. Servings and calories are
 * folded in because editing an entry changes neither the count nor the ids.
 */
internal fun List<Entry>.calorieSignature(): String =
    joinToString(separator = "|") { "${it.id}:${it.mealType}:${it.servings}:${it.resolvedCalories()}" }

/**
 * Shared chrome for the optional dashboard cards: an icon, a title and an optional
 * trailing action, matching [SleepWidget] and [WeightWidget].
 */
@Composable
private fun WidgetCard(
    title: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Card(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        icon,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                action?.invoke()
            }
            Spacer(modifier = Modifier.height(8.dp))
            content()
        }
    }
}

/**
 * Seven days of calories ending on the shown day. `getDailyStats` computes from the
 * local cache in Local mode and falls back to it when the server call fails, so this
 * card works offline without a separate code path.
 *
 * [entries] are the shown day's own entries. They keep the card honest: the fetch is
 * re-run whenever they change (so a log made here is picked up once it has uploaded),
 * and the last point is meanwhile taken from them directly, because the server aggregate
 * cannot know about a write still sitting in the sync queue.
 */
@Composable
fun CalorieTrendWidget(
    date: String,
    entries: List<Entry>,
    modifier: Modifier = Modifier,
) {
    val statsRepo: StatsRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    var series by remember { mutableStateOf<List<Pair<String, Double>>>(emptyList()) }
    val entriesKey = entries.calorieSignature()

    LaunchedEffect(date, entriesKey) {
        val end = runCatching { LocalDate.parse(date) }.getOrNull() ?: return@LaunchedEffect
        val start = end.minus(6, DateTimeUnit.DAY)
        series =
            try {
                statsRepo.getDailyStats(start.toString(), end.toString()).data.map { it.date to it.calories }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                emptyList()
            }
    }

    val calories =
        remember(series, entries, date) {
            val localTotal = entries.sumOf { it.resolvedCalories() }
            val merged = series.map { (day, value) -> if (day == date) localTotal else value }
            if (series.none { it.first == date } && entries.isNotEmpty()) merged + localTotal else merged
        }

    WidgetCard(
        title = stringResource(R.string.dashboard_calorie_trend_title),
        icon = Icons.AutoMirrored.Filled.ShowChart,
        modifier = modifier,
    ) {
        if (calories.size < 2) {
            Text(
                stringResource(R.string.dashboard_widget_not_enough_data),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            SimpleLineChart(
                data = calories.map { it.toFloat() },
                color = CaloriesBlue,
                modifier = Modifier.fillMaxWidth().height(96.dp),
                unit = stringResource(R.string.unit_kcal),
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                stringResource(
                    R.string.dashboard_calorie_trend_average,
                    calories.average().formatAsInt(),
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * One-tap logging of favourite foods. The meal follows the user's favourite-assignment
 * preference; when that can't decide (the "always ask" mode, or a time outside every
 * timeframe) the shared meal picker asks, exactly as the Favorites tab does.
 */
@Composable
fun FavoritesQuickLogWidget(
    date: String,
    onViewAll: () -> Unit,
    onLogged: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val foodRepo: FoodRepository = koinInject()
    val entryRepo: EntryRepository = koinInject()
    val prefsRepo: PreferencesRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val favorites by foodRepo.favorites().collectAsStateWithLifecycle(emptyList())
    val prefs by prefsRepo.preferences().collectAsStateWithLifecycle(null)
    val haptic = rememberHaptic()
    val scope = rememberCoroutineScope()
    var pendingFood by remember { mutableStateOf<Food?>(null) }

    LaunchedEffect(Unit) {
        try {
            foodRepo.refreshFavorites()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    fun log(
        food: Food,
        meal: String,
        servings: Double,
    ) {
        scope.launch {
            try {
                entryRepo.createEntry(
                    EntryCreate(foodId = food.id, mealType = meal, servings = servings, date = date),
                    food = food,
                )
                onLogged(food.name)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            }
        }
    }

    pendingFood?.let { food ->
        MealPickerSheet(
            onDismiss = { pendingFood = null },
            onConfirm = { meal, servings ->
                pendingFood = null
                log(food, meal, servings)
            },
        )
    }

    WidgetCard(
        title = stringResource(R.string.favorites_title),
        icon = Icons.Default.Star,
        modifier = modifier,
        action = {
            TextButton(onClick = onViewAll) { Text(stringResource(R.string.chart_view_all)) }
        },
    ) {
        if (favorites.isEmpty()) {
            Text(
                stringResource(R.string.dashboard_favorites_empty),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                favorites.take(8).forEach { food ->
                    AssistChip(
                        onClick = {
                            haptic(HapticFeedbackType.LongPress)
                            val meal = resolveDefaultMeal(prefs)
                            if (meal == null) {
                                pendingFood = food
                            } else {
                                log(food, meal, 1.0)
                            }
                        },
                        label = {
                            Text(food.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        },
                        leadingIcon =
                            food.imageUrl?.let { url ->
                                {
                                    FoodImage(
                                        imageUrl = url,
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp).clip(RoundedCornerShape(4.dp)),
                                    )
                                }
                            },
                    )
                }
            }
        }
    }
}

/**
 * Calories per meal for the shown day, derived from the day's own entries.
 *
 * Deliberately not the server breakdown: the cached entries are the same rows the rings
 * and the day log above are drawn from, so the card agrees with the rest of the screen
 * and updates the moment something is logged — a server aggregate cannot see a write
 * that is still queued for upload, and preferring it left the card stale until the day
 * changed. It also removes the separate Local-mode path.
 */
@Composable
fun MealBreakdownWidget(
    entries: List<Entry>,
    modifier: Modifier = Modifier,
) {
    val meals =
        remember(entries) {
            entries
                .groupBy { normalizeMealType(it.mealType) }
                .map { (meal, group) -> meal to group.sumOf { it.resolvedCalories() } }
                .filter { it.second > 0 }
                .sortedByDescending { it.second }
        }

    WidgetCard(
        title = stringResource(R.string.settings_widget_meal_breakdown),
        icon = Icons.Default.Restaurant,
        modifier = modifier,
    ) {
        if (meals.isEmpty()) {
            Text(
                stringResource(R.string.dashboard_widget_no_data_for_day),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            val max = meals.maxOf { it.second }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                meals.forEach { (meal, calories) ->
                    Column {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(mealTypeDisplayName(meal), style = MaterialTheme.typography.bodyMedium)
                            Text(
                                stringResource(R.string.format_kcal, calories.formatAsInt()),
                                style = MaterialTheme.typography.bodyMedium,
                                color = CaloriesBlue.macroTextTone(),
                                fontWeight = FontWeight.Medium,
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        LinearProgressIndicator(
                            progress = { (calories / max).toFloat().coerceIn(0f, 1f) },
                            color = CaloriesBlue,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }
    }
}

/**
 * The foods logged most often over the last week. Server-only — there is no local
 * aggregate to fall back on — so in Local mode the card says so rather than erroring.
 *
 * [entries] are the shown day's entries; they are only a refetch key. Without one the
 * list was fetched once and then contradicted every log made on the screen until the
 * card left composition.
 */
@Composable
fun TopFoodsWidget(
    entries: List<Entry>,
    isLocalMode: Boolean,
    modifier: Modifier = Modifier,
) {
    val statsRepo: StatsRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    var foods by remember { mutableStateOf<List<TopFoodItem>>(emptyList()) }
    val entriesKey = entries.calorieSignature()

    LaunchedEffect(isLocalMode, entriesKey) {
        if (isLocalMode) return@LaunchedEffect
        foods =
            try {
                statsRepo.getTopFoods(days = 7, limit = 5).data
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                emptyList()
            }
    }

    WidgetCard(
        title = stringResource(R.string.settings_widget_top_foods),
        icon = Icons.AutoMirrored.Filled.TrendingUp,
        modifier = modifier,
    ) {
        when {
            isLocalMode ->
                Text(
                    stringResource(R.string.dashboard_widget_account_only),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

            foods.isEmpty() ->
                Text(
                    stringResource(R.string.dashboard_widget_not_enough_data),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

            else ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    foods.forEach { item ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                item.foodName,
                                style = MaterialTheme.typography.bodyMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                stringResource(R.string.dashboard_top_foods_count, item.count),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
        }
    }
}
