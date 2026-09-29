package com.bissbilanz.repository

import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.OpenFoodFactsClient
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodUsageRecipe
import com.bissbilanz.api.generated.model.FoodUsageResponse
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeIngredientInput
import com.bissbilanz.api.generated.model.RecipeUsageResponse
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.api.generated.model.UsageEntry
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppMode
import com.bissbilanz.model.Entry
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The blocked-delete rules and where-used lists, in Local mode (computed from the local
 * cache, no server) and Synced mode (parsed from the server's 409 / usage endpoints).
 */
class WhereUsedTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private val json = Json { ignoreUnknownKeys = true }

    private fun foodRepo(mode: AppMode?): FoodRepository {
        val appMode = appModeManager(mode)
        return FoodRepository(
            api,
            db,
            cacheDb,
            SyncQueue(cacheDb, json, appMode),
            json,
            NoopErrorReporter(),
            appMode,
            mockk<OpenFoodFactsClient>(relaxed = true),
            mockk<ConnectivityProvider>(relaxed = true),
            Dispatchers.Unconfined,
        )
    }

    private fun recipeRepo(mode: AppMode?): RecipeRepository {
        val appMode = appModeManager(mode)
        return RecipeRepository(api, db, cacheDb, SyncQueue(cacheDb, json, appMode), json, NoopErrorReporter(), appMode)
    }

    @BeforeTest
    fun setup() {
        api = mockk()
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
    }

    private fun seedFood(id: String): Food {
        val food = TestFixtures.food(id = id, name = "Food $id")
        db.userDataDatabaseQueries.insertFood(
            id = food.id,
            name = food.name,
            brand = null,
            calories = food.calories,
            protein = food.protein,
            carbs = food.carbs,
            fat = food.fat,
            fiber = food.fiber,
            isFavorite = 0L,
            barcode = null,
            jsonData = json.encodeToString(food),
        )
        return food
    }

    private suspend fun createRecipe(
        repo: RecipeRepository,
        name: String,
        vararg foodIds: String,
    ): String =
        repo
            .createRecipe(
                RecipeCreate(
                    name = name,
                    totalServings = 2.0,
                    ingredients = foodIds.map { RecipeIngredientInput(it, 100.0, ServingUnit.g) },
                ),
            ).id

    private fun seedEntry(
        id: String,
        date: String,
        foodId: String? = null,
        recipeId: String? = null,
        eatenAt: String? = null,
        mealType: String = "Lunch",
    ) {
        val entry =
            Entry(id = id, foodId = foodId, recipeId = recipeId, date = date, mealType = mealType, servings = 1.5, eatenAt = eatenAt)
        db.userDataDatabaseQueries.insertEntry(
            id = id,
            date = date,
            mealType = mealType,
            servings = entry.servings,
            foodId = foodId,
            recipeId = recipeId,
            foodName = null,
            calories = 0.0,
            protein = 0.0,
            carbs = 0.0,
            fat = 0.0,
            fiber = 0.0,
            jsonData = json.encodeToString(entry),
        )
    }

    private fun seedSupplement(
        id: String,
        name: String,
        foodId: String,
    ) {
        db.userDataDatabaseQueries.insertSupplement(
            id = id,
            name = name,
            isActive = 1L,
            sortOrder = 0L,
            jsonData =
                """{"id":"$id","userId":"","name":"$name","scheduleType":"daily","scheduleDays":null,"scheduleStartDate":null,
                |"isActive":true,"sortOrder":0,"timeOfDay":null,"ingredients":[{"id":"i-$id","supplementId":"$id","foodId":"$foodId",
                |"servings":1.0,"sortOrder":0,"food":{"id":"$foodId","name":"x","brand":null,"kind":"supplement","servingSize":1.0,
                |"servingUnit":"g","calories":0.0,"protein":0.0,"carbs":0.0,"fat":0.0,"fiber":0.0}}]}
                """.trimMargin().replace("\n", ""),
        )
    }

    @Test
    fun localFoodWithNoReferencesIsDeleted() =
        runTest {
            seedFood("f1")

            assertEquals(DeleteOutcome.Deleted, foodRepo(AppMode.LOCAL).deleteFoodChecked("f1"))
            assertNull(db.userDataDatabaseQueries.selectFoodById("f1").executeAsOneOrNull())
        }

    @Test
    fun localLastIngredientIsBlockedAndForceIsRefused() =
        runTest {
            val recipes = recipeRepo(AppMode.LOCAL)
            val foods = foodRepo(AppMode.LOCAL)
            seedFood("only")
            val recipeId = createRecipe(recipes, "Solo", "only")

            val outcome = foods.deleteFoodChecked("only")

            assertIs<DeleteOutcome.Blocked>(outcome)
            assertEquals(listOf(recipeId), outcome.lastIngredientRecipes.map { it.id })
            assertTrue(outcome.forceUnavailable)
            assertFailsWith<IllegalStateException> { foods.forceDeleteFood("only") }
            assertNotNull(db.userDataDatabaseQueries.selectFoodById("only").executeAsOneOrNull())
        }

    @Test
    fun localForceDeleteRemovesTheFoodFromRecipesThatKeepOtherIngredients() =
        runTest {
            val recipes = recipeRepo(AppMode.LOCAL)
            val foods = foodRepo(AppMode.LOCAL)
            seedFood("extra")
            seedFood("base")
            val recipeId = createRecipe(recipes, "Base plus extra", "base", "extra")
            seedEntry("e1", "2026-05-01", foodId = "extra")

            val outcome = foods.deleteFoodChecked("extra")

            assertIs<DeleteOutcome.Blocked>(outcome)
            assertEquals(1, outcome.entryCount)
            assertEquals(1, outcome.recipeCount)
            assertTrue(outcome.lastIngredientRecipes.isEmpty())
            assertTrue(!outcome.forceUnavailable)

            foods.forceDeleteFood("extra")

            assertNull(db.userDataDatabaseQueries.selectFoodById("extra").executeAsOneOrNull())
            val recipe = recipes.getRecipeCached(recipeId)
            assertEquals(listOf("base"), recipe?.ingredients?.map { it.foodId })
            assertEquals(listOf(0), recipe?.ingredients?.map { it.sortOrder })
        }

    @Test
    fun localSupplementIngredientBlocksAndForceIsUnavailable() =
        runTest {
            val foods = foodRepo(AppMode.LOCAL)
            seedFood("salt")
            seedSupplement("s1", "Electrolytes", "salt")

            val outcome = foods.deleteFoodChecked("salt")

            assertIs<DeleteOutcome.Blocked>(outcome)
            assertEquals(1, outcome.supplementIngredientCount)
            assertTrue(outcome.forceUnavailable)
        }

    @Test
    fun localFoodWhereUsedListsEntriesNewestFirstPlusRecipesAndSupplements() =
        runTest {
            val recipes = recipeRepo(AppMode.LOCAL)
            val foods = foodRepo(AppMode.LOCAL)
            seedFood("salt")
            seedFood("pepper")
            val solo = createRecipe(recipes, "Only salt", "salt")
            val shared = createRecipe(recipes, "Salt and pepper", "salt", "pepper")
            seedSupplement("s1", "Electrolytes", "salt")
            seedEntry("old", "2026-05-01", foodId = "salt")
            seedEntry("morning", "2026-05-03", foodId = "salt", eatenAt = "2026-05-03T08:00:00Z")
            seedEntry("evening", "2026-05-03", foodId = "salt", eatenAt = "2026-05-03T19:00:00Z")

            val usage = foods.whereUsed("salt")

            assertEquals(3, usage.totalEntries)
            assertEquals(listOf("evening", "morning", "old"), usage.entries.map { it.id })
            assertEquals(
                listOf(WhereUsedRef(solo, "Only salt", true), WhereUsedRef(shared, "Salt and pepper", false)),
                usage.recipes,
            )
            assertEquals(listOf(WhereUsedRef("s1", "Electrolytes")), usage.supplements)
        }

    @Test
    fun localRecipeWhereUsedListsItsEntriesNewestFirst() =
        runTest {
            val recipes = recipeRepo(AppMode.LOCAL)
            seedFood("oats")
            val recipeId = createRecipe(recipes, "Porridge", "oats")
            seedEntry("a", "2026-05-01", recipeId = recipeId)
            seedEntry("b", "2026-05-02", recipeId = recipeId)
            seedEntry("other", "2026-05-09", recipeId = "another-recipe")

            val usage = recipes.whereUsed(recipeId)
            val outcome = recipes.deleteRecipeChecked(recipeId)

            assertEquals(2, usage.totalEntries)
            assertEquals(listOf("b", "a"), usage.entries.map { it.id })
            assertEquals(DeleteOutcome.Blocked(entryCount = 2), outcome)
            assertNotNull(recipes.getRecipeCached(recipeId))
        }

    @Test
    fun syncedFoodConflictBodyCarriesLastIngredientRecipes() =
        runTest {
            val body =
                """{"error":"has_entries","entryCount":0,"ingredientCount":1,"recipeCount":1,""" +
                    """"lastIngredientRecipes":[{"id":"r1","name":"Porridge"}]}"""
            coEvery { api.deleteFood("f1", any(), any(), any()) } throws ApiException("409", 409, null, body)

            val outcome = foodRepo(null).deleteFoodChecked("f1")

            assertIs<DeleteOutcome.Blocked>(outcome)
            assertEquals(listOf(WhereUsedRef("r1", "Porridge", true)), outcome.lastIngredientRecipes)
            assertTrue(outcome.forceUnavailable)
        }

    @Test
    fun syncedWhereUsedMapsTheUsageEndpoints() =
        runTest {
            val entry = UsageEntry("e1", "2026-05-03", "Dinner", 2.0, "2026-05-03T18:30:00.000Z")
            coEvery { api.getRecipeUsage("r1") } returns RecipeUsageResponse(listOf(entry), 250)
            coEvery { api.getFoodUsage("f1") } returns
                FoodUsageResponse(listOf(entry), 1, listOf(FoodUsageRecipe("r1", "Porridge", true)), emptyList())

            val recipeUsage = recipeRepo(null).whereUsed("r1")
            val foodUsage = foodRepo(null).whereUsed("f1")

            assertEquals(250, recipeUsage.totalEntries)
            assertEquals(WhereUsedEntry("e1", "2026-05-03", "Dinner", 2.0, "2026-05-03T18:30:00.000Z"), recipeUsage.entries.single())
            assertEquals(listOf(WhereUsedRef("r1", "Porridge", true)), foodUsage.recipes)
        }
}
