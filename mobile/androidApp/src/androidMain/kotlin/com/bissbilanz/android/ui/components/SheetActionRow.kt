package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bissbilanz.android.R

/**
 * Footer of a bottom sheet: a cancel and a confirm button of equal width and height with a
 * fixed 12dp gap, labels on one line so German never makes one button taller than the other.
 */
@Composable
fun SheetActionRow(
    onCancel: () -> Unit,
    confirmLabel: String,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
    cancelLabel: String = stringResource(R.string.dialog_cancel),
    cancelEnabled: Boolean = true,
    confirmEnabled: Boolean = true,
) {
    SheetActionRow(modifier = modifier) {
        OutlinedButton(
            onClick = onCancel,
            enabled = cancelEnabled,
            modifier = Modifier.weight(1f).fillMaxHeight(),
        ) {
            Text(cancelLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Button(
            onClick = onConfirm,
            enabled = confirmEnabled,
            modifier = Modifier.weight(1f).fillMaxHeight(),
        ) {
            Text(confirmLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** The row behind [SheetActionRow], for footers whose buttons carry extra behaviour. */
@Composable
fun SheetActionRow(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier = modifier.fillMaxWidth().height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}
