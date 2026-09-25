package com.bissbilanz.android.tips

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.RichTooltip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TooltipAnchorPosition
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.R
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

/**
 * A one-time [RichTooltip] pointing at a persistent piece of UI — the Material 3
 * successor to a "coach mark". Shows itself automatically the first time [eligible]
 * turns true for a tip the user has not already dismissed, and never again afterwards:
 * "Learn more" opens the matching help article, "Got it" just closes it, and either one
 * (or tapping outside) marks the tip dismissed in [TipStore].
 *
 * Callers are responsible for [eligible] reflecting both the tip's own unlock condition
 * (e.g. a usage count) and screen-level priority — see [rememberActiveTipId] — so at
 * most one tip is ever showing at a time.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnchoredTip(
    tipId: String,
    title: String,
    text: String,
    helpSlug: String,
    eligible: Boolean,
    modifier: Modifier = Modifier,
    anchorPosition: TooltipAnchorPosition = TooltipAnchorPosition.Below,
    content: @Composable () -> Unit,
) {
    val tipStore: TipStore = koinInject()
    val dismissedIds by tipStore.dismissedIds.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val tooltipState = rememberTooltipState(isPersistent = true)
    val shouldShow = eligible && tipId !in dismissedIds

    LaunchedEffect(shouldShow) {
        if (shouldShow) tooltipState.show()
    }

    fun dismiss() {
        scope.launch { tooltipState.dismiss() }
        tipStore.dismiss(tipId)
    }

    TooltipBox(
        positionProvider = TooltipDefaults.rememberTooltipPositionProvider(anchorPosition),
        state = tooltipState,
        focusable = true,
        enableUserInput = false,
        hasAction = true,
        onDismissRequest = { tipStore.dismiss(tipId) },
        tooltip = {
            RichTooltip(
                title = { Text(title) },
                action = {
                    Row(horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = {
                            openHelp(context, helpSlug)
                            dismiss()
                        }) { Text(stringResource(R.string.tip_learn_more)) }
                        TextButton(onClick = { dismiss() }) { Text(stringResource(R.string.tip_got_it)) }
                    }
                },
            ) { Text(text) }
        },
        modifier = modifier,
        content = content,
    )
}
