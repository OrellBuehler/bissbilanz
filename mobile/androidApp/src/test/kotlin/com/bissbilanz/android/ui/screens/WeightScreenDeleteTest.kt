package com.bissbilanz.android.ui.screens

import android.app.Application
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.navigation.testing.TestNavHostController
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.android.ui.viewmodels.WeightViewModel
import com.bissbilanz.model.WeightEntry
import com.bissbilanz.repository.WeightRepository
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
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
import org.koin.core.module.dsl.viewModelOf
import org.koin.dsl.module
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The confirm handler clears entryToDelete synchronously, right after starting the
 * coroutine that deletes. Reading the dialog state with `!!` inside scope.launch
 * therefore always saw null by the time the body was dispatched, and every delete
 * NPE'd (Sentry BISSBILANZ-2T, fixed in PR #515 by capturing the entry with ?.let).
 *
 * Only reachable through the UI — the repository never gets called, so no repository
 * test can catch it. The same shape was duplicated in RecipeListScreen's quick-log.
 *
 * Uses the junit4.v2 rule deliberately: it dispatches composition effects through a
 * StandardTestDispatcher, so scope.launch queues the way it does on a real frame clock.
 * The v1 rule runs the body inline at the launch point, before the click handler nulls
 * the state, and the pre-fix code passes.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = WeightScreenDeleteTest.TestApp::class)
class WeightScreenDeleteTest {
    class TestApp : Application()

    @get:Rule
    val composeTestRule = createComposeRule()

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var entriesFlow: MutableStateFlow<List<WeightEntry>>
    private lateinit var weightRepo: WeightRepository

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        entriesFlow = MutableStateFlow(listOf(testEntry("weight-1", "2024-01-15", 82.3)))
        weightRepo =
            mockk(relaxed = true) {
                every { entries() } returns entriesFlow
            }

        startKoin {
            modules(
                module {
                    single<WeightRepository> { weightRepo }
                    single<RefreshManager> { mockk(relaxed = true) }
                    single<ErrorReporter> { mockk(relaxed = true) }
                    viewModelOf(::WeightViewModel)
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
    fun confirmingTheDeleteDialogDeletesTheEntryItWasOpenedFor() {
        composeTestRule.setContent {
            BissbilanzTheme {
                WeightScreen(navController = TestNavHostController(ApplicationProvider.getApplicationContext()))
            }
        }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithContentDescription("Delete weight entry").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Delete entry from 2024-01-15?").assertExists()

        composeTestRule.onNodeWithText("Delete").performClick()
        composeTestRule.waitForIdle()

        coVerify(exactly = 1) { weightRepo.deleteEntry("weight-1") }
    }

    private fun testEntry(
        id: String,
        date: String,
        kg: Double,
    ) = WeightEntry(
        id = id,
        userId = "user-1",
        weightKg = kg,
        entryDate = date,
        notes = null,
    )
}
