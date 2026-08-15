package com.bissbilanz.wear.screens

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import com.bissbilanz.wear.R
import com.bissbilanz.wear.WearFoodRef
import com.bissbilanz.wear.WearLogRequest
import com.bissbilanz.wear.WearState
import com.bissbilanz.wear.WearStateRepository
import kotlinx.coroutines.launch
import java.time.LocalDate
import kotlin.math.roundToInt

/**
 * Quick-log list: favorites then recents, tapping through to a meal/servings
 * step. The phone performs the actual write, so this only has to describe it.
 */
@Composable
fun LogScreen(
    state: WearState,
    context: Context,
) {
    var selected by remember { mutableStateOf<WearFoodRef?>(null) }
    val scope = rememberCoroutineScope()
    var toast by remember { mutableStateOf<String?>(null) }

    val loggedLabel = stringResource(R.string.logged)
    val failedLabel = stringResource(R.string.log_failed)

    val chosen = selected
    if (chosen != null) {
        LogDetailScreen(
            food = chosen,
            mealTypes = state.mealTypes,
            onCancel = { selected = null },
            onConfirm = { meal, servings ->
                scope.launch {
                    val ok =
                        WearStateRepository.logFood(
                            context,
                            WearLogRequest(
                                foodId = chosen.id.takeUnless { chosen.isRecipe },
                                recipeId = chosen.id.takeIf { chosen.isRecipe },
                                mealType = meal,
                                servings = servings,
                                date = LocalDate.now().toString(),
                            ),
                        )
                    toast = if (ok) loggedLabel else failedLabel
                    selected = null
                }
            },
        )
        return
    }

    val listState = rememberScalingLazyListState()
    ScalingLazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
    ) {
        toast?.let { message ->
            item {
                Text(
                    message,
                    style = MaterialTheme.typography.caption2,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        if (state.favorites.isEmpty() && state.recents.isEmpty()) {
            item {
                Text(
                    stringResource(R.string.no_favorites),
                    style = MaterialTheme.typography.body2,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                )
            }
        }

        if (state.favorites.isNotEmpty()) {
            item { ListHeader { Text(stringResource(R.string.favorites)) } }
            items(state.favorites) { food ->
                FoodChip(food) { selected = food }
            }
        }

        if (state.recents.isNotEmpty()) {
            item { ListHeader { Text(stringResource(R.string.recents)) } }
            items(state.recents) { food ->
                FoodChip(food) { selected = food }
            }
        }
    }
}

@Composable
private fun FoodChip(
    food: WearFoodRef,
    onClick: () -> Unit,
) {
    Chip(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = ChipDefaults.secondaryChipColors(),
        label = { Text(food.name, maxLines = 1) },
        secondaryLabel = { Text(stringResource(R.string.kcal_value, food.calories.roundToInt())) },
    )
}

@Composable
private fun LogDetailScreen(
    food: WearFoodRef,
    mealTypes: List<String>,
    onCancel: () -> Unit,
    onConfirm: (String, Double) -> Unit,
) {
    val meals = mealTypes.ifEmpty { listOf("Breakfast", "Lunch", "Dinner", "Snacks") }
    var mealIndex by remember { mutableIntStateOf(0) }
    var servings by remember { mutableDoubleStateOf(1.0) }

    val listState = rememberScalingLazyListState()
    ScalingLazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
        item { ListHeader { Text(food.name, maxLines = 2) } }

        item {
            Chip(
                onClick = { mealIndex = (mealIndex + 1) % meals.size },
                modifier = Modifier.fillMaxWidth(),
                colors = ChipDefaults.secondaryChipColors(),
                label = { Text(stringResource(R.string.meal)) },
                secondaryLabel = { Text(meals[mealIndex]) },
            )
        }

        item {
            Text(
                stringResource(R.string.servings),
                style = MaterialTheme.typography.caption2,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CompactChip(
                    onClick = { servings = (servings - 0.5).coerceAtLeast(0.5) },
                    label = { Text("−") },
                )
                Text(
                    formatServings(servings),
                    style = MaterialTheme.typography.title3,
                )
                CompactChip(
                    onClick = { servings += 0.5 },
                    label = { Text("+") },
                )
            }
        }

        item {
            Chip(
                onClick = { onConfirm(meals[mealIndex], servings) },
                modifier = Modifier.fillMaxWidth(),
                colors = ChipDefaults.primaryChipColors(),
                label = { Text(stringResource(R.string.log)) },
            )
        }

        item {
            CompactChip(
                onClick = onCancel,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("✕") },
            )
        }
    }
}

/** Drops the decimal for whole servings so "1" doesn't read as "1.0" on a small screen. */
internal fun formatServings(value: Double): String =
    if (value == value.roundToInt().toDouble()) {
        value.roundToInt().toString()
    } else {
        value.toString()
    }
