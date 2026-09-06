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
import com.bissbilanz.api.generated.model.MealBreakdownItem
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
 */
@Composable
fun CalorieTrendWidget(
    date: String,
    modifier: Modifier = Modifier,
) {
    val statsRepo: StatsRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    var calories by remember { mutableStateOf<List<Double>>(emptyList()) }

    LaunchedEffect(date) {
        val end = runCatching { LocalDate.parse(date) }.getOrNull() ?: return@LaunchedEffect
        val start = end.minus(6, DateTimeUnit.DAY)
        calories =
            try {
                statsRepo.getDailyStats(start.toString(), end.toString()).data.map { it.calories }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                emptyList()
            }
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
 * Calories per meal for the shown day. The server breakdown is authoritative when it is
 * reachable; otherwise the same figures are derived from the day's own entries, so the
 * card stays correct in Local mode and offline instead of erroring.
 */
@Composable
fun MealBreakdownWidget(
    date: String,
    entries: List<Entry>,
    isLocalMode: Boolean,
    modifier: Modifier = Modifier,
) {
    val statsRepo: StatsRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    var remote by remember { mutableStateOf<List<MealBreakdownItem>>(emptyList()) }

    LaunchedEffect(date, isLocalMode) {
        if (isLocalMode) {
            remote = emptyList()
            return@LaunchedEffect
        }
        remote =
            try {
                statsRepo.getMealBreakdown(date).data
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                emptyList()
            }
    }

    val meals =
        remember(remote, entries) {
            val source =
                if (remote.isNotEmpty()) {
                    remote.map { it.mealType to it.calories }
                } else {
                    entries
                        .groupBy { normalizeMealType(it.mealType) }
                        .map { (meal, group) -> meal to group.sumOf { it.resolvedCalories() } }
                }
            source.filter { it.second > 0 }.sortedByDescending { it.second }
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
 */
@Composable
fun TopFoodsWidget(
    isLocalMode: Boolean,
    modifier: Modifier = Modifier,
) {
    val statsRepo: StatsRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    var foods by remember { mutableStateOf<List<TopFoodItem>>(emptyList()) }

    LaunchedEffect(isLocalMode) {
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
