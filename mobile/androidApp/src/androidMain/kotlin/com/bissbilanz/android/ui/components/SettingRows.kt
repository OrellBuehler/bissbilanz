package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.semantics.Role
import com.bissbilanz.android.ui.theme.rememberHaptic

/**
 * A settings row whose whole width toggles a [Switch].
 *
 * Replaces the hand-rolled `Row { Text; Switch }` rows, which only responded to a tap
 * on the switch itself, were roughly 36dp tall (under the 48dp minimum target), and
 * read out to TalkBack as an unrelated label and control rather than one switch.
 */
@Composable
fun ToggleRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    supportingText: String? = null,
    enabled: Boolean = true,
) {
    val haptic = rememberHaptic()
    ListItem(
        headlineContent = { Text(label) },
        supportingContent = supportingText?.let { { Text(it) } },
        trailingContent = {
            Switch(checked = checked, onCheckedChange = null, enabled = enabled)
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier =
            modifier
                .fillMaxWidth()
                .toggleable(
                    value = checked,
                    enabled = enabled,
                    role = Role.Switch,
                    onValueChange = {
                        haptic(HapticFeedbackType.LongPress)
                        onCheckedChange(it)
                    },
                ),
    )
}

/** [ToggleRow]'s checkbox sibling, for the multi-select settings lists. */
@Composable
fun CheckboxRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val haptic = rememberHaptic()
    ListItem(
        headlineContent = {
            Text(
                label,
                color =
                    if (enabled) {
                        MaterialTheme.colorScheme.onSurface
                    } else {
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                    },
            )
        },
        leadingContent = {
            Checkbox(checked = checked, onCheckedChange = null, enabled = enabled)
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier =
            modifier
                .fillMaxWidth()
                .toggleable(
                    value = checked,
                    enabled = enabled,
                    role = Role.Checkbox,
                    onValueChange = {
                        haptic(HapticFeedbackType.LongPress)
                        onCheckedChange(it)
                    },
                ),
    )
}
