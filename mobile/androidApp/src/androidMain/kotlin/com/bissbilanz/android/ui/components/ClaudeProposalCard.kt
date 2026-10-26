package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.macroTextTone
import com.bissbilanz.api.generated.model.AiTaskProposal
import com.bissbilanz.util.ProposalSelection
import kotlin.math.roundToInt

/**
 * Claude's suggested entries for a pending task. Every item starts selected; the user logs
 * a subset or all of them, or discards the whole suggestion. Servings are not editable
 * here. [onLog] always receives the explicit ids, so a proposal regenerated since the user
 * looked is never accepted blind. When the items change, the selection keeps what is still
 * there and starts new items selected.
 */
@Composable
fun ClaudeProposalCard(
    proposal: AiTaskProposal,
    busy: Boolean,
    onLog: (itemIds: List<String>) -> Unit,
    onDiscard: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val allIds = proposal.items.map { it.id }
    var stored by remember { mutableStateOf(ProposalSelection.all(allIds)) }
    val current = stored.reconciled(allIds)
    SideEffect { if (current != stored) stored = current }
    val selected = current.selected
    val chosen = allIds.filter { it in selected }

    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.small,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                stringResource(R.string.ai_tasks_proposal_title),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
            )
            proposal.summary?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            proposal.items.forEach { item ->
                val isSelected = item.id in selected
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .toggleable(
                                value = isSelected,
                                enabled = !busy,
                                role = Role.Checkbox,
                                onValueChange = { stored = current.toggled(item.id) },
                            ).padding(vertical = 4.dp),
                ) {
                    Checkbox(checked = isSelected, onCheckedChange = null, enabled = !busy)
                    Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                        Text(
                            item.name,
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (item.newFood != null) {
                            Text(
                                stringResource(R.string.ai_tasks_proposal_new_food),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                                maxLines = 1,
                            )
                        }
                        item.quantityDescription?.takeIf { it.isNotBlank() }?.let {
                            Text(
                                it,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(
                                stringResource(R.string.chart_kcal_format, item.calories.roundToInt()),
                                style = MaterialTheme.typography.labelSmall,
                                color = CaloriesBlue.macroTextTone(),
                                maxLines = 1,
                            )
                            MacroChipRow(
                                protein = item.protein,
                                carbs = item.carbs,
                                fat = item.fat,
                                fiber = item.fiber,
                            )
                        }
                    }
                }
            }
            if (chosen.isEmpty()) {
                Text(
                    stringResource(R.string.ai_tasks_proposal_none_selected),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = { onLog(chosen) },
                    enabled = !busy && chosen.isNotEmpty(),
                    modifier = Modifier.weight(1f),
                ) {
                    Text(stringResource(R.string.ai_tasks_proposal_log), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                OutlinedButton(
                    onClick = onDiscard,
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(stringResource(R.string.ai_tasks_proposal_discard), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}
