package com.bissbilanz.android.ui.screens

import android.app.Application
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.navigation.testing.TestNavHostController
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.sync.RefreshManager
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.android.ui.viewmodels.DashboardViewModel
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.model.Entry
import com.bissbilanz.model.Goals
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
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

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = DashboardScreenTest.TestApp::class)
class DashboardScreenTest {
    class TestApp : Application()

    @get:Rule
    val composeTestRule = createComposeRule()

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var entriesFlow: MutableStateFlow<List<Entry>>
    private lateinit var goalsFlow: MutableStateFlow<Goals?>
    private lateinit var entryRepo: EntryRepository
    private lateinit var goalsRepo: GoalsRepository
    private lateinit var prefsRepo: PreferencesRepository
    private lateinit var refreshManager: RefreshManager
    private lateinit var errorReporter: ErrorReporter

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        entriesFlow = MutableStateFlow(emptyList())
        goalsFlow = MutableStateFlow(null)
        entryRepo =
            mockk(relaxed = true) {
                every { entriesByDate(any()) } returns entriesFlow
            }
        goalsRepo =
            mockk(relaxed = true) {
                every { goals() } returns goalsFlow
            }
        prefsRepo =
            mockk(relaxed = true) {
                every { preferences() } returns MutableStateFlow(null)
            }
        refreshManager = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)

        startKoin {
            modules(
                module {
                    single<EntryRepository> { entryRepo }
                    single<GoalsRepository> { goalsRepo }
                    single<PreferencesRepository> { prefsRepo }
                    single<RefreshManager> { refreshManager }
                    single<ErrorReporter> { errorReporter }
                    viewModelOf(::DashboardViewModel)
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
    fun displaysDateLabelAsToday() {
        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DashboardScreen(navController)
            }
        }
        composeTestRule.onNodeWithText("Today").assertIsDisplayed()
    }

    @Test
    fun displaysMacroLabels() {
        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DashboardScreen(navController)
            }
        }
        composeTestRule.onNodeWithText("Calories").assertIsDisplayed()
        composeTestRule.onNodeWithText("Protein").assertIsDisplayed()
        composeTestRule.onNodeWithText("Carbs").assertIsDisplayed()
        composeTestRule.onNodeWithText("Fat").assertIsDisplayed()
        composeTestRule.onNodeWithText("Fiber").assertIsDisplayed()
    }

    @Test
    fun displaysEmptyStateCopyButton() {
        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DashboardScreen(navController)
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Copy from yesterday").assertExists()
    }

    @Test
    fun doesNotShowCopyButtonWhenEntriesPresent() {
        val entry =
            Entry(
                id = "1",
                userId = "u1",
                foodId = "f1",
                date = "2024-01-15",
                mealType = "lunch",
                servings = 1.0,
                food =
                    Food(
                        id = "f1",
                        userId = "u1",
                        name = "Test Chicken",
                        brand = null,
                        servingSize = 100.0,
                        servingUnit = Food.ServingUnit.g,
                        calories = 200.0,
                        protein = 20.0,
                        carbs = 25.0,
                        fat = 8.0,
                        fiber = 3.0,
                        barcode = null,
                        nutriScore = null,
                        novaGroup = null,
                        additives = null,
                        ingredientsText = null,
                        imageUrl = null,
                    ),
            )
        entriesFlow.value = listOf(entry)

        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DashboardScreen(navController)
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Copy from yesterday").assertDoesNotExist()
    }
}
