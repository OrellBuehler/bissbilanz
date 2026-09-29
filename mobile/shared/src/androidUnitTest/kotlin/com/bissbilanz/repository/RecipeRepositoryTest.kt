package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeIngredientInput
import com.bissbilanz.api.generated.model.RecipeStep
import com.bissbilanz.api.generated.model.RecipeStepInput
import com.bissbilanz.api.generated.model.RecipeSummary
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
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
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

    // -------------------------------------------------------------------------------
    // duplicateRecipe()
    // -------------------------------------------------------------------------------

    @Test
    fun duplicateRecipeCopiesIngredientsServingsAndCookedWeightNotFavoriteOrImage() =
        runTest {
            insertLocalFood("temp_f1")
            val created =
                repository.createRecipe(
                    RecipeCreate(
                        name = "Rice Bowl",
                        totalServings = 4.0,
                        ingredients = listOf(RecipeIngredientInput("temp_f1", 200.0, ServingUnit.g)),
                        isFavorite = true,
                        imageUrl = "/uploads/a.webp",
                        cookedWeight = 800.0,
                    ),
                )

            val copy = repository.duplicateRecipe(created.id, "Rice Bowl (copy)")

            assertEquals("Rice Bowl (copy)", copy.name)
            assertEquals(4.0, copy.totalServings)
            assertEquals(800.0, copy.cookedWeight)
            assertEquals(listOf("temp_f1"), copy.ingredients.map { it.foodId })
            assertEquals(listOf(200.0), copy.ingredients.map { it.quantity })
            assertEquals(65.0, copy.calories)
            assertFalse(copy.isFavorite)
            assertNull(copy.imageUrl)
            // A distinct row from the source — not an in-place rename.
            assertTrue(copy.id != created.id)
            assertNotNull(db.userDataDatabaseQueries.selectRecipeById(created.id).executeAsOneOrNull())
        }

    @Test
    fun duplicateRecipeWithoutACookedWeightLeavesItNull() =
        runTest {
            insertLocalFood("temp_f1")
            val created =
                repository.createRecipe(
                    RecipeCreate(
                        name = "Rice Bowl",
                        totalServings = 1.0,
                        ingredients = listOf(RecipeIngredientInput("temp_f1", 100.0, ServingUnit.g)),
                    ),
                )

            val copy = repository.duplicateRecipe(created.id, "Rice Bowl (copy)")

            assertNull(copy.cookedWeight)
        }

    // -------------------------------------------------------------------------------
    // steps
    // -------------------------------------------------------------------------------

    private fun createWithSteps(steps: List<RecipeStepInput>?) =
        RecipeCreate(
            name = "Rice Bowl",
            totalServings = 1.0,
            ingredients = listOf(RecipeIngredientInput("temp_f1", 100.0, ServingUnit.g)),
            steps = steps,
        )

    private fun cachedRecipe(id: String) =
        json.decodeFromString<RecipeDetail>(
            db.userDataDatabaseQueries
                .selectRecipeById(id)
                .executeAsOneOrNull()!!
                .jsonData,
        )

    @Test
    fun createCachesStepsInOrderWithTheirPhotos() =
        runTest {
            insertLocalFood("temp_f1")

            val created =
                repository.createRecipe(
                    createWithSteps(
                        listOf(
                            RecipeStepInput("Boil the rice", "file:///photos/a.jpg"),
                            RecipeStepInput("Serve"),
                        ),
                    ),
                )

            assertEquals(listOf("Boil the rice", "Serve"), created.steps!!.map { it.text })
            assertEquals(listOf(0, 1), created.steps!!.map { it.sortOrder })
            assertEquals(listOf("file:///photos/a.jpg", null), created.steps!!.map { it.imageUrl })
            assertEquals(created.steps, cachedRecipe(created.id).steps)
        }

    @Test
    fun createWithoutStepsCachesAnEmptyKnownList() =
        runTest {
            insertLocalFood("temp_f1")

            val created = repository.createRecipe(createWithSteps(null))

            assertEquals(emptyList(), cachedRecipe(created.id).steps)
        }

    @Test
    fun updateReplacesStepsAndAnEmptyListClearsThem() =
        runTest {
            insertLocalFood("temp_f1")
            val created = repository.createRecipe(createWithSteps(listOf(RecipeStepInput("Old"))))

            val replaced =
                repository.updateRecipe(
                    created.id,
                    RecipeUpdate(steps = listOf(RecipeStepInput("New"), RecipeStepInput("Two"))),
                )
            assertEquals(listOf("New", "Two"), replaced.steps!!.map { it.text })

            val cleared = repository.updateRecipe(created.id, RecipeUpdate(steps = emptyList()))
            assertEquals(emptyList(), cleared.steps)
            assertEquals(emptyList(), cachedRecipe(created.id).steps)
        }

    @Test
    fun updateWithoutStepsKeepsThem() =
        runTest {
            insertLocalFood("temp_f1")
            val created = repository.createRecipe(createWithSteps(listOf(RecipeStepInput("Keep me"))))

            val updated = repository.updateRecipe(created.id, RecipeUpdate(name = "Renamed"))

            assertEquals(listOf("Keep me"), updated.steps!!.map { it.text })
        }

    @Test
    fun updatingATempRecipeFoldsTheStepsIntoTheQueuedCreate() =
        runTest {
            insertLocalFood("srv_f1")
            val (synced, queue) = syncedRepository()
            val created =
                synced.createRecipe(
                    RecipeCreate(
                        name = "Rice Bowl",
                        totalServings = 1.0,
                        ingredients = listOf(RecipeIngredientInput("srv_f1", 100.0, ServingUnit.g)),
                        steps = listOf(RecipeStepInput("First")),
                    ),
                )

            synced.updateRecipe(
                created.id,
                RecipeUpdate(steps = listOf(RecipeStepInput("Edited"), RecipeStepInput("Added"))),
            )

            val create =
                queue
                    .all()
                    .map { it.operation }
                    .filterIsInstance<SyncOperation.CreateRecipe>()
                    .single()
            assertEquals(
                listOf("Edited", "Added"),
                json.decodeFromString<RecipeCreate>(create.body).steps!!.map { it.text },
            )
        }

    @Test
    fun updatingAServerRecipeQueuesTheStepsInThePatchBody() =
        runTest {
            insertLocalFood("srv_f1")
            val (synced, queue) = syncedRepository()
            val server =
                synced
                    .createRecipe(
                        RecipeCreate(
                            name = "Rice Bowl",
                            totalServings = 1.0,
                            ingredients = listOf(RecipeIngredientInput("srv_f1", 100.0, ServingUnit.g)),
                        ),
                    ).copy(id = "srv_r1")
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

            synced.updateRecipe("srv_r1", RecipeUpdate(steps = emptyList()))

            val update =
                queue
                    .all()
                    .map { it.operation }
                    .filterIsInstance<SyncOperation.UpdateRecipe>()
                    .single()
            // An explicit empty list is what clears the steps on the server.
            assertTrue(update.body.contains("\"steps\":[]"), update.body)
        }

    @Test
    fun duplicateCopiesStepsAndTheirPhotos() =
        runTest {
            insertLocalFood("temp_f1")
            val created =
                repository.createRecipe(
                    createWithSteps(
                        listOf(RecipeStepInput("One", "file:///photos/a.jpg"), RecipeStepInput("Two")),
                    ),
                )

            val copy = repository.duplicateRecipe(created.id, "Rice Bowl (copy)")

            assertEquals(listOf("One", "Two"), copy.steps!!.map { it.text })
            assertEquals(listOf("file:///photos/a.jpg", null), copy.steps!!.map { it.imageUrl })
            // Fresh step rows, not the source's.
            val sourceIds = created.steps!!.map { it.id }
            assertTrue(copy.steps!!.none { it.id in sourceIds })
        }

    private fun summary(
        id: String,
        stepCount: Int?,
    ) = RecipeSummary(
        id = id,
        name = "Rice Bowl",
        totalServings = 2.0,
        isFavorite = false,
        imageUrl = null,
        calories = 200.0,
        protein = 0.0,
        carbs = 0.0,
        fat = 0.0,
        fiber = 0.0,
        stepCount = stepCount,
    )

    private fun cacheServerRecipe(steps: List<String>?) {
        val recipe =
            RecipeDetail(
                id = "srv_r1",
                userId = "u",
                name = "Rice Bowl",
                totalServings = 2.0,
                isFavorite = false,
                imageUrl = null,
                calories = 100.0,
                protein = 0.0,
                carbs = 0.0,
                fat = 0.0,
                fiber = 0.0,
                ingredients = emptyList(),
                steps = steps?.mapIndexed { i, text -> RecipeStep("s$i", i, text, null) },
            )
        db.userDataDatabaseQueries.insertRecipe(
            id = recipe.id,
            name = recipe.name,
            totalServings = recipe.totalServings,
            isFavorite = 0L,
            calories = recipe.calories,
            protein = recipe.protein,
            carbs = recipe.carbs,
            fat = recipe.fat,
            fiber = recipe.fiber,
            jsonData = json.encodeToString(recipe),
        )
    }

    @Test
    fun refreshKeepsCachedStepsWhileTheListCountStillMatches() =
        runTest {
            val (synced, _) = syncedRepository()
            cacheServerRecipe(listOf("Chop", "Cook"))
            coEvery { api.getRecipes() } returns listOf(summary("srv_r1", stepCount = 2))

            synced.refresh()

            assertEquals(listOf("Chop", "Cook"), cachedRecipe("srv_r1").steps!!.map { it.text })
        }

    @Test
    fun refreshDropsCachedStepsWhoseCountChangedSoTheyAreRefetched() =
        runTest {
            val (synced, _) = syncedRepository()
            cacheServerRecipe(listOf("Chop", "Cook"))
            coEvery { api.getRecipes() } returns listOf(summary("srv_r1", stepCount = 3))

            synced.refresh()

            // null = "not downloaded", which the editor treats as unavailable rather than empty.
            assertNull(cachedRecipe("srv_r1").steps)
        }

    @Test
    fun refreshMarksARecipeWithNoStepsAsKnownEmpty() =
        runTest {
            val (synced, _) = syncedRepository()
            coEvery { api.getRecipes() } returns listOf(summary("srv_r1", stepCount = 0))

            synced.refresh()

            assertEquals(emptyList(), cachedRecipe("srv_r1").steps)
        }
}
