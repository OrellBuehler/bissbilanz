package com.bissbilanz.wear.screens

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import com.bissbilanz.wear.WearSendResult
import com.bissbilanz.wear.WearState
import com.bissbilanz.wear.WearStateRepository
import com.bissbilanz.wear.defaultMeal
import com.bissbilanz.wear.mealName
import com.bissbilanz.wear.wearString
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID
import kotlin.math.roundToInt

private val DefaultMeals = listOf("Breakfast", "Lunch", "Dinner", "Snacks")

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
    var outcome by remember { mutableStateOf<WearSendResult?>(null) }
    var pending by remember { mutableIntStateOf(0) }
    var sending by remember { mutableStateOf(false) }
    // Counted, not derived: offline a second log leaves both the state and the
    // outcome exactly as they were, and a banner keyed on those alone would go on
    // reading "1 waiting" while two writes sit on the watch.
    var sends by remember { mutableIntStateOf(0) }

    LaunchedEffect(state, outcome, sends) {
        pending = withContext(Dispatchers.IO) { WearStateRepository.pendingCount(context) }
    }

    val chosen = selected
    if (chosen != null) {
        LogDetailScreen(
            food = chosen,
            mealTypes = state.mealTypes,
            sending = sending,
            onCancel = { selected = null },
            onConfirm = { meal, servings ->
                // A send takes up to fifteen seconds. A second tap in that window
                // makes a second entry with its own request id, which nothing
                // downstream can recognise as a duplicate.
                if (!sending) {
                    sending = true
                    scope.launch {
                        try {
                            outcome =
                                WearStateRepository.logFood(
                                    context,
                                    WearLogRequest(
                                        foodId = chosen.id.takeUnless { chosen.isRecipe },
                                        recipeId = chosen.id.takeIf { chosen.isRecipe },
                                        mealType = meal,
                                        servings = servings,
                                        date = LocalDate.now().toString(),
                                        requestId = UUID.randomUUID().toString(),
                                    ),
                                )
                        } finally {
                            // The write is durable from the moment it is queued, so
                            // this runs even if the page was swiped away mid-send.
                            sending = false
                            sends += 1
                            selected = null
                        }
                    }
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
        outcome?.let { result ->
            item { StatusLine(outcomeMessage(result)) }
        }

        // The user made these logs; saying nothing about writes still sitting on
        // the watch would leave them believing the phone already has them.
        if (pending > 0) {
            item { StatusLine(wearString(R.string.pending_writes, pending)) }
        }

        if (state.favorites.isEmpty() && state.recents.isEmpty()) {
            item {
                Text(
                    wearString(R.string.no_favorites),
                    style = MaterialTheme.typography.body2,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                )
            }
        }

        if (state.favorites.isNotEmpty()) {
            item { ListHeader { Text(wearString(R.string.favorites)) } }
            items(state.favorites) { food ->
                FoodChip(food) { selected = food }
            }
        }

        if (state.recents.isNotEmpty()) {
            item { ListHeader { Text(wearString(R.string.recents)) } }
            items(state.recents) { food ->
                FoodChip(food) { selected = food }
            }
        }
    }
}

/**
 * What actually happened to the write. A queued log is not a logged one, and
 * saying "Logged" for a send that never reached the phone is how a user ends up
 * eating twice against a number that never moved.
 */
@Composable
internal fun outcomeMessage(result: WearSendResult): String =
    when (result) {
        WearSendResult.SENT -> wearString(R.string.logged)
        WearSendResult.QUEUED -> wearString(R.string.queued_for_phone)
        WearSendResult.FAILED -> wearString(R.string.log_failed)
    }

@Composable
internal fun StatusLine(message: String) {
    Text(
        message,
        style = MaterialTheme.typography.caption2,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
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
        secondaryLabel = { Text(wearString(R.string.kcal_value, food.calories.roundToInt())) },
    )
}

@Composable
private fun LogDetailScreen(
    food: WearFoodRef,
    mealTypes: List<String>,
    sending: Boolean,
    onCancel: () -> Unit,
    onConfirm: (String, Double) -> Unit,
) {
    val meals = mealTypes.ifEmpty { DefaultMeals }
    // Time of day picks the meal, as on the Apple Watch: at lunchtime the log is
    // one tap, and the picker is there for the times it guesses wrong.
    var meal by remember(meals) { mutableStateOf(defaultMeal(meals, LocalTime.now().hour)) }
    var servings by remember { mutableDoubleStateOf(1.0) }
    var pickingMeal by remember { mutableStateOf(false) }

    if (pickingMeal) {
        MealPicker(
            meals = meals,
            selected = meal,
            onPick = {
                meal = it
                pickingMeal = false
            },
        )
        return
    }

    val listState = rememberScalingLazyListState()
    ScalingLazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
        item { ListHeader { Text(food.name, maxLines = 2) } }

        item {
            Chip(
                onClick = { pickingMeal = true },
                modifier = Modifier.fillMaxWidth(),
                colors = ChipDefaults.secondaryChipColors(),
                label = { Text(wearString(R.string.meal)) },
                secondaryLabel = { Text(mealName(meal)) },
            )
        }

        item {
            Text(
                wearString(R.string.servings),
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
                onClick = { onConfirm(meal, servings) },
                enabled = !sending,
                modifier = Modifier.fillMaxWidth(),
                colors = ChipDefaults.primaryChipColors(),
                label = { Text(wearString(if (sending) R.string.sending else R.string.log)) },
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

/** Every meal the phone knows about, the current one marked — a list beats cycling a chip. */
@Composable
private fun MealPicker(
    meals: List<String>,
    selected: String,
    onPick: (String) -> Unit,
) {
    val listState = rememberScalingLazyListState()
    ScalingLazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
        item { ListHeader { Text(wearString(R.string.meal)) } }
        items(meals) { candidate ->
            Chip(
                onClick = { onPick(candidate) },
                modifier = Modifier.fillMaxWidth(),
                colors =
                    if (candidate.equals(selected, ignoreCase = true)) {
                        ChipDefaults.primaryChipColors()
                    } else {
                        ChipDefaults.secondaryChipColors()
                    },
                label = { Text(mealName(candidate), maxLines = 1) },
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
