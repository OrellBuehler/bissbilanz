package com.bissbilanz.android.ui.components

import android.app.Application
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.repository.WeightRepository
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.koin.core.context.startKoin
import org.koin.core.context.stopKoin
import org.koin.dsl.module
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = WeightWidgetTest.TestApp::class)
class WeightWidgetTest {
    class TestApp : Application()

    @get:Rule
    val composeTestRule = createComposeRule()

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var weightRepo: WeightRepository
    private lateinit var errorReporter: ErrorReporter

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        weightRepo =
            mockk(relaxed = true) {
                every { entries() } returns MutableStateFlow(emptyList())
            }
        errorReporter = mockk(relaxed = true)

        startKoin {
            modules(
                module {
                    single<WeightRepository> { weightRepo }
                    single<ErrorReporter> { errorReporter }
                },
            )
        }
    }

    @After
    fun tearDown() {
        stopKoin()
        Dispatchers.resetMain()
    }

    @Test
    fun survivesFailingRefresh() {
        coEvery { weightRepo.refresh(any()) } throws RuntimeException("Network error")

        composeTestRule.setContent {
            BissbilanzTheme {
                WeightWidget(date = "2024-01-15", onViewAll = {})
            }
        }

        composeTestRule.onNodeWithText("Weight").assertIsDisplayed()
        verify { errorReporter.captureException(any()) }
    }
}
