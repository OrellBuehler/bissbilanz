package com.bissbilanz.wear

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
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

@Composable
fun WearApp() {
    val state by WearStateRepository.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    MaterialTheme {
        val current = state
        if (current == null) {
            Box(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    stringResource(R.string.waiting_for_phone),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.body2,
                )
            }
            return@MaterialTheme
        }

        // Totals are day-bound; a state captured yesterday must not read as today's.
        val fresh = current.resetIfStale(LocalDate.now().toString())

        // Four horizontal pages, matching the Apple Watch app's tabs.
        val pagerState = rememberPagerState(pageCount = { 4 })
        HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
            when (page) {
                0 -> TodayScreen(fresh)
                1 -> LogScreen(fresh, context)
                2 -> WeightScreen(fresh, context)
                else -> SleepScreen(fresh, context)
            }
        }
    }
}
