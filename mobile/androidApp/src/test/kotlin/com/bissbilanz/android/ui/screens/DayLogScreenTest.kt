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
import com.bissbilanz.android.ui.viewmodels.DayLogViewModel
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.model.Entry
import com.bissbilanz.repository.EntryRepository
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
@Config(sdk = [31], application = DayLogScreenTest.TestApp::class)
class DayLogScreenTest {
    class TestApp : Application()

    @get:Rule
    val composeTestRule = createComposeRule()

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var entriesFlow: MutableStateFlow<List<Entry>>
    private lateinit var entryRepo: EntryRepository
    private lateinit var refreshManager: RefreshManager
    private lateinit var errorReporter: ErrorReporter

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        entriesFlow = MutableStateFlow(emptyList())
        entryRepo =
            mockk(relaxed = true) {
                every { entriesByDate(any()) } returns entriesFlow
            }
        refreshManager = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)

        startKoin {
            modules(
                module {
                    single<EntryRepository> { entryRepo }
                    single<RefreshManager> { refreshManager }
                    single<ErrorReporter> { errorReporter }
                    viewModelOf(::DayLogViewModel)
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
    fun displaysDateInTopBar() {
        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DayLogScreen(date = "2024-01-15", navController = navController)
            }
        }
        composeTestRule.onNodeWithText("2024-01-15").assertIsDisplayed()
    }

    @Test
    fun displaysEmptyState() {
        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DayLogScreen(date = "2024-01-15", navController = navController)
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("No entries for this day").assertIsDisplayed()
    }

    @Test
    fun displaysMealSectionsWithEntries() {
        entriesFlow.value =
            listOf(
                testEntry("1", "lunch", "Grilled Chicken", 300.0, 30.0, 5.0, 10.0),
                testEntry("2", "lunch", "Brown Rice", 200.0, 5.0, 40.0, 2.0),
            )

        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DayLogScreen(date = "2024-01-15", navController = navController)
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Lunch").assertIsDisplayed()
        composeTestRule.onNodeWithText("Grilled Chicken", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("Brown Rice", substring = true).assertIsDisplayed()
    }

    @Test
    fun displaysMultipleMealSections() {
        entriesFlow.value =
            listOf(
                testEntry("1", "breakfast", "Oatmeal", 150.0, 5.0, 27.0, 3.0),
                testEntry("2", "lunch", "Salad", 250.0, 15.0, 20.0, 12.0),
            )

        composeTestRule.setContent {
            BissbilanzTheme {
                val navController = TestNavHostController(ApplicationProvider.getApplicationContext())
                DayLogScreen(date = "2024-01-15", navController = navController)
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Breakfast").assertIsDisplayed()
        composeTestRule.onNodeWithText("Lunch").assertIsDisplayed()
    }

    companion object {
        fun testEntry(
            id: String,
            mealType: String,
            name: String,
            calories: Double,
            protein: Double,
            carbs: Double,
            fat: Double,
        ) = Entry(
            id = id,
            userId = "user-1",
            foodId = "food-$id",
            date = "2024-01-15",
            mealType = mealType,
            servings = 1.0,
            food =
                Food(
                    id = "food-$id",
                    userId = "user-1",
                    name = name,
                    brand = null,
                    servingSize = 100.0,
                    servingUnit = Food.ServingUnit.g,
                    calories = calories,
                    protein = protein,
                    carbs = carbs,
                    fat = fat,
                    fiber = 3.0,
                    barcode = null,
                    nutriScore = null,
                    novaGroup = null,
                    additives = null,
                    ingredientsText = null,
                    imageUrl = null,
                ),
        )
    }
}
