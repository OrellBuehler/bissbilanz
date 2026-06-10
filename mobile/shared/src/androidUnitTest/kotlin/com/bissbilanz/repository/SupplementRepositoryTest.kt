package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.api.generated.model.Supplement
import com.bissbilanz.api.generated.model.SupplementBackingFood
import com.bissbilanz.api.generated.model.SupplementCreate
import com.bissbilanz.api.generated.model.SupplementIngredientInput
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppMode
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
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
}
