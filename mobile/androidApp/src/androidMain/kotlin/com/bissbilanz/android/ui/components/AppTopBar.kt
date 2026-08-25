package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.style.TextOverflow

/**
 * The app bar used by the bottom-tab destinations.
 *
 * Those screens used to fake a title with a bold `headlineMedium` Text inside their
 * scrolling content, which meant the title scrolled away, never tinted on scroll, and
 * looked nothing like the real [TopAppBar] every pushed screen already used. This is
 * the same small top app bar, minus the back arrow, so the whole app shares one header.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppTopBar(
    title: String,
    scrollBehavior: TopAppBarScrollBehavior? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    TopAppBar(
        title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        actions = actions,
        scrollBehavior = scrollBehavior,
    )
}
