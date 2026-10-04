package com.bissbilanz.android.ui.components

import android.app.Application
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.ui.viewmodels.FoodSearchViewModel
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodsListResponse
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.koin.core.context.startKoin
import org.koin.core.context.stopKoin
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNull

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = FoodPickerSheetTest.TestApp::class)
class FoodPickerSheetTest {
    class TestApp : Application()

    @get:Rule
    val composeTestRule = createComposeRule()

    private fun food(
        id: String,
        name: String,
    ) = Food(
        id = id,
        userId = "user-1",
        name = name,
        brand = null,
        servingSize = 100.0,
        servingUnit = Food.ServingUnit.g,
        calories = 100.0,
        protein = 1.0,
        carbs = 1.0,
        fat = 1.0,
        fiber = 1.0,
        barcode = null,
        nutriScore = null,
        novaGroup = null,
        additives = null,
        ingredientsText = null,
        imageUrl = null,
    )

    @Before
    fun setup() {
        val foodRepo: FoodRepository =
            mockk(relaxed = true) {
                every { recentFoods } returns MutableStateFlow(emptyList())
                every { favorites() } returns flowOf(emptyList())
            }
        coEvery { foodRepo.fetchFoodsPaginated(any(), any()) } returns
            FoodsListResponse(foods = listOf(food("a", "Erbsen gefroren"), food("b", "Erdbeeren gefroren")), total = 2)
        val entryRepo: EntryRepository = mockk(relaxed = true)
        val errorReporter: ErrorReporter = mockk(relaxed = true)
        startKoin {
            modules(
                module {
                    viewModel { FoodSearchViewModel(foodRepo, entryRepo, errorReporter) }
                },
            )
        }
    }

    @After
    fun tearDown() {
        stopKoin()
    }

    @Test
    fun excludedFoodIsNotOffered() {
        composeTestRule.setContent {
            FoodPickerSheet(title = "Pick food", excludeIds = setOf("a"), onDismiss = {}, onFoodSelected = {})
        }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Pick food").assertIsDisplayed()
        composeTestRule.onNodeWithText("Erdbeeren gefroren").assertIsDisplayed()
        composeTestRule.onNodeWithText("Erbsen gefroren").assertDoesNotExist()
    }

    @Test
    fun tappingAFoodReturnsIt() {
        var picked: Food? = null
        composeTestRule.setContent {
            FoodPickerSheet(title = "Pick food", onDismiss = {}, onFoodSelected = { picked = it })
        }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Erbsen gefroren").performClick()

        assertEquals("a", picked?.id)
    }

    @Test
    fun nothingIsReturnedUntilAFoodIsTapped() {
        var picked: Food? = null
        composeTestRule.setContent {
            FoodPickerSheet(title = "Pick food", onDismiss = {}, onFoodSelected = { picked = it })
        }
        composeTestRule.waitForIdle()

        assertNull(picked)
    }

    @Test
    fun allRecentAndFavoritesTabsAreOffered() {
        composeTestRule.setContent {
            FoodPickerSheet(title = "Pick food", onDismiss = {}, onFoodSelected = {})
        }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("All").assertIsDisplayed()
        composeTestRule.onNodeWithText("Recent").assertIsDisplayed()
        composeTestRule.onNodeWithText("Favorites").assertIsDisplayed()
    }
}
