package com.bissbilanz.android.ui.components

import androidx.compose.foundation.layout.RowScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import com.bissbilanz.android.R

/**
 * The app bar used by the bottom-tab destinations.
 *
 * Those screens used to fake a title with a bold `headlineMedium` Text inside their
 * scrolling content, which meant the title scrolled away, never tinted on scroll, and
 * looked nothing like the real [TopAppBar] every pushed screen already used. This is
 * the same small top app bar, minus the back arrow (unless [onBack] is given for a tab
 * screen opened from elsewhere), so the whole app shares one header.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppTopBar(
    title: String,
    scrollBehavior: TopAppBarScrollBehavior? = null,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    AppTopBar(
        title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        scrollBehavior = scrollBehavior,
        onBack = onBack,
        actions = actions,
    )
}

/** [AppTopBar] for screens whose title is more than a plain string. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppTopBar(
    title: @Composable () -> Unit,
    scrollBehavior: TopAppBarScrollBehavior? = null,
    onBack: (() -> Unit)? = null,
    navigationIcon: (@Composable () -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    TopAppBar(
        title = title,
        navigationIcon = {
            if (navigationIcon != null) {
                navigationIcon()
            } else if (onBack != null) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                }
            }
        },
        actions = actions,
        scrollBehavior = scrollBehavior,
    )
}
