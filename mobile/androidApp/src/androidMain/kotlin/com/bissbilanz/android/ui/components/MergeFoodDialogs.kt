package com.bissbilanz.android.ui.components

import android.util.Log
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.model.Food
import com.bissbilanz.repository.FoodRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

/**
 * Search-based target picker for "merge into…": lets the user find any other food in
 * their database to keep, excluding [excludeId] (the food being merged away). Mirrors
 * the ingredient picker in [com.bissbilanz.android.ui.components.RecipeEditSheet] —
 * the same search-as-you-type pattern — minus the Open Food Facts fallback, since the
 * keeper must already exist in the user's own database.
 */
@Composable
fun MergeTargetSearchDialog(
    excludeId: String,
    onDismiss: () -> Unit,
    onSelected: (Food) -> Unit,
) {
    val foodRepo: FoodRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()

    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Food>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }
    var searchJob by remember { mutableStateOf<Job?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.food_merge_pick_keeper)) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { text ->
                        query = text
                        searchJob?.cancel()
                        if (text.length >= 2) {
                            isSearching = true
                            searchJob =
                                scope.launch {
                                    delay(300)
                                    results =
                                        try {
                                            foodRepo.searchFoods(text).filter { it.id != excludeId }
                                        } catch (e: Exception) {
                                            if (e is kotlinx.coroutines.CancellationException) throw e
                                            Log.e("MergeTargetSearchDialog", "Food search failed", e)
                                            errorReporter.captureException(e)
                                            emptyList()
                                        }
                                    isSearching = false
                                }
                        } else {
                            isSearching = false
                            results = emptyList()
                        }
                    },
                    label = { Text(stringResource(R.string.food_merge_search_placeholder)) },
                    leadingIcon = { Icon(Icons.Default.Search, stringResource(R.string.food_search_icon_desc)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Spacer(modifier = Modifier.height(8.dp))
                if (isSearching) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                } else if (query.length >= 2 && results.isEmpty()) {
                    Text(
                        stringResource(R.string.food_merge_no_results),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    results.take(10).forEach { food ->
                        TextButton(
                            onClick = { onSelected(food) },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                "${food.name}${food.brand?.let { " ($it)" } ?: ""}",
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.dialog_cancel)) }
        },
    )
}

/**
 * Final confirmation before an irreversible merge: [message] names what will be
 * deleted and where its references move. Shared by the food detail screen's "merge
 * into…" action and the duplicates screen's per-group resolve action.
 */
@Composable
fun MergeConfirmDialog(
    message: String,
    isSubmitting: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        title = { Text(stringResource(R.string.food_merge_confirm_title)) },
        text = { Text(message) },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                enabled = !isSubmitting,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                } else {
                    Text(stringResource(R.string.food_merge_confirm))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) { Text(stringResource(R.string.dialog_cancel)) }
        },
    )
}
