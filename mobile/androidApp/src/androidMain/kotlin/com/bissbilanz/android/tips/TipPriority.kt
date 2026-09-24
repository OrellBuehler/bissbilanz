package com.bissbilanz.android.tips

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.koin.compose.koinInject

/**
 * The one tip id (if any) that should be showing right now on this screen, from a list
 * of `id to eligible` candidates in priority order. Screens with more than one possible
 * tip pass all of them here so only the first eligible, not-yet-dismissed one renders —
 * never a `RichTooltip` popup and a `HintCard` competing for attention at once.
 */
@Composable
fun rememberActiveTipId(candidates: List<Pair<String, Boolean>>): String? {
    val tipStore: TipStore = koinInject()
    val dismissedIds by tipStore.dismissedIds.collectAsStateWithLifecycle()
    return candidates.firstOrNull { (id, eligible) -> eligible && id !in dismissedIds }?.first
}
