package com.bissbilanz.android.ui.components

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.bissbilanz.android.R
import com.bissbilanz.repository.DeleteOutcome

/**
 * Mirrors the web's ForceDeleteDialog: a delete that came back blocked (still-referenced
 * diary entries and/or, for a food, recipes) is confirmed explicitly instead of being
 * queued unconditionally and dead-lettered on the server's 409.
 */
@Composable
fun ForceDeleteDialog(
    outcome: DeleteOutcome.Blocked,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    val message =
        when {
            outcome.entryCount > 0 && (outcome.recipeCount ?: 0) > 0 ->
                stringResource(R.string.delete_conflict_entries_and_recipes, outcome.entryCount, outcome.recipeCount ?: 0)
            (outcome.recipeCount ?: 0) > 0 ->
                stringResource(R.string.delete_conflict_recipes, outcome.recipeCount ?: 0)
            else -> stringResource(R.string.delete_conflict_entries, outcome.entryCount)
        }
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(stringResource(R.string.delete_conflict_title)) },
        text = { Text(message) },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) { Text(stringResource(R.string.action_delete_anyway)) }
        },
        dismissButton = {
            TextButton(onClick = onCancel) { Text(stringResource(R.string.dialog_cancel)) }
        },
    )
}
