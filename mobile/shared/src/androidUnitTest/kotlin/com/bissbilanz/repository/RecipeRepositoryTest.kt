package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeIngredientInput
import com.bissbilanz.api.generated.model.RecipeUpdate
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppMode
import com.bissbilanz.sync.SyncOperation
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
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Local-mode recipes: the cache is the primary store, so a created/edited recipe must
 * keep its ingredients and carry per-serving macros computed the same way the server
 * computes them (sum of food.macro * quantity / food.servingSize, / totalServings).
 */
class RecipeRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private lateinit var syncQueue: SyncQueue
    private lateinit var repository: RecipeRepository
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
        val appMode = appModeManager(AppMode.LOCAL)
        syncQueue = SyncQueue(cacheDb, json, appMode)
        repository = RecipeRepository(api, db, cacheDb, syncQueue, json, NoopErrorReporter(), appMode)
    }

    private fun insertLocalFood(
        id: String,
        calories: Double = 130.0,
        protein: Double = 2.7,
        carbs: Double = 28.0,
        fat: Double = 0.3,
        fiber: Double = 0.4,
        servingSize: Double = 100.0,
    ) {
        val food =
            Food(
                id = id,
                userId = "",
                name = "Rice",
                servingSize = servingSize,
                servingUnit = Food.ServingUnit.g,
                calories = calories,
                protein = protein,
                carbs = carbs,
                fat = fat,
                fiber = fiber,
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
    }

    @Test
    fun localCreateCachesIngredientsAndPerServingMacros() =
        runTest {
            insertLocalFood("temp_f1")

            val created =
                repository.createRecipe(
                    RecipeCreate(
                        name = "Rice Bowl",
                        totalServings = 4.0,
                        ingredients = listOf(RecipeIngredientInput("temp_f1", 200.0, ServingUnit.g)),
                    ),
                )

            // 130 kcal/100g * 200g = 260 kcal total, / 4 servings = 65 per serving.
            assertEquals(65.0, created.calories)
            assertEquals(1.35, created.protein)
            assertEquals(14.0, created.carbs)
            assertEquals(0.15, created.fat)
            assertEquals(0.2, created.fiber)
            assertEquals(listOf("temp_f1"), created.ingredients.map { it.foodId })

            // The cached row round-trips the full detail, not an ingredient-less shell.
            val row = db.userDataDatabaseQueries.selectRecipeById(created.id).executeAsOneOrNull()
            assertNotNull(row)
            assertEquals(65.0, row.calories)
            val decoded = json.decodeFromString<RecipeDetail>(row.jsonData)
            assertEquals(listOf("temp_f1"), decoded.ingredients.map { it.foodId })
            assertEquals(listOf(200.0), decoded.ingredients.map { it.quantity })
            assertEquals(65.0, decoded.calories)
        }

    @Test
    fun localUpdateAppliesIngredientsAndRecomputesMacros() =
        runTest {
            insertLocalFood("temp_f1")
            insertLocalFood("temp_f2", calories = 400.0, protein = 10.0, carbs = 50.0, fat = 20.0, fiber = 5.0)
            val created =
                repository.createRecipe(
                    RecipeCreate(
                        name = "Rice Bowl",
                        totalServings = 4.0,
                        ingredients = listOf(RecipeIngredientInput("temp_f1", 200.0, ServingUnit.g)),
                    ),
                )

            val updated =
                repository.updateRecipe(
                    created.id,
                    RecipeUpdate(
                        totalServings = 2.0,
                        ingredients = listOf(RecipeIngredientInput("temp_f2", 100.0, ServingUnit.g)),
                    ),
                )

            // 400 kcal/100g * 100g = 400 total, / 2 servings = 200 per serving.
            assertEquals(200.0, updated.calories)
            assertEquals(5.0, updated.protein)
            assertEquals(listOf("temp_f2"), updated.ingredients.map { it.foodId })

            val decoded =
                json.decodeFromString<RecipeDetail>(
                    db.userDataDatabaseQueries
                        .selectRecipeById(created.id)
                        .executeAsOneOrNull()!!
                        .jsonData,
                )
            assertEquals(listOf("temp_f2"), decoded.ingredients.map { it.foodId })
            assertEquals(200.0, decoded.calories)
            assertEquals(2.0, decoded.totalServings)
        }

    @Test
    fun localUpdateWithoutIngredientsKeepsThemAndRescalesByServings() =
        runTest {
            insertLocalFood("temp_f1")
            val created =
                repository.createRecipe(
                    RecipeCreate(
                        name = "Rice Bowl",
                        totalServings = 4.0,
                        ingredients = listOf(RecipeIngredientInput("temp_f1", 200.0, ServingUnit.g)),
                    ),
                )

            val updated = repository.updateRecipe(created.id, RecipeUpdate(totalServings = 2.0))

            assertEquals(listOf("temp_f1"), updated.ingredients.map { it.foodId })
            assertEquals(130.0, updated.calories)
        }

    // -------------------------------------------------------------------------------
    // setImage()
    // -------------------------------------------------------------------------------

    /** Same databases, Synced mode — the only mode in which uploads are queued. */
    private fun syncedRepository(): Pair<RecipeRepository, SyncQueue> {
        val appMode = appModeManager(AppMode.SYNCED)
        val queue = SyncQueue(cacheDb, json, appMode)
        return RecipeRepository(api, db, cacheDb, queue, json, NoopErrorReporter(), appMode) to queue
    }

    @Test
    fun setImageOnAServerRecipeQueuesAPartialPatchAndUpdatesTheCache() =
        runTest {
            insertLocalFood("srv_f1")
            val (synced, queue) = syncedRepository()
            val created =
                synced.createRecipe(
                    RecipeCreate(
                        name = "Rice Bowl",
                        totalServings = 1.0,
                        ingredients = listOf(RecipeIngredientInput("srv_f1", 100.0, ServingUnit.g)),
                    ),
                )
            // Stand in for the create having drained: the row now carries a server id.
            val server = created.copy(id = "srv_r1")
            db.userDataDatabaseQueries.insertRecipe(
                id = server.id,
                name = server.name,
                totalServings = server.totalServings,
                isFavorite = 0L,
                calories = server.calories,
                protein = server.protein,
                carbs = server.carbs,
                fat = server.fat,
                fiber = server.fiber,
                jsonData = json.encodeToString(server),
            )

            val updated = synced.setImage("srv_r1", "/uploads/a.webp")

            assertEquals("/uploads/a.webp", updated?.imageUrl)
            val cached =
                json.decodeFromString<RecipeDetail>(
                    db.userDataDatabaseQueries
                        .selectRecipeById("srv_r1")
                        .executeAsOneOrNull()!!
                        .jsonData,
                )
            assertEquals("/uploads/a.webp", cached.imageUrl)
            // The ingredients are untouched: a full RecipeUpdate body would rewrite them.
            assertEquals(listOf("srv_f1"), cached.ingredients.map { it.foodId })
            val queued = queue.all().map { it.operation }
            assertEquals(
                listOf(SyncOperation.SetRecipeImage("srv_r1", "/uploads/a.webp")),
                queued.filterIsInstance<SyncOperation.SetRecipeImage>(),
            )
        }

    @Test
    fun setImageOnATempRecipeRewritesTheQueuedCreateInsteadOfQueueingAPatch() =
        runTest {
            insertLocalFood("srv_f1")
            val (synced, queue) = syncedRepository()
            val created =
                synced.createRecipe(
                    RecipeCreate(
                        name = "Rice Bowl",
                        totalServings = 1.0,
                        ingredients = listOf(RecipeIngredientInput("srv_f1", 100.0, ServingUnit.g)),
                    ),
                )

            synced.setImage(created.id, "/uploads/a.webp")

            val queued = queue.all().map { it.operation }
            assertTrue(queued.none { it is SyncOperation.SetRecipeImage })
            val create = queued.filterIsInstance<SyncOperation.CreateRecipe>().single()
            assertEquals("/uploads/a.webp", json.decodeFromString<RecipeCreate>(create.body).imageUrl)
        }

    @Test
    fun setImageEvictsTheReplacedImageFromTheDevice() =
        runTest {
            insertLocalFood("temp_f1")
            val orphaned = mutableListOf<String>()
            repository.onImageOrphaned = { orphaned += it }
            val created =
                repository.createRecipe(
                    RecipeCreate(
                        name = "Rice Bowl",
                        totalServings = 1.0,
                        ingredients = listOf(RecipeIngredientInput("temp_f1", 100.0, ServingUnit.g)),
                        imageUrl = "file:///photos/old.jpg",
                    ),
                )

            repository.setImage(created.id, null)

            assertEquals(listOf("file:///photos/old.jpg"), orphaned)
            assertNull(repository.getRecipe(created.id).imageUrl)
        }

    @Test
    fun updateRecipeKeepsTheCachedImageItDoesNotCarry() =
        runTest {
            insertLocalFood("temp_f1")
            val created =
                repository.createRecipe(
                    RecipeCreate(
                        name = "Rice Bowl",
                        totalServings = 1.0,
                        ingredients = listOf(RecipeIngredientInput("temp_f1", 100.0, ServingUnit.g)),
                        imageUrl = "/uploads/a.webp",
                    ),
                )

            val updated = repository.updateRecipe(created.id, RecipeUpdate(name = "Renamed"))

            assertEquals("/uploads/a.webp", updated.imageUrl)
        }

    @Test
    fun getRecipeInLocalModeReturnsFullDetailFromCache() =
        runTest {
            insertLocalFood("temp_f1")
            val created =
                repository.createRecipe(
                    RecipeCreate(
                        name = "Rice Bowl",
                        totalServings = 4.0,
                        ingredients = listOf(RecipeIngredientInput("temp_f1", 200.0, ServingUnit.g)),
                    ),
                )

            val fetched = repository.getRecipe(created.id)

            assertEquals(created.ingredients, fetched.ingredients)
            assertEquals(65.0, fetched.calories)
            assertTrue(syncQueue.pendingCount() == 0L) // Local mode never queues uploads.
        }
}
