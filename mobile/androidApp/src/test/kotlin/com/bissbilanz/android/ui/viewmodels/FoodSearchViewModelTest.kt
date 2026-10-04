package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodsListResponse
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
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
class FoodSearchViewModelTest {
    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var foodRepo: FoodRepository
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
        coEvery { foodRepo.fetchFoodsPaginated(any(), any()) } returns FoodsListResponse(foods = emptyList(), total = 0)
        entryRepo = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel() = FoodSearchViewModel(foodRepo, entryRepo, errorReporter)

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
    fun openFoodFactsFallbackRunsByDefaultOnSparseResults() =
        runTest {
            coEvery { foodRepo.searchFoods("ap") } returns listOf(testFood())

            val vm = viewModel()
            vm.updateQuery("ap")
            advanceUntilIdle()

            coVerify { foodRepo.searchOpenFoodFacts("ap") }
        }

    @Test
    fun disabledOpenFoodFactsFallbackNeverCallsOpenFoodFacts() =
        runTest {
            coEvery { foodRepo.searchFoods("ap") } returns listOf(testFood())

            val vm = viewModel()
            vm.openFoodFactsFallback = false
            vm.updateQuery("ap")
            advanceUntilIdle()

            coVerify(exactly = 0) { foodRepo.searchOpenFoodFacts(any()) }
            assertEquals(emptyList(), vm.offResults.value)
        }

    @Test
    fun resetSearchClearsQueryResultsAndTab() =
        runTest {
            coEvery { foodRepo.searchFoods("apple") } returns listOf(testFood())

            val vm = viewModel()
            vm.updateQuery("apple")
            advanceUntilIdle()
            vm.selectTab(FoodSearchViewModel.TAB_FAVORITES)
            assertEquals(listOf(testFood()), vm.searchResults.value)

            vm.resetSearch()

            assertEquals("", vm.query.value)
            assertEquals(emptyList(), vm.searchResults.value)
            assertEquals(emptyList(), vm.offResults.value)
            assertEquals(false, vm.isSearching.value)
            assertEquals(false, vm.isSearchingOff.value)
            assertEquals(FoodSearchViewModel.TAB_ALL, vm.selectedTab.value)
        }

    @Test
    fun resetSearchReloadsAllFoods() =
        runTest {
            val vm = viewModel()
            advanceUntilIdle()

            vm.resetSearch()
            advanceUntilIdle()

            coVerify(atLeast = 2) { foodRepo.fetchFoodsPaginated(any(), 0) }
        }

    private fun offProduct() =
        OpenFoodFactsProduct(
            id = "4000000000001",
            name = "OFF Apple Juice",
            brand = null,
            barcode = "4000000000001",
            imageUrl = null,
            nutriScore = null,
            novaGroup = null,
            servingSize = 100.0,
            servingUnit = "g",
            calories = 45.0,
            protein = 0.1,
            carbs = 10.0,
            fat = 0.0,
            fiber = 0.2,
            additives = null,
            ingredientsText = null,
        )

    @Test
    fun unknownOpenFoodFactsBarcodeSetsLocalizedMessage() =
        runTest {
            coEvery { foodRepo.findOrCreateByBarcode(any()) } returns null

            val vm = viewModel()
            vm.selectOffProduct(offProduct()) {}
            advanceUntilIdle()

            assertEquals(R.string.food_search_off_add_failed, vm.snackbarMessageRes.value)
            assertNull(vm.snackbarMessage.value)

            vm.clearSnackbarRes()
            assertNull(vm.snackbarMessageRes.value)
        }

    @Test
    fun failedOpenFoodFactsImportSetsLocalizedMessage() =
        runTest {
            coEvery { foodRepo.findOrCreateByBarcode(any()) } throws RuntimeException("boom")

            val vm = viewModel()
            vm.selectOffProduct(offProduct()) {}
            advanceUntilIdle()

            assertEquals(R.string.food_search_off_add_failed, vm.snackbarMessageRes.value)
            assertEquals(false, vm.isResolvingOff.value)
        }
}
