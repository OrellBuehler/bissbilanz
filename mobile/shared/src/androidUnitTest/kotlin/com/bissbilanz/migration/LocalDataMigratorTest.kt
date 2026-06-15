package com.bissbilanz.migration

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.DayProperties
import com.bissbilanz.api.generated.model.EntryCreate
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.FoodRecent
import com.bissbilanz.api.generated.model.FoodsListResponse
import com.bissbilanz.api.generated.model.Goals
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeIngredient
import com.bissbilanz.api.generated.model.SleepEntry
import com.bissbilanz.api.generated.model.Supplement
import com.bissbilanz.api.generated.model.SupplementBackingFood
import com.bissbilanz.api.generated.model.SupplementCreate
import com.bissbilanz.api.generated.model.SupplementIngredient
import com.bissbilanz.api.generated.model.SupplementIngredientInput
import com.bissbilanz.api.generated.model.SupplementLog
import com.bissbilanz.api.generated.model.WeightEntry
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.cache.LocalDataWiper
import com.bissbilanz.mode.AppMode
import com.bissbilanz.model.Entry
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LocalDataMigratorTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private lateinit var appMode: com.bissbilanz.mode.AppModeManager
    private lateinit var syncQueue: SyncQueue
    private lateinit var migrator: LocalDataMigrator
    private val json = Json { ignoreUnknownKeys = true }

    private val queries get() = db.userDataDatabaseQueries
    private val cacheQueries get() = cacheDb.bissbilanzDatabaseQueries

    @BeforeTest
    fun setup() {
        api = mockk()
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
        appMode = appModeManager(AppMode.LOCAL)
        syncQueue = SyncQueue(cacheDb, json, appMode)
        migrator = migratorFor(db)
    }

    private fun migratorFor(userDb: UserDataDatabase) =
        LocalDataMigrator(
            userDb,
            cacheDb,
            api,
            json,
            appMode,
            syncQueue,
            NoopErrorReporter(),
            LocalDataWiper(userDb, cacheDb, syncQueue),
        )

    // -------------------------------------------------------------------------------
    // plan()
    // -------------------------------------------------------------------------------

    @Test
    fun planCountsLocalRows() {
        val apple = TestFixtures.food(id = "temp_food-a", name = "Apple")
        insertFood(apple)
        insertFood(TestFixtures.food(id = "temp_food-b", name = "Banana"))
        insertRecipe(recipeDetail("temp_recipe-1", foodId = "temp_food-a"))
        insertEntry(entry("temp_entry-1", foodId = "temp_food-a", food = apple))
        insertWeight(weightEntry("temp_w-1"))
        insertSleep(sleepEntry("temp_s-1"))
        insertSupplement(supplement("temp_supp-1", foodId = "temp_food-b"))
        insertSupplementLog("temp_supp-1")
        insertGoals()
        insertPreferences()
        insertDayProperties()

        val plan = migrator.plan()

        assertEquals(2, plan.foods)
        assertEquals(1, plan.recipes)
        assertEquals(1, plan.entries)
        assertEquals(1, plan.weights)
        assertEquals(1, plan.sleepEntries)
        assertEquals(1, plan.supplements)
        assertEquals(1, plan.supplementLogs)
        assertEquals(1, plan.dayProperties)
        assertTrue(plan.hasGoals)
        assertTrue(plan.hasPreferences)
        assertEquals(11, plan.total)
    }

    @Test
    fun planIsEmptyForEmptyCache() {
        val plan = migrator.plan()

        assertEquals(0, plan.total)
        assertFalse(plan.hasGoals)
        assertFalse(plan.hasPreferences)
    }

    // -------------------------------------------------------------------------------
    // serverHasData()
    // -------------------------------------------------------------------------------

    @Test
    fun serverHasDataIsTrueWhenAccountHasFoods() =
        runTest {
            coEvery { api.getFoodsPaginated(limit = 1, offset = 0) } returns
                FoodsListResponse(foods = listOf(TestFixtures.food()), total = 3)

            assertTrue(migrator.serverHasData())
            coVerify(exactly = 0) { api.getRecentFoods(any()) }
        }

    @Test
    fun serverHasDataIsTrueWhenAccountHasEntries() =
        runTest {
            coEvery { api.getFoodsPaginated(limit = 1, offset = 0) } returns
                FoodsListResponse(foods = emptyList(), total = 0)
            coEvery { api.getRecentFoods(limit = 1) } returns listOf(foodRecent("srv-food-9"))

            assertTrue(migrator.serverHasData())
        }

    @Test
    fun serverHasDataIsFalseForEmptyAccount() =
        runTest {
            coEvery { api.getFoodsPaginated(limit = 1, offset = 0) } returns
                FoodsListResponse(foods = emptyList(), total = 0)
            coEvery { api.getRecentFoods(limit = 1) } returns emptyList()

            assertFalse(migrator.serverHasData())
        }

    // -------------------------------------------------------------------------------
    // migrate(): full happy path
    // -------------------------------------------------------------------------------

    @Test
    fun migrateUploadsCacheInDependencyOrderAndRemapsIds() =
        runTest {
            val apple = TestFixtures.food(id = "temp_food-a", name = "Apple")
            val banana = TestFixtures.food(id = "temp_food-b", name = "Banana")
            insertFood(apple)
            insertFood(banana)
            val recipe = recipeDetail("temp_recipe-1", foodId = "temp_food-a")
            insertRecipe(recipe)
            insertEntry(entry("temp_entry-1", foodId = "temp_food-a", food = apple))
            insertEntry(entry("temp_entry-2", recipeId = "temp_recipe-1", recipe = recipe))
            insertWeight(weightEntry("temp_w-1"))
            insertSleep(sleepEntry("temp_s-1"))
            insertSupplement(supplement("temp_supp-1", foodId = "temp_food-b"))
            insertSupplementLog("temp_supp-1")
            insertGoals()
            insertPreferences()
            insertDayProperties()
            // Stale queue item that must be cleared before uploading the cache state.
            cacheQueries.insertSyncQueueItem("{}", 0L, null, null)

            val captures = stubHappyApi()

            migrator.migrate()

            assertEquals(MigrationState.Completed, migrator.state.value)
            assertEquals(AppMode.SYNCED, appMode.mode.value)
            assertEquals(0L, cacheQueries.countSyncQueue().executeAsOne())

            coVerifyOrder {
                api.createFood(any()) // Apple
                api.createFood(any()) // Banana
                api.createRecipe(any())
                api.createEntry(any())
                api.createEntry(any())
                api.createWeightEntry(any())
                api.createSleepEntry(any())
                api.createSupplement(any())
                api.logSupplement(any(), any())
                api.setGoals(any())
                api.updatePreferences(any())
                api.setDayProperties(any(), any())
            }

            // The recipe was uploaded with Apple's server id…
            assertEquals(
                listOf("srv-food-1"),
                captures.recipeCreates
                    .single()
                    .ingredients
                    .map { it.foodId },
            )
            // …the entries reference the server food/recipe ids…
            assertEquals("srv-food-1", captures.entryCreates[0].foodId)
            assertEquals("srv-recipe-1", captures.entryCreates[1].recipeId)
            // …the supplement references Banana's server id and its log the server supplement id.
            assertEquals(
                listOf("srv-food-2"),
                captures.supplementCreates
                    .single()
                    .ingredients
                    .map { it.foodId },
            )
            coVerify { api.logSupplement("srv-supp-1", "2024-01-15") }
            coVerify { api.setGoals(Goals(2000.0, 150.0, 250.0, 65.0, 30.0)) }
            coVerify { api.setDayProperties("2024-01-15", true) }

            // Local rows were re-keyed to the server ids.
            assertEquals(
                setOf("srv-food-1", "srv-food-2"),
                queries
                    .selectAllFoods()
                    .executeAsList()
                    .map { it.id }
                    .toSet(),
            )
            assertEquals(listOf("srv-recipe-1"), queries.selectAllRecipes().executeAsList().map { it.id })
            assertEquals(
                setOf("srv-entry-1", "srv-entry-2"),
                queries
                    .selectAllEntries()
                    .executeAsList()
                    .map { it.id }
                    .toSet(),
            )
            assertEquals(listOf("srv-weight-1"), queries.selectAllWeightEntries().executeAsList().map { it.id })
            assertEquals(listOf("srv-sleep-1"), queries.selectAllSleepEntries().executeAsList().map { it.id })
            assertEquals(listOf("srv-supp-1"), queries.selectAllSupplements().executeAsList().map { it.id })
            assertEquals(
                listOf("srv-supp-1-2024-01-15"),
                queries.selectAllSupplementLogs().executeAsList().map { it.id },
            )

            // The embedded jsonData was rewritten alongside the columns.
            val foodEntryRow = queries.selectAllEntries().executeAsList().first { it.foodId != null }
            val decoded = json.decodeFromString<Entry>(foodEntryRow.jsonData)
            assertEquals(foodEntryRow.id, decoded.id)
            assertEquals("srv-food-1", decoded.foodId)
        }

    // -------------------------------------------------------------------------------
    // migrate(): failure + resume
    // -------------------------------------------------------------------------------

    @Test
    fun migrateResumesAfterFailureUploadingOnlyRemainingTempRows() =
        runTest {
            val apple = TestFixtures.food(id = "temp_food-a", name = "Apple")
            insertFood(apple)
            val recipe = recipeDetail("temp_recipe-1", foodId = "temp_food-a")
            insertRecipe(recipe)
            insertEntry(entry("temp_entry-1", foodId = "temp_food-a", food = apple))
            insertEntry(entry("temp_entry-2", recipeId = "temp_recipe-1", recipe = recipe))

            stubHappyApi()
            coEvery { api.createEntry(any()) } returns
                serverEntry("srv-entry-1", foodId = "srv-food-1") andThenThrows
                RuntimeException("network down")

            migrator.migrate()

            val failed = migrator.state.value
            assertIs<MigrationState.Failed>(failed)
            assertEquals("network down", failed.message)
            assertEquals(AppMode.LOCAL, appMode.mode.value)
            // Partial progress is persisted: food and recipe already carry server ids…
            assertEquals(listOf("srv-food-1"), queries.selectAllFoods().executeAsList().map { it.id })
            assertEquals(listOf("srv-recipe-1"), queries.selectAllRecipes().executeAsList().map { it.id })
            // …the first entry was uploaded, the second is still local.
            val entryIds = queries.selectAllEntries().executeAsList().map { it.id }
            assertTrue("srv-entry-1" in entryIds)
            assertEquals(1, entryIds.count { it.startsWith("temp_") })

            // Second run: only the remaining temp entry is uploaded.
            val entryCreates = mutableListOf<EntryCreate>()
            coEvery { api.createEntry(capture(entryCreates)) } answers {
                serverEntry("srv-entry-2", recipeId = entryCreates.last().recipeId)
            }

            migrator.migrate()

            assertEquals(MigrationState.Completed, migrator.state.value)
            assertEquals(AppMode.SYNCED, appMode.mode.value)
            assertEquals("srv-recipe-1", entryCreates.single().recipeId)
            coVerify(exactly = 1) { api.createFood(any()) }
            coVerify(exactly = 1) { api.createRecipe(any()) }
        }

    @Test
    fun failedRunLeavesRekeyedRowsWithConsistentReferences() =
        runTest {
            // Stale rows from an earlier synced session (no temp_ prefix).
            val oldFood = TestFixtures.food(id = "old-food-1", name = "Apple")
            insertFood(oldFood)
            insertRecipe(recipeDetail("old-recipe-1", foodId = "old-food-1"))
            insertEntry(entry("old-entry-1", foodId = "old-food-1", food = oldFood))
            insertSupplement(supplement("old-supp-1", foodId = "old-food-1"))
            insertSupplementLog("old-supp-1")
            coEvery { api.createFood(any()) } throws RuntimeException("offline")

            migrator.migrate()

            assertIs<MigrationState.Failed>(migrator.state.value)
            assertEquals(AppMode.LOCAL, appMode.mode.value)

            // Everything was re-keyed to temp ids with consistent references.
            val foodId =
                queries
                    .selectAllFoods()
                    .executeAsList()
                    .single()
                    .id
            assertTrue(foodId.startsWith("temp_"))
            val entryRow = queries.selectAllEntries().executeAsList().single()
            assertTrue(entryRow.id.startsWith("temp_"))
            assertEquals(foodId, entryRow.foodId)
            assertEquals(foodId, json.decodeFromString<Entry>(entryRow.jsonData).foodId)
            val recipeRow = queries.selectAllRecipes().executeAsList().single()
            assertTrue(recipeRow.id.startsWith("temp_"))
            assertEquals(
                listOf(foodId),
                json.decodeFromString<RecipeDetail>(recipeRow.jsonData).ingredients.map { it.foodId },
            )
            val supplementRow = queries.selectAllSupplements().executeAsList().single()
            assertTrue(supplementRow.id.startsWith("temp_"))
            assertEquals(
                listOf(foodId),
                json.decodeFromString<Supplement>(supplementRow.jsonData).ingredients.map { it.foodId },
            )
            val logRow = queries.selectAllSupplementLogs().executeAsList().single()
            assertEquals(supplementRow.id, logRow.supplementId)
            assertEquals("${supplementRow.id}-2024-01-15", logRow.id)
        }

    @Test
    fun migrateRekeysAndUploadsRowsFromAnEarlierSyncedSession() =
        runTest {
            val oldFood = TestFixtures.food(id = "old-food-1", name = "Apple")
            insertFood(oldFood)
            insertRecipe(recipeDetail("old-recipe-1", foodId = "old-food-1"))
            insertEntry(entry("old-entry-1", foodId = "old-food-1", food = oldFood))
            insertSupplement(supplement("old-supp-1", foodId = "old-food-1"))
            insertSupplementLog("old-supp-1")

            val captures = stubHappyApi()

            migrator.migrate()

            assertEquals(MigrationState.Completed, migrator.state.value)
            assertEquals(AppMode.SYNCED, appMode.mode.value)
            coVerify(exactly = 1) { api.createFood(any()) }
            coVerify(exactly = 1) { api.createRecipe(any()) }
            coVerify(exactly = 1) { api.createEntry(any()) }
            coVerify(exactly = 1) { api.createSupplement(any()) }
            coVerify { api.logSupplement("srv-supp-1", "2024-01-15") }
            assertEquals(
                listOf("srv-food-1"),
                captures.recipeCreates
                    .single()
                    .ingredients
                    .map { it.foodId },
            )
            assertEquals("srv-food-1", captures.entryCreates.single().foodId)
            assertEquals(
                listOf("srv-food-1"),
                captures.supplementCreates
                    .single()
                    .ingredients
                    .map { it.foodId },
            )
        }

    // -------------------------------------------------------------------------------
    // discardLocalData()
    // -------------------------------------------------------------------------------

    @Test
    fun discardLocalDataWipesTablesAndFlipsMode() =
        runTest {
            val apple = TestFixtures.food(id = "temp_food-a", name = "Apple")
            insertFood(apple)
            insertRecipe(recipeDetail("temp_recipe-1", foodId = "temp_food-a"))
            insertEntry(entry("temp_entry-1", foodId = "temp_food-a", food = apple))
            insertWeight(weightEntry("temp_w-1"))
            insertSleep(sleepEntry("temp_s-1"))
            insertSupplement(supplement("temp_supp-1", foodId = "temp_food-a"))
            insertSupplementLog("temp_supp-1")
            insertGoals()
            insertPreferences()
            insertDayProperties()
            cacheQueries.insertSyncQueueItem("{}", 0L, null, null)

            migrator.discardLocalData()

            assertEquals(AppMode.SYNCED, appMode.mode.value)
            assertEquals(0, migrator.plan().total)
            assertTrue(queries.selectAllFoods().executeAsList().isEmpty())
            assertTrue(queries.selectAllEntries().executeAsList().isEmpty())
            assertTrue(queries.selectAllRecipes().executeAsList().isEmpty())
            assertTrue(queries.selectAllSupplements().executeAsList().isEmpty())
            assertTrue(queries.selectAllSupplementLogs().executeAsList().isEmpty())
            assertTrue(queries.selectAllWeightEntries().executeAsList().isEmpty())
            assertTrue(queries.selectAllSleepEntries().executeAsList().isEmpty())
            assertTrue(queries.selectAllDayProperties().executeAsList().isEmpty())
            assertEquals(null, queries.selectGoals().executeAsOneOrNull())
            assertEquals(null, queries.selectPreferences().executeAsOneOrNull())
            assertEquals(0L, cacheQueries.countSyncQueue().executeAsOne())
        }

    // -------------------------------------------------------------------------------
    // Locally created recipes/supplements (Local mode) carry their ingredients
    // -------------------------------------------------------------------------------

    @Test
    fun migrateUploadsLocallyCreatedRecipeAndSupplementWithIngredients() =
        runTest {
            // Create everything through the repositories, exactly like the Local-mode UI.
            val foodRepo =
                com.bissbilanz.repository.FoodRepository(
                    api,
                    db,
                    cacheDb,
                    syncQueue,
                    json,
                    NoopErrorReporter(),
                    appMode,
                    mockk(relaxed = true),
                    kotlinx.coroutines.Dispatchers.Unconfined,
                )
            val recipeRepo = com.bissbilanz.repository.RecipeRepository(api, db, cacheDb, syncQueue, json, NoopErrorReporter(), appMode)
            val supplementRepo =
                com.bissbilanz.repository.SupplementRepository(api, db, cacheDb, syncQueue, json, NoopErrorReporter(), appMode)

            val food =
                foodRepo.createFood(
                    FoodCreate(
                        name = "Rice",
                        servingSize = 100.0,
                        servingUnit = com.bissbilanz.api.generated.model.ServingUnit.g,
                        calories = 130.0,
                        protein = 2.7,
                        carbs = 28.0,
                        fat = 0.3,
                        fiber = 0.4,
                    ),
                )
            recipeRepo.createRecipe(
                RecipeCreate(
                    name = "Rice Bowl",
                    totalServings = 2.0,
                    ingredients =
                        listOf(
                            com.bissbilanz.api.generated.model
                                .RecipeIngredientInput(food.id, 200.0, com.bissbilanz.api.generated.model.ServingUnit.g),
                        ),
                ),
            )
            supplementRepo.createSupplement(
                SupplementCreate(
                    name = "Iron",
                    scheduleType = SupplementCreate.ScheduleType.daily,
                    ingredients =
                        listOf(
                            SupplementIngredientInput(
                                food =
                                    FoodCreate(
                                        name = "Iron",
                                        servingSize = 1.0,
                                        servingUnit = com.bissbilanz.api.generated.model.ServingUnit.g,
                                        calories = 0.0,
                                        protein = 0.0,
                                        carbs = 0.0,
                                        fat = 0.0,
                                        fiber = 0.0,
                                        ingredientsText = "14 mg",
                                    ),
                                servings = 1.0,
                                sortOrder = 0,
                            ),
                        ),
                ),
            )
            val captures = stubHappyApi()

            migrator.migrate()

            assertEquals(MigrationState.Completed, migrator.state.value)
            // The recipe create carried its ingredient, remapped to the server food id.
            val recipeCreate = captures.recipeCreates.single()
            assertEquals(listOf("srv-food-1"), recipeCreate.ingredients.map { it.foodId })
            assertEquals(listOf(200.0), recipeCreate.ingredients.map { it.quantity })
            // The supplement create rebuilt the inline backing food.
            val supplementIngredient =
                captures.supplementCreates
                    .single()
                    .ingredients
                    .single()
            assertEquals(null, supplementIngredient.foodId)
            assertEquals("Iron", supplementIngredient.food?.name)
            assertEquals("14 mg", supplementIngredient.food?.ingredientsText)
        }

    @Test
    fun locallyCreatedRecipeCarriesPerServingMacrosBeforeMigration() =
        runTest {
            val foodRepo =
                com.bissbilanz.repository.FoodRepository(
                    api,
                    db,
                    cacheDb,
                    syncQueue,
                    json,
                    NoopErrorReporter(),
                    appMode,
                    mockk(relaxed = true),
                    kotlinx.coroutines.Dispatchers.Unconfined,
                )
            val recipeRepo = com.bissbilanz.repository.RecipeRepository(api, db, cacheDb, syncQueue, json, NoopErrorReporter(), appMode)

            val food =
                foodRepo.createFood(
                    FoodCreate(
                        name = "Rice",
                        servingSize = 100.0,
                        servingUnit = com.bissbilanz.api.generated.model.ServingUnit.g,
                        calories = 130.0,
                        protein = 2.7,
                        carbs = 28.0,
                        fat = 0.3,
                        fiber = 0.4,
                    ),
                )
            val recipe =
                recipeRepo.createRecipe(
                    RecipeCreate(
                        name = "Rice Bowl",
                        totalServings = 2.0,
                        ingredients =
                            listOf(
                                com.bissbilanz.api.generated.model
                                    .RecipeIngredientInput(food.id, 200.0, com.bissbilanz.api.generated.model.ServingUnit.g),
                            ),
                    ),
                )

            // Server formula: SUM(macro * quantity / servingSize) / totalServings.
            assertEquals(130.0, recipe.calories)
            assertEquals(2.7, recipe.protein)
        }

    @Test
    fun migrateSkipsAndDropsIngredientLessRecipeAndSupplementInsteadOfBricking() =
        runTest {
            insertRecipe(
                RecipeDetail(
                    id = "temp_recipe-empty",
                    userId = "user-1",
                    name = "Shell",
                    totalServings = 1.0,
                    isFavorite = false,
                    imageUrl = null,
                    calories = 0.0,
                    protein = 0.0,
                    carbs = 0.0,
                    fat = 0.0,
                    fiber = 0.0,
                    ingredients = emptyList(),
                ),
            )
            insertSupplement(supplement("temp_supp-empty", foodId = "x").copy(ingredients = emptyList()))
            stubHappyApi()

            migrator.migrate()

            assertEquals(MigrationState.Completed, migrator.state.value)
            coVerify(exactly = 0) { api.createRecipe(any()) }
            coVerify(exactly = 0) { api.createSupplement(any()) }
            assertTrue(queries.selectAllRecipes().executeAsList().isEmpty())
            assertTrue(queries.selectAllSupplements().executeAsList().isEmpty())
        }

    // -------------------------------------------------------------------------------
    // resetNormalization()
    // -------------------------------------------------------------------------------

    @Test
    fun resetNormalizationClearsTheMarker() {
        cacheQueries.upsertSyncMeta("migration_normalized", "2024-01-15T00:00:00Z")

        migrator.resetNormalization()

        assertNull(cacheQueries.selectSyncMeta("migration_normalized").executeAsOneOrNull())
    }

    // -------------------------------------------------------------------------------
    // Failure containment
    // -------------------------------------------------------------------------------

    @Test
    fun migrateFailsGracefullyWhenPlanThrows() =
        runTest {
            val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
            UserDataDatabase.Schema.create(driver)
            driver.execute(null, "DROP TABLE CachedFood", 0)
            val brokenMigrator = migratorFor(UserDataDatabase(driver))

            // Must not throw — a DB error surfaces as Failed state, not a crash.
            brokenMigrator.migrate()

            assertIs<MigrationState.Failed>(brokenMigrator.state.value)
        }

    // -------------------------------------------------------------------------------
    // API stubbing
    // -------------------------------------------------------------------------------

    private class ApiCaptures(
        val foodCreates: MutableList<FoodCreate>,
        val recipeCreates: MutableList<RecipeCreate>,
        val entryCreates: MutableList<EntryCreate>,
        val supplementCreates: MutableList<SupplementCreate>,
    )

    /** Stubs every create endpoint to succeed with `srv-…` ids, capturing the payloads. */
    private fun stubHappyApi(): ApiCaptures {
        val foodCreates = mutableListOf<FoodCreate>()
        val recipeCreates = mutableListOf<RecipeCreate>()
        val entryCreates = mutableListOf<EntryCreate>()
        val supplementCreates = mutableListOf<SupplementCreate>()
        coEvery { api.createFood(capture(foodCreates)) } answers {
            TestFixtures.food(id = "srv-food-${foodCreates.size}", name = foodCreates.last().name)
        }
        coEvery { api.createRecipe(capture(recipeCreates)) } answers {
            recipeDetail(
                id = "srv-recipe-${recipeCreates.size}",
                foodId =
                    recipeCreates
                        .last()
                        .ingredients
                        .firstOrNull()
                        ?.foodId ?: "srv-food-1",
                name = recipeCreates.last().name,
            )
        }
        coEvery { api.createEntry(capture(entryCreates)) } answers {
            serverEntry(
                id = "srv-entry-${entryCreates.size}",
                foodId = entryCreates.last().foodId,
                recipeId = entryCreates.last().recipeId,
            )
        }
        coEvery { api.createWeightEntry(any()) } returns weightEntry("srv-weight-1")
        coEvery { api.createSleepEntry(any()) } returns sleepEntry("srv-sleep-1")
        coEvery { api.createSupplement(capture(supplementCreates)) } answers {
            supplement(
                id = "srv-supp-${supplementCreates.size}",
                foodId =
                    supplementCreates
                        .last()
                        .ingredients
                        .firstOrNull()
                        ?.foodId ?: "srv-food-1",
            )
        }
        coEvery { api.logSupplement(any(), any()) } answers {
            SupplementLog(
                supplementId = firstArg(),
                date = secondArg() ?: "2024-01-15",
                takenAt = "2024-01-15T08:00:00Z",
                entryIds = emptyList(),
            )
        }
        coEvery { api.setGoals(any()) } answers { firstArg() }
        coEvery { api.updatePreferences(any()) } returns preferences()
        coEvery { api.setDayProperties(any(), any()) } answers { DayProperties(firstArg(), secondArg()) }
        return ApiCaptures(foodCreates, recipeCreates, entryCreates, supplementCreates)
    }

    // -------------------------------------------------------------------------------
    // Fixtures + row insertion (mirrors how the repositories cache rows)
    // -------------------------------------------------------------------------------

    private fun insertFood(food: Food) {
        queries.insertFood(
            id = food.id,
            name = food.name,
            brand = food.brand,
            calories = food.calories,
            protein = food.protein,
            carbs = food.carbs,
            fat = food.fat,
            fiber = food.fiber,
            isFavorite = if (food.isFavorite) 1L else 0L,
            barcode = food.barcode,
            jsonData = json.encodeToString(food),
        )
    }

    private fun recipeDetail(
        id: String,
        foodId: String,
        name: String = "Recipe",
    ) = RecipeDetail(
        id = id,
        userId = "user-1",
        name = name,
        totalServings = 4.0,
        isFavorite = false,
        imageUrl = null,
        calories = 100.0,
        protein = 10.0,
        carbs = 12.0,
        fat = 5.0,
        fiber = 2.0,
        ingredients =
            listOf(
                RecipeIngredient(
                    foodId = foodId,
                    quantity = 100.0,
                    servingUnit = RecipeIngredient.ServingUnit.g,
                    sortOrder = 0,
                ),
            ),
    )

    private fun insertRecipe(recipe: RecipeDetail) {
        queries.insertRecipe(
            id = recipe.id,
            name = recipe.name,
            totalServings = recipe.totalServings,
            isFavorite = if (recipe.isFavorite) 1L else 0L,
            calories = recipe.calories,
            protein = recipe.protein,
            carbs = recipe.carbs,
            fat = recipe.fat,
            fiber = recipe.fiber,
            jsonData = json.encodeToString(recipe),
        )
    }

    private fun entry(
        id: String,
        foodId: String? = null,
        recipeId: String? = null,
        food: Food? = null,
        recipe: RecipeDetail? = null,
    ) = Entry(
        id = id,
        foodId = foodId,
        recipeId = recipeId,
        date = "2024-01-15",
        mealType = "lunch",
        servings = 1.0,
        food = food,
        recipe = recipe,
    )

    private fun serverEntry(
        id: String,
        foodId: String? = null,
        recipeId: String? = null,
    ) = Entry(
        id = id,
        userId = "user-1",
        foodId = foodId,
        recipeId = recipeId,
        date = "2024-01-15",
        mealType = "lunch",
        servings = 1.0,
        createdAt = "2024-01-15T12:00:00Z",
        updatedAt = "2024-01-15T12:00:00Z",
    )

    private fun insertEntry(entry: Entry) {
        queries.insertEntry(
            id = entry.id,
            date = entry.date,
            mealType = entry.mealType,
            servings = entry.servings,
            foodId = entry.foodId,
            recipeId = entry.recipeId,
            foodName = entry.food?.name ?: entry.recipe?.name,
            calories = 0.0,
            protein = 0.0,
            carbs = 0.0,
            fat = 0.0,
            fiber = 0.0,
            jsonData = json.encodeToString(entry),
        )
    }

    private fun weightEntry(id: String) =
        WeightEntry(
            id = id,
            userId = "user-1",
            weightKg = 80.0,
            entryDate = "2024-01-15",
            notes = null,
            loggedAt = "2024-01-15T08:00:00Z",
        )

    private fun insertWeight(weight: WeightEntry) {
        queries.insertWeightEntry(
            id = weight.id,
            entryDate = weight.entryDate,
            weightKg = weight.weightKg,
            loggedAt = weight.loggedAt,
            jsonData = json.encodeToString(weight),
        )
    }

    private fun sleepEntry(id: String) =
        SleepEntry(
            id = id,
            userId = "user-1",
            entryDate = "2024-01-15",
            durationMinutes = 480,
            quality = 4,
            bedtime = null,
            wakeTime = null,
            wakeUps = null,
            sleepLatencyMinutes = null,
            deepSleepMinutes = null,
            lightSleepMinutes = null,
            remSleepMinutes = null,
            source = null,
            notes = null,
            loggedAt = "2024-01-15T08:00:00Z",
        )

    private fun insertSleep(sleep: SleepEntry) {
        queries.insertSleepEntry(
            id = sleep.id,
            entryDate = sleep.entryDate,
            durationMinutes = sleep.durationMinutes.toLong(),
            quality = sleep.quality.toLong(),
            loggedAt = sleep.loggedAt,
            jsonData = json.encodeToString(sleep),
        )
    }

    private fun supplement(
        id: String,
        foodId: String,
    ) = Supplement(
        id = id,
        userId = "user-1",
        name = "Supp",
        scheduleType = Supplement.ScheduleType.daily,
        scheduleDays = null,
        scheduleStartDate = null,
        isActive = true,
        sortOrder = 0,
        timeOfDay = null,
        ingredients =
            listOf(
                SupplementIngredient(
                    id = "si-1",
                    supplementId = id,
                    foodId = foodId,
                    servings = 1.0,
                    sortOrder = 0,
                    food =
                        SupplementBackingFood(
                            id = foodId,
                            name = "Backing",
                            brand = null,
                            kind = SupplementBackingFood.Kind.supplement,
                            servingSize = 1.0,
                            servingUnit = "g",
                            calories = 0.0,
                            protein = 0.0,
                            carbs = 0.0,
                            fat = 0.0,
                            fiber = 0.0,
                        ),
                ),
            ),
    )

    private fun insertSupplement(supplement: Supplement) {
        queries.insertSupplement(
            id = supplement.id,
            name = supplement.name,
            isActive = if (supplement.isActive) 1L else 0L,
            sortOrder = supplement.sortOrder.toLong(),
            jsonData = json.encodeToString(supplement),
        )
    }

    private fun insertSupplementLog(
        supplementId: String,
        date: String = "2024-01-15",
    ) {
        queries.insertSupplementLog(
            id = "$supplementId-$date",
            supplementId = supplementId,
            date = date,
            takenAt = "${date}T08:00:00Z",
        )
    }

    private fun insertGoals() {
        queries.insertGoals(2000.0, 150.0, 250.0, 65.0, 30.0)
    }

    private fun preferences() =
        Preferences(
            showChartWidget = true,
            showFavoritesWidget = true,
            showSupplementsWidget = false,
            showWeightWidget = true,
            showMealBreakdownWidget = true,
            showTopFoodsWidget = false,
            showSleepWidget = true,
            widgetOrder = listOf("chart"),
            mealOrder = listOf("breakfast", "lunch"),
            startPage = "dashboard",
            favoriteTapAction = "log",
            favoriteMealAssignmentMode = "auto",
            visibleNutrients = listOf("calories"),
            locale = "en",
            favoriteMealTimeframes = emptyList(),
        )

    private fun insertPreferences() {
        queries.insertPreferences(json.encodeToString(preferences()))
    }

    private fun insertDayProperties(date: String = "2024-01-15") {
        queries.upsertDayProperties(date, 1L)
    }

    private fun foodRecent(id: String) =
        FoodRecent(
            id = id,
            userId = "user-1",
            name = "Recent Food",
            brand = null,
            servingSize = 100.0,
            servingUnit = FoodRecent.ServingUnit.g,
            calories = 100.0,
            protein = 10.0,
            carbs = 10.0,
            fat = 5.0,
            fiber = 1.0,
            barcode = null,
            isFavorite = false,
            imageUrl = null,
            lastServings = 1.0,
        )
}
