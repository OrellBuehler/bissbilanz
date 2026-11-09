package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.api.generated.model.Supplement
import com.bissbilanz.api.generated.model.SupplementBackingFood
import com.bissbilanz.api.generated.model.SupplementCreate
import com.bissbilanz.api.generated.model.SupplementIngredientInput
import com.bissbilanz.api.generated.model.SupplementsListResponse
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppMode
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Local-mode supplements: the cache is the primary store, so a created/edited
 * supplement must keep its ingredients (including inline-created backing foods) —
 * they are what the migrator uploads on a later sign-in.
 */
class SupplementRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private lateinit var syncQueue: SyncQueue
    private lateinit var repository: SupplementRepository
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
        val appMode = appModeManager(AppMode.LOCAL)
        syncQueue = SyncQueue(cacheDb, json, appMode)
        repository = SupplementRepository(api, db, cacheDb, syncQueue, json, NoopErrorReporter(), appMode)
    }

    private fun inlineIngredient(
        name: String,
        ingredientsText: String,
        sortOrder: Int = 0,
    ) = SupplementIngredientInput(
        food =
            FoodCreate(
                name = name,
                servingSize = 1.0,
                servingUnit = ServingUnit.g,
                calories = 0.0,
                protein = 0.0,
                carbs = 0.0,
                fat = 0.0,
                fiber = 0.0,
                ingredientsText = ingredientsText,
            ),
        servings = 1.0,
        sortOrder = sortOrder,
    )

    @Test
    fun localCreateCachesInlineIngredients() =
        runTest {
            val created =
                repository.createSupplement(
                    SupplementCreate(
                        name = "Magnesium",
                        scheduleType = SupplementCreate.ScheduleType.daily,
                        ingredients = listOf(inlineIngredient("Magnesium", "400 mg")),
                    ),
                )

            val ingredient = created.ingredients.single()
            assertEquals("Magnesium", ingredient.food.name)
            assertEquals("400 mg", ingredient.food.ingredientsText)
            assertTrue(ingredient.foodId.startsWith("temp_"))

            // The cached row round-trips the ingredients, not an empty shell.
            val row = db.userDataDatabaseQueries.selectSupplementById(created.id).executeAsOneOrNull()
            assertNotNull(row)
            val decoded = json.decodeFromString<Supplement>(row.jsonData)
            assertEquals(
                "Magnesium",
                decoded.ingredients
                    .single()
                    .food.name,
            )
            assertEquals(
                "400 mg",
                decoded.ingredients
                    .single()
                    .food.ingredientsText,
            )
        }

    @Test
    fun localCreateResolvesFoodIdIngredientsFromLocalFoods() =
        runTest {
            val food =
                Food(
                    id = "temp_f1",
                    userId = "",
                    name = "Vitamin D Drops",
                    servingSize = 1.0,
                    servingUnit = Food.ServingUnit.ml,
                    calories = 9.0,
                    protein = 0.0,
                    carbs = 0.0,
                    fat = 1.0,
                    fiber = 0.0,
                    brand = null,
                    barcode = null,
                    isFavorite = false,
                    nutriScore = null,
                    novaGroup = null,
                    additives = null,
                    ingredientsText = null,
                    imageUrl = null,
                )
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

            val created =
                repository.createSupplement(
                    SupplementCreate(
                        name = "Vitamin D",
                        scheduleType = SupplementCreate.ScheduleType.daily,
                        ingredients = listOf(SupplementIngredientInput(foodId = "temp_f1", servings = 2.0, sortOrder = 0)),
                    ),
                )

            val ingredient = created.ingredients.single()
            assertEquals("temp_f1", ingredient.foodId)
            assertEquals(2.0, ingredient.servings)
            assertEquals("Vitamin D Drops", ingredient.food.name)
            assertEquals(SupplementBackingFood.Kind.food, ingredient.food.kind)
        }

    @Test
    fun localUpdateAppliesNewIngredientsToTheCache() =
        runTest {
            val created =
                repository.createSupplement(
                    SupplementCreate(
                        name = "Magnesium",
                        scheduleType = SupplementCreate.ScheduleType.daily,
                        ingredients = listOf(inlineIngredient("Magnesium", "400 mg")),
                    ),
                )

            repository.updateSupplement(
                created.id,
                SupplementCreate(
                    name = "Magnesium Complex",
                    scheduleType = SupplementCreate.ScheduleType.daily,
                    ingredients =
                        listOf(
                            inlineIngredient("Magnesium Citrate", "200 mg", sortOrder = 0),
                            inlineIngredient("Magnesium Glycinate", "200 mg", sortOrder = 1),
                        ),
                ),
            )

            val decoded =
                json.decodeFromString<Supplement>(
                    db.userDataDatabaseQueries
                        .selectSupplementById(created.id)
                        .executeAsOneOrNull()!!
                        .jsonData,
                )
            assertEquals("Magnesium Complex", decoded.name)
            assertEquals(
                listOf("Magnesium Citrate", "Magnesium Glycinate"),
                decoded.ingredients.map { it.food.name },
            )
        }

    private fun serverSupplement(
        id: String,
        name: String,
        sortOrder: Int = 0,
    ) = Supplement(
        id = id,
        userId = "u",
        name = name,
        scheduleType = Supplement.ScheduleType.daily,
        scheduleDays = null,
        scheduleStartDate = null,
        sortOrder = sortOrder,
        timeOfDay = null,
        ingredients = emptyList(),
    )

    private fun syncedRepository(): SupplementRepository {
        val appMode = appModeManager(AppMode.SYNCED)
        return SupplementRepository(api, db, cacheDb, SyncQueue(cacheDb, json, appMode), json, NoopErrorReporter(), appMode)
    }

    private fun cachedNames(): List<String> =
        db.userDataDatabaseQueries
            .selectAllSupplements()
            .executeAsList()
            .map { json.decodeFromString<Supplement>(it.jsonData).name }
            .sorted()

    @Test
    fun refreshKeepsAQueuedEditOverTheStaleServerCopy() =
        runTest {
            val synced = syncedRepository()
            coEvery { api.getSupplements() } returns listOf(serverSupplement("s1", "Old"))
            synced.refresh()
            synced.updateSupplement(
                "s1",
                SupplementCreate(name = "Edited", scheduleType = SupplementCreate.ScheduleType.daily, ingredients = emptyList()),
            )

            synced.refresh()

            assertEquals(listOf("Edited"), cachedNames())
        }

    @Test
    fun fullRefreshKeepsQueuedTempCreatesAndDropsStaleRows() =
        runTest {
            val synced = syncedRepository()
            coEvery { api.getAllSupplements() } returns
                SupplementsListResponse(listOf(serverSupplement("s1", "Server"), serverSupplement("gone", "Gone")))
            synced.getAllSupplements()
            synced.createSupplement(
                SupplementCreate(name = "Local", scheduleType = SupplementCreate.ScheduleType.daily, ingredients = emptyList()),
            )
            coEvery { api.getAllSupplements() } returns SupplementsListResponse(listOf(serverSupplement("s1", "Server")))

            synced.getAllSupplements()

            assertEquals(listOf("Local", "Server"), cachedNames())
        }

    @Test
    fun supplementsWithTheSameSortOrderListByName() =
        runTest {
            val queries = db.userDataDatabaseQueries
            listOf("s1" to "Zinc", "s2" to "Iron", "s3" to "Magnesium").forEach { (id, name) ->
                queries.insertSupplement(
                    id = id,
                    name = name,
                    isActive = 1L,
                    sortOrder = 0L,
                    jsonData = json.encodeToString(serverSupplement(id, name)),
                )
            }

            assertEquals(listOf("Iron", "Magnesium", "Zinc"), queries.selectActiveSupplements().executeAsList().map { it.name })
            assertEquals(listOf("Iron", "Magnesium", "Zinc"), queries.selectAllSupplements().executeAsList().map { it.name })
        }
}
