package com.bissbilanz.android.widget

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.model.Entry
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.util.mealTypes
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertIs

class AssistantFoodLoggerTest {
    private val foodRepository: FoodRepository = mockk()
    private val entryRepository: EntryRepository = mockk()
    private val preferencesRepository: PreferencesRepository = mockk()
    private val logger = AssistantFoodLogger(foodRepository, entryRepository, preferencesRepository)

    private val food =
        Food(
            id = "food-1",
            userId = "user-1",
            name = "Banana",
            brand = null,
            servingSize = 100.0,
            servingUnit = Food.ServingUnit.g,
            calories = 90.0,
            protein = 1.1,
            carbs = 23.0,
            fat = 0.3,
            fiber = 2.6,
            barcode = null,
            nutriScore = null,
            novaGroup = null,
            additives = null,
            ingredientsText = null,
            imageUrl = null,
        )

    @Test
    fun logByIdCreatesAnEntryForTheResolvedFood() =
        runTest {
            every { foodRepository.getFoodCached("food-1") } returns food
            every { preferencesRepository.preferences() } returns flowOf(null)
            val createdEntry = mockk<Entry>()
            coEvery { entryRepository.createEntry(any(), food = food) } returns createdEntry

            val result = logger.log(foodId = "food-1", foodName = null)

            val logged = assertIs<AssistantFoodLogger.Result.Logged>(result)
            assertEquals(food, logged.food)
            assertEquals(createdEntry, logged.entry)
            coVerify {
                entryRepository.createEntry(
                    match { it.foodId == "food-1" && it.servings == 1.0 },
                    food = food,
                )
            }
        }

    @Test
    fun logByNameResolvesThroughTheLocalRepository() =
        runTest {
            every { foodRepository.getFoodCached(any()) } returns null
            every { foodRepository.resolveByName("banana") } returns food
            every { preferencesRepository.preferences() } returns flowOf(null)
            coEvery { entryRepository.createEntry(any(), food = food) } returns mockk()

            val result = logger.log(foodId = null, foodName = "banana")

            assertIs<AssistantFoodLogger.Result.Logged>(result)
        }

    @Test
    fun logFallsBackToTimeOfDayWhenNoFavoriteMealTimeframeMatches() =
        runTest {
            every { foodRepository.getFoodCached("food-1") } returns food
            val prefs =
                mockk<Preferences> {
                    every { favoriteMealAssignmentMode } returns "auto"
                    every { favoriteMealTimeframes } returns emptyList()
                }
            every { preferencesRepository.preferences() } returns flowOf(prefs)
            val entrySlot = slot<EntryCreate>()
            coEvery { entryRepository.createEntry(capture(entrySlot), food = food) } returns mockk()

            val result = logger.log(foodId = "food-1", foodName = null) as AssistantFoodLogger.Result.Logged

            // No timeframe matches "auto" mode with an empty list, so the time-of-day
            // fallback must have picked a real meal type rather than leaving it null.
            assertContains(com.bissbilanz.util.mealTypes, result.meal)
            assertEquals(result.meal, entrySlot.captured.mealType)
        }

    @Test
    fun logReturnsNoMatchWhenNothingResolves() =
        runTest {
            every { foodRepository.getFoodCached(any()) } returns null
            every { foodRepository.resolveByName("nonexistent") } returns null

            val result = logger.log(foodId = null, foodName = "nonexistent")

            val noMatch = assertIs<AssistantFoodLogger.Result.NoMatch>(result)
            assertEquals("nonexistent", noMatch.query)
            coVerify(exactly = 0) { entryRepository.createEntry(any(), any(), any()) }
        }

    @Test
    fun logPrefersFoodIdOverFoodNameWhenBothArePresent() =
        runTest {
            every { foodRepository.getFoodCached("food-1") } returns food
            every { preferencesRepository.preferences() } returns flowOf(null)
            coEvery { entryRepository.createEntry(any(), food = food) } returns mockk()

            logger.log(foodId = "food-1", foodName = "some other name")

            coVerify(exactly = 0) { foodRepository.resolveByName(any()) }
        }
}
