package com.bissbilanz.android.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.util.dayLabel
import com.bissbilanz.repository.WhereUsed
import com.bissbilanz.repository.WhereUsedEntry
import com.bissbilanz.repository.WhereUsedRef
import com.bissbilanz.util.toDisplayString
import kotlinx.datetime.LocalDate
import org.koin.compose.koinInject

private sealed interface WhereUsedState {
    data object Loading : WhereUsedState

    data object Failed : WhereUsedState

    data class Loaded(
        val usage: WhereUsed,
    ) : WhereUsedState
}

/**
 * The diary entries (and, for a food, the recipes and supplements) that use a food or
 * recipe, newest entry first. Backs the blocked-delete dialogs: tapping an entry opens
 * that day so the entry can be removed or changed, and a recipe opens the recipe.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WhereUsedSheet(
    title: String,
    name: String,
    load: suspend () -> WhereUsed,
    onDismiss: () -> Unit,
    onOpenEntry: (WhereUsedEntry) -> Unit,
    onOpenRecipe: ((WhereUsedRef) -> Unit)? = null,
    onOpenSupplement: ((WhereUsedRef) -> Unit)? = null,
) {
    val errorReporter: ErrorReporter = koinInject()
    var state by remember { mutableStateOf<WhereUsedState>(WhereUsedState.Loading) }

    LaunchedEffect(Unit) {
        state =
            try {
                WhereUsedState.Loaded(load())
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                WhereUsedState.Failed
            }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
            Text(
                name,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
            when (val current = state) {
                WhereUsedState.Loading ->
                    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }

                WhereUsedState.Failed ->
                    Text(
                        stringResource(R.string.where_used_failed),
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(16.dp),
                    )

                is WhereUsedState.Loaded ->
                    WhereUsedList(current.usage, onOpenEntry, onOpenRecipe, onOpenSupplement)
            }
        }
    }
}

@Composable
private fun WhereUsedList(
    usage: WhereUsed,
    onOpenEntry: (WhereUsedEntry) -> Unit,
    onOpenRecipe: ((WhereUsedRef) -> Unit)?,
    onOpenSupplement: ((WhereUsedRef) -> Unit)?,
) {
    if (usage.totalEntries == 0 && usage.recipes.isEmpty() && usage.supplements.isEmpty()) {
        Text(
            stringResource(R.string.where_used_empty),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(16.dp),
        )
        return
    }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(0.dp)) {
        if (usage.recipes.isNotEmpty()) {
            item { SectionHeading(stringResource(R.string.where_used_recipes_heading, usage.recipes.size)) }
            items(usage.recipes, key = { "recipe-${it.id}" }) { recipe ->
                ListItem(
                    headlineContent = { Text(recipe.name) },
                    supportingContent =
                        if (recipe.isLastIngredient) {
                            { Text(stringResource(R.string.where_used_last_ingredient)) }
                        } else {
                            null
                        },
                    trailingContent = { Chevron() },
                    modifier = Modifier.clickable(enabled = onOpenRecipe != null) { onOpenRecipe?.invoke(recipe) },
                )
            }
        }
        if (usage.supplements.isNotEmpty()) {
            item { SectionHeading(stringResource(R.string.where_used_supplements_heading, usage.supplements.size)) }
            items(usage.supplements, key = { "supplement-${it.id}" }) { supplement ->
                ListItem(
                    headlineContent = { Text(supplement.name) },
                    trailingContent = { Chevron() },
                    modifier = Modifier.clickable(enabled = onOpenSupplement != null) { onOpenSupplement?.invoke(supplement) },
                )
            }
        }
        if (usage.totalEntries > 0) {
            item { SectionHeading(stringResource(R.string.where_used_entries_heading, usage.totalEntries)) }
            items(usage.entries, key = { "entry-${it.id}" }) { entry ->
                ListItem(
                    headlineContent = { Text(dayLabel(LocalDate.parse(entry.date))) },
                    supportingContent = { Text(mealTypeDisplayName(entry.mealType)) },
                    trailingContent = {
                        Text(
                            stringResource(R.string.where_used_servings, entry.servings.toDisplayString()),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    },
                    modifier = Modifier.clickable { onOpenEntry(entry) },
                )
            }
            if (usage.totalEntries > usage.entries.size) {
                item {
                    Text(
                        stringResource(R.string.where_used_showing_newest, usage.entries.size, usage.totalEntries),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionHeading(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 4.dp),
    )
}

@Composable
private fun Chevron() {
    Icon(
        Icons.AutoMirrored.Filled.KeyboardArrowRight,
        contentDescription = null,
        tint = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
