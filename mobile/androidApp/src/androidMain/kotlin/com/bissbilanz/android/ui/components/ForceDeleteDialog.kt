package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import com.bissbilanz.repository.DeleteOutcome

/**
 * Mirrors the web's ForceDeleteDialog for a food: a delete that came back blocked (still-
 * referenced diary entries, recipes or supplements) is confirmed explicitly instead of
 * being queued unconditionally and dead-lettered on the server's 409. "Delete anyway" is
 * disabled, with the reason spelled out, when forcing cannot work — the food is a recipe's
 * only ingredient or a supplement still uses it. [onShowUsage] lists what uses it.
 */
@Composable
fun ForceDeleteDialog(
    outcome: DeleteOutcome.Blocked,
    onShowUsage: () -> Unit,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    val recipeCount = outcome.recipeCount ?: 0
    val supplementCount = outcome.supplementIngredientCount ?: 0
    val message =
        when {
            outcome.forceUnavailable ->
                stringResource(R.string.delete_conflict_summary, outcome.entryCount, recipeCount, supplementCount)
            outcome.entryCount > 0 && recipeCount > 0 ->
                stringResource(R.string.delete_conflict_entries_and_recipes, outcome.entryCount, recipeCount)
            recipeCount > 0 -> stringResource(R.string.delete_conflict_recipes, recipeCount)
            else -> stringResource(R.string.delete_conflict_entries, outcome.entryCount)
        }
    val reason =
        when {
            outcome.lastIngredientRecipes.isNotEmpty() ->
                stringResource(
                    R.string.delete_conflict_last_ingredient,
                    outcome.lastIngredientRecipes.joinToString { "\"${it.name}\"" },
                )
            supplementCount > 0 -> stringResource(R.string.delete_conflict_supplements, supplementCount)
            else -> null
        }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(stringResource(R.string.delete_conflict_title)) },
        text = {
            Column {
                Text(message)
                if (reason != null) {
                    Text(
                        reason,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                TextButton(onClick = onShowUsage, modifier = Modifier.padding(top = 4.dp)) {
                    Text(stringResource(R.string.where_used_title_used))
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                enabled = !outcome.forceUnavailable,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) { Text(stringResource(R.string.action_delete_anyway)) }
        },
        dismissButton = {
            TextButton(onClick = onCancel) { Text(stringResource(R.string.dialog_cancel)) }
        },
    )
}

/**
 * A recipe that is logged in diary entries cannot be deleted — there is no "delete
 * anyway". The user is pointed at the entries ([onShowUsage]) to remove or change first.
 */
@Composable
fun RecipeDeleteBlockedDialog(
    outcome: DeleteOutcome.Blocked,
    onShowUsage: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.recipe_delete_blocked_title)) },
        text = { Text(stringResource(R.string.recipe_delete_blocked_text, outcome.entryCount)) },
        confirmButton = {
            TextButton(onClick = onShowUsage) { Text(stringResource(R.string.where_used_title_logged)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.dialog_ok)) }
        },
    )
}
