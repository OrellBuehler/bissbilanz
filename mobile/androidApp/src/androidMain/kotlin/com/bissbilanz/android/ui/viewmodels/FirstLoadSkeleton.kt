package com.bissbilanz.android.ui.viewmodels

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

/**
 * The skeleton is only for the very first load: it ends as soon as cached entries are
 * on screen, or once the first refresh finished for a day that is really empty (so
 * "no entries yet" never flashes before the network answered). Later refreshes and
 * day switches keep the content on screen.
 */
class FirstLoadSkeleton(
    scope: CoroutineScope,
) {
    private val firstLoadDone = MutableStateFlow(false)

    /** Whether the first list the entries query emitted was empty, or null before it has. */
    private val firstWasEmpty = MutableStateFlow<Boolean?>(null)

    val isLoading: StateFlow<Boolean> =
        combine(firstLoadDone, firstWasEmpty) { done, empty ->
            empty == null || (empty && !done)
        }.stateIn(scope, SharingStarted.Eagerly, true)

    fun onEntries(entries: List<*>) {
        if (firstWasEmpty.value == null) firstWasEmpty.value = entries.isEmpty()
    }

    fun onLoadFinished() {
        firstLoadDone.value = true
    }
}
