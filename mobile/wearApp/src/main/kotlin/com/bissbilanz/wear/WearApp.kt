package com.bissbilanz.wear

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import com.bissbilanz.wear.screens.LogScreen
import com.bissbilanz.wear.screens.SleepScreen
import com.bissbilanz.wear.screens.TodayScreen
import com.bissbilanz.wear.screens.WeightScreen
import java.time.LocalDate

/** The four horizontal pages, matching the Apple Watch app's tabs. */
object WearPages {
    const val TODAY = 0
    const val LOG = 1
    const val WEIGHT = 2
    const val SLEEP = 3
    const val COUNT = 4
}

/**
 * A page the app was asked to open — from a complication tap, say. [token]
 * distinguishes two requests for the same page, so tapping the complication
 * again brings the log back after the user has swiped away.
 */
data class WearPageRequest(
    val page: Int,
    val token: Int,
)

@Composable
fun WearApp(pageRequest: WearPageRequest? = null) {
    val state by WearStateRepository.state.collectAsStateWithLifecycle()
    // Deliberately the activity's own context, not the locale-overridden one
    // below: it is only ever used to talk to the Data Layer.
    val context = LocalContext.current

    ProvideAppLocale(state?.localeCode) {
        MaterialTheme {
            val current = state
            if (current == null) {
                Box(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        wearString(R.string.waiting_for_phone),
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.body2,
                    )
                }
                return@MaterialTheme
            }

            // Totals are day-bound; a state captured yesterday must not read as today's.
            val fresh = current.resetIfStale(LocalDate.now().toString())

            val pagerState = rememberPagerState(initialPage = pageRequest?.page ?: WearPages.TODAY) { WearPages.COUNT }
            LaunchedEffect(pageRequest) {
                pageRequest?.let { pagerState.scrollToPage(it.page) }
            }
            HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                when (page) {
                    WearPages.TODAY -> TodayScreen(fresh)
                    WearPages.LOG -> LogScreen(fresh, context)
                    WearPages.WEIGHT -> WeightScreen(fresh, context)
                    else -> SleepScreen(fresh, context)
                }
            }
        }
    }
}
