package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.RecipeRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

@OptIn(ExperimentalCoroutinesApi::class)
class AddFoodViewModelTest {
    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var foodRepo: FoodRepository
    private lateinit var recipeRepo: RecipeRepository
    private lateinit var entryRepo: EntryRepository
    private lateinit var errorReporter: ErrorReporter

    @BeforeTest
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        foodRepo =
            mockk(relaxed = true) {
                every { recentFoods } returns MutableStateFlow(emptyList())
                every { favorites() } returns flowOf(emptyList())
            }
        recipeRepo =
            mockk(relaxed = true) {
                every { allRecipes() } returns flowOf(emptyList())
            }
        entryRepo = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel() = AddFoodViewModel(foodRepo, recipeRepo, entryRepo, errorReporter)

    private fun testFood(id: String = "food-1") =
        Food(
            id = id,
            userId = "user-1",
            name = "Test Food",
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
        )

    @Test
    fun searchWithShortQueryReturnsEmpty() =
        runTest {
            val vm = viewModel()

            vm.updateQuery("a")
            advanceUntilIdle()

            assertEquals("a", vm.query.value)
            assertEquals(emptyList(), vm.searchResults.value)
        }

    @Test
    fun searchWithValidQueryCallsRepo() =
        runTest {
            val food = testFood()
            val results = listOf(food)
            coEvery { foodRepo.searchFoods("ap") } returns results

            val vm = viewModel()
            vm.updateQuery("ap")
            advanceUntilIdle()

            coVerify { foodRepo.searchFoods("ap") }
            assertEquals(results, vm.searchResults.value)
        }

    @Test
    fun searchErrorHandledGracefully() =
        runTest {
            coEvery { foodRepo.searchFoods(any()) } throws RuntimeException("Network error")

            val vm = viewModel()
            vm.updateQuery("ap")
            advanceUntilIdle()

            assertEquals(emptyList(), vm.searchResults.value)
            assertEquals("Search failed", vm.snackbarMessage.value)
        }

    @Test
    fun resetClearsSearchState() =
        runTest {
            val results = listOf(testFood())
            coEvery { foodRepo.searchFoods(any()) } returns results

            val vm = viewModel()
            vm.updateQuery("apple")
            advanceUntilIdle()
            assertEquals("apple", vm.query.value)

            vm.reset()

            assertEquals("", vm.query.value)
            assertEquals(emptyList(), vm.searchResults.value)
        }

    @Test
    fun logFoodCreatesEntry() =
        runTest {
            val food = testFood()
            val vm = viewModel()

            vm.logFood(food, "breakfast", 1.0, "2024-01-15") {}
            advanceUntilIdle()

            coVerify {
                entryRepo.createEntry(
                    match { it.foodId == food.id && it.mealType == "breakfast" && it.servings == 1.0 && it.date == "2024-01-15" },
                    food = food,
                    recipe = null,
                )
            }
        }

    @Test
    fun logFoodCallsOnComplete() =
        runTest {
            val food = testFood()
            var called = false

            val vm = viewModel()
            vm.logFood(food, "breakfast", 1.0, "2024-01-15") { called = true }
            advanceUntilIdle()

            assertEquals(true, called)
        }

    @Test
    fun logFoodSetsIsSaving() =
        runTest {
            val food = testFood()
            val vm = viewModel()

            vm.logFood(food, "breakfast", 1.0, "2024-01-15") {}
            advanceUntilIdle()

            assertEquals(false, vm.isSaving.value)
        }

    @Test
    fun logFoodErrorHandledGracefully() =
        runTest {
            val food = testFood()
            coEvery { entryRepo.createEntry(any(), food = any(), recipe = isNull()) } throws RuntimeException("Network error")

            val vm = viewModel()
            vm.logFood(food, "breakfast", 1.0, "2024-01-15") {}
            advanceUntilIdle()

            assertEquals("Failed to log food", vm.snackbarMessage.value)
            assertEquals(false, vm.isSaving.value)
        }

    @Test
    fun logRecipeCreatesEntry() =
        runTest {
            val recipe = mockk<com.bissbilanz.model.Recipe>(relaxed = true)
            val recipeId = recipe.id
            val vm = viewModel()

            vm.logRecipe(recipe, "lunch", 1.0, "2024-01-15") {}
            advanceUntilIdle()

            coVerify {
                entryRepo.createEntry(
                    match { it.recipeId == recipeId && it.mealType == "lunch" },
                    food = isNull(),
                    recipe = recipe,
                )
            }
        }

    @Test
    fun logQuickEntryCreatesEntry() =
        runTest {
            val vm = viewModel()

            vm.logQuickEntry(
                mealType = "dinner",
                date = "2024-01-15",
                name = "Restaurant meal",
                calories = 600.0,
                protein = 30.0,
                carbs = 50.0,
                fat = 20.0,
                fiber = null,
                notes = null,
                onComplete = {},
            )
            advanceUntilIdle()

            coVerify {
                entryRepo.createEntry(
                    match {
                        it.mealType == "dinner" &&
                            it.date == "2024-01-15" &&
                            it.quickName == "Restaurant meal" &&
                            it.quickCalories == 600.0
                    },
                    food = isNull(),
                    recipe = isNull(),
                )
            }
        }

    @Test
    fun logFoodUsesExactMealTypeFromParameter() =
        runTest {
            val food = testFood()
            val vm = viewModel()

            vm.logFood(food, "breakfast", 1.0, "2024-01-15") {}
            advanceUntilIdle()

            coVerify {
                entryRepo.createEntry(
                    match { it.mealType == "breakfast" },
                    food = any(),
                    recipe = isNull(),
                )
            }
        }

    @Test
    fun clearSnackbarResetsMessage() =
        runTest {
            coEvery { foodRepo.searchFoods(any()) } throws RuntimeException("error")

            val vm = viewModel()
            vm.updateQuery("ap")
            advanceUntilIdle()
            assertEquals("Search failed", vm.snackbarMessage.value)

            vm.clearSnackbar()

            assertNull(vm.snackbarMessage.value)
        }
}
