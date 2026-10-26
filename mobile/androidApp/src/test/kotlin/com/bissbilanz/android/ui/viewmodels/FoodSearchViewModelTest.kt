package com.bissbilanz.android.ui.viewmodels

import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.FoodsPage
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
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
        coEvery { foodRepo.fetchFoodsPage(any(), any(), any()) } returns FoodsPage(foods = emptyList(), total = 0)
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

            coVerify(atLeast = 2) { foodRepo.fetchFoodsPage(any(), 0, any()) }
        }

    @Test
    fun searchingStartsBeforeTheDebounceSoNoStaleEmptyStateFlashes() =
        runTest {
            coEvery { foodRepo.searchFoods("apple") } returns listOf(testFood())

            val vm = viewModel()
            vm.updateQuery("apple")

            assertEquals(true, vm.isSearching.value)
            advanceUntilIdle()
            assertEquals(false, vm.isSearching.value)
        }

    @Test
    fun refiningTheQueryKeepsThePreviousResultsUntilNewOnesArrive() =
        runTest {
            coEvery { foodRepo.searchFoods("ap") } returns listOf(testFood("a"))
            coEvery { foodRepo.searchFoods("app") } returns listOf(testFood("b"))
            coEvery { foodRepo.searchOpenFoodFacts("ap") } returns listOf(offProduct())

            val vm = viewModel()
            vm.updateQuery("ap")
            advanceUntilIdle()
            assertEquals(listOf("a"), vm.searchResults.value.map { it.id })
            assertEquals(1, vm.offResults.value.size)

            vm.updateQuery("app")

            assertEquals(true, vm.isSearching.value)
            assertEquals(listOf("a"), vm.searchResults.value.map { it.id })
            assertEquals(1, vm.offResults.value.size)

            advanceUntilIdle()

            assertEquals(listOf("b"), vm.searchResults.value.map { it.id })
        }

    @Test
    fun selectingTheAllTabDoesNotReloadALoadedList() =
        runTest {
            coEvery { foodRepo.fetchFoodsPage(any(), 0, any()) } returns
                FoodsPage(foods = listOf(testFood("a")), total = 1)

            val vm = viewModel()
            advanceUntilIdle()
            vm.selectTab(FoodSearchViewModel.TAB_RECENT)
            vm.selectTab(FoodSearchViewModel.TAB_ALL)
            advanceUntilIdle()

            coVerify(exactly = 1) { foodRepo.fetchFoodsPage(any(), 0, any()) }
            assertEquals(listOf("a"), vm.allFoods.value.map { it.id })
        }

    @Test
    fun refreshKeepsTheListUntilThePageArrivesAndThenSwapsIt() =
        runTest {
            coEvery { foodRepo.fetchFoodsPage(any(), 0, any()) } returns
                FoodsPage(foods = listOf(testFood("a")), total = 1)
            val vm = viewModel()
            advanceUntilIdle()

            val gate = CompletableDeferred<Unit>()
            coEvery { foodRepo.fetchFoodsPage(any(), 0, any()) } coAnswers {
                gate.await()
                FoodsPage(foods = listOf(testFood("b"), testFood("a")), total = 2)
            }
            vm.refresh()

            assertEquals(listOf("a"), vm.allFoods.value.map { it.id })
            gate.complete(Unit)
            advanceUntilIdle()

            assertEquals(listOf("b", "a"), vm.allFoods.value.map { it.id })
            assertEquals(false, vm.isLoadingMore.value)
        }

    @Test
    fun aFailedRefreshKeepsTheListAndReportsTheFailure() =
        runTest {
            coEvery { foodRepo.fetchFoodsPage(any(), 0, any()) } returns
                FoodsPage(foods = listOf(testFood("a")), total = 1)
            val vm = viewModel()
            advanceUntilIdle()

            coEvery { foodRepo.fetchFoodsPage(any(), 0, any()) } throws RuntimeException("boom")
            vm.refresh()
            advanceUntilIdle()

            assertEquals(listOf("a"), vm.allFoods.value.map { it.id })
            assertEquals(UiMessage(R.string.food_search_load_failed), vm.snackbarMessage.value)
        }

    @Test
    fun aFoodRepeatedOnTheNextPageIsListedOnce() =
        runTest {
            coEvery { foodRepo.fetchFoodsPage(any(), 0, any()) } returns
                FoodsPage(foods = listOf(testFood("a"), testFood("b")), total = 4)
            coEvery { foodRepo.fetchFoodsPage(any(), 2, any()) } returns
                FoodsPage(foods = listOf(testFood("b"), testFood("c")), total = 4)

            val vm = viewModel()
            advanceUntilIdle()
            vm.loadMoreFoods()
            advanceUntilIdle()

            assertEquals(listOf("a", "b", "c"), vm.allFoods.value.map { it.id })
        }

    @Test
    fun togglingAFavoriteUpdatesTheListInPlaceWithoutReloading() =
        runTest {
            coEvery { foodRepo.fetchFoodsPage(any(), 0, any()) } returns
                FoodsPage(foods = listOf(testFood("a"), testFood("b")), total = 2)

            val vm = viewModel()
            advanceUntilIdle()
            vm.toggleFavorite(vm.allFoods.value.first())
            advanceUntilIdle()

            assertEquals(listOf(true, false), vm.allFoods.value.map { it.isFavorite })
            coVerify(exactly = 1) { foodRepo.toggleFavorite("a", true) }
            coVerify(exactly = 1) { foodRepo.fetchFoodsPage(any(), 0, any()) }

            vm.toggleFavorite(vm.allFoods.value.first())
            advanceUntilIdle()

            coVerify(exactly = 1) { foodRepo.toggleFavorite("a", false) }
            assertEquals(
                false,
                vm.allFoods.value
                    .first()
                    .isFavorite,
            )
        }

    @Test
    fun aCacheFallbackMidListRestartsTheListFromTheCache() =
        runTest {
            coEvery { foodRepo.fetchFoodsPage(any(), 0, false) } returns
                FoodsPage(foods = listOf(testFood("a"), testFood("b")), total = 4)
            coEvery { foodRepo.fetchFoodsPage(any(), 2, false) } returns
                FoodsPage(foods = listOf(testFood("x")), total = 3, fromCache = true)
            coEvery { foodRepo.fetchFoodsPage(any(), 0, true) } returns
                FoodsPage(foods = listOf(testFood("c"), testFood("d")), total = 3, fromCache = true)

            val vm = viewModel()
            advanceUntilIdle()
            vm.loadMoreFoods()
            advanceUntilIdle()

            assertEquals(listOf("c", "d"), vm.allFoods.value.map { it.id })
        }

    @Test
    fun aSecondFavoriteTapWhileTheFirstIsRunningIsIgnored() =
        runTest {
            val gate = CompletableDeferred<Unit>()
            coEvery { foodRepo.toggleFavorite(any(), any()) } coAnswers {
                gate.await()
                null
            }

            val vm = viewModel()
            vm.toggleFavorite(testFood("a"))
            vm.toggleFavorite(testFood("a"))
            gate.complete(Unit)
            advanceUntilIdle()

            coVerify(exactly = 1) { foodRepo.toggleFavorite("a", true) }
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

            assertEquals(UiMessage(R.string.food_search_off_add_failed), vm.snackbarMessage.value)

            vm.clearSnackbar()
            assertNull(vm.snackbarMessage.value)
        }

    @Test
    fun failedOpenFoodFactsImportSetsLocalizedMessage() =
        runTest {
            coEvery { foodRepo.findOrCreateByBarcode(any()) } throws RuntimeException("boom")

            val vm = viewModel()
            vm.selectOffProduct(offProduct()) {}
            advanceUntilIdle()

            assertEquals(UiMessage(R.string.food_search_off_add_failed), vm.snackbarMessage.value)
            assertEquals(false, vm.isResolvingOff.value)
        }
}
