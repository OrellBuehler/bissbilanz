package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.OpenFoodFactsClient
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.FoodsListResponse
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import com.bissbilanz.util.mergeOpenFoodFactsOntoFood
import com.bissbilanz.util.openFoodFactsProductToFoodCreate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

class FoodRepository(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val cacheDb: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
    private val openFoodFactsClient: OpenFoodFactsClient,
    private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO,
) {
    var onFoodChanged: (suspend () -> Unit)? = null
    private val _recentFoods = MutableStateFlow<List<Food>>(emptyList())
    val recentFoods: StateFlow<List<Food>> = _recentFoods.asStateFlow()

    fun allFoods(): Flow<List<Food>> =
        db.userDataDatabaseQueries
            .selectAllFoods()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<Food>(it.jsonData) } }

    fun favorites(): Flow<List<Food>> =
        db.userDataDatabaseQueries
            .selectFavorites()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<Food>(it.jsonData) } }

    suspend fun fetchFoodsPaginated(
        limit: Int = 20,
        offset: Int = 0,
    ): FoodsListResponse {
        if (appModeManager.isLocal) {
            val all =
                db.userDataDatabaseQueries
                    .selectAllFoods()
                    .executeAsList()
                    .mapNotNull { json.decodeOrNull<Food>(it.jsonData) }
            return FoodsListResponse(foods = all.drop(offset).take(limit), total = all.size)
        }
        val response = api.getFoodsPaginated(limit, offset)
        cacheFoods(response.foods)
        return response
    }

    suspend fun refreshFoods(
        limit: Int = 100,
        offset: Int = 0,
    ) {
        if (appModeManager.isLocal) return
        val foods = api.getFoods(limit, offset)
        cacheFoods(foods)
    }

    suspend fun refreshFavorites() {
        if (appModeManager.isLocal) return
        val favs = api.getFavorites()
        favs.forEach { cacheFood(it) }
    }

    suspend fun refreshRecentFoods(limit: Int = 20) {
        if (appModeManager.isLocal) {
            // Derive recents from the local entry log so the add-food flow still works.
            _recentFoods.value =
                db.userDataDatabaseQueries
                    .selectRecentFoods(limit.toLong())
                    .executeAsList()
                    .mapNotNull { json.decodeOrNull<Food>(it.jsonData) }
            return
        }
        _recentFoods.value =
            api.getRecentFoods(limit).map { recent ->
                Food(
                    id = recent.id,
                    userId = recent.userId,
                    name = recent.name,
                    brand = recent.brand,
                    servingSize = recent.servingSize,
                    servingUnit = Food.ServingUnit.valueOf(recent.servingUnit.name),
                    calories = recent.calories,
                    protein = recent.protein,
                    carbs = recent.carbs,
                    fat = recent.fat,
                    fiber = recent.fiber,
                    barcode = recent.barcode,
                    isFavorite = recent.isFavorite,
                    nutriScore = null,
                    novaGroup = null,
                    additives = null,
                    ingredientsText = null,
                    imageUrl = recent.imageUrl,
                )
            }
    }

    suspend fun getFood(id: String): Food {
        if (appModeManager.isLocal) {
            return getFoodCached(id) ?: throw IllegalStateException("Food $id not found in local database")
        }
        return try {
            val food = api.getFood(id)
            cacheFood(food)
            food
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            val cached = db.userDataDatabaseQueries.selectFoodById(id).executeAsOneOrNull()
            cached?.let { json.decodeOrNull<Food>(it.jsonData) } ?: throw e
        }
    }

    fun getFoodCached(id: String): Food? {
        val cached = db.userDataDatabaseQueries.selectFoodById(id).executeAsOneOrNull()
        return cached?.let { json.decodeOrNull<Food>(it.jsonData) }
    }

    suspend fun createFood(food: FoodCreate): Food {
        val tempFood = foodCreateToFood(food)
        cacheFood(tempFood)
        syncQueue.enqueue(SyncOperation.CreateFood(json.encodeToString(food), localId = tempFood.id))
        onFoodChanged?.invoke()
        return tempFood
    }

    suspend fun updateFood(
        id: String,
        food: FoodCreate,
    ): Food {
        val tempFood = foodCreateToFood(food, id)
        cacheFood(tempFood)
        if (id.startsWith("temp_")) {
            coalesceQueuedCreate(id, food)
        } else {
            syncQueue.enqueue(SyncOperation.UpdateFood(id, json.encodeToString(food)))
        }
        onFoodChanged?.invoke()
        return tempFood
    }

    suspend fun deleteFood(id: String) {
        db.userDataDatabaseQueries.deleteFood(id)
        if (id.startsWith("temp_")) {
            syncQueue.removeByAffected("foods", id)
        } else {
            syncQueue.enqueue(SyncOperation.DeleteFood(id))
        }
        onFoodChanged?.invoke()
    }

    /**
     * Rewrites the still-queued Create operation for a temp-id food so the eventual
     * upload carries the edited values. Updates use the full [FoodCreate] body, so the
     * new body simply replaces the queued one. If the create has already been drained
     * (no queued op found), the update is skipped — the temp id is unknown server-side.
     */
    private suspend fun coalesceQueuedCreate(
        tempId: String,
        food: FoodCreate,
    ) {
        for (req in syncQueue.findByAffected("foods", tempId)) {
            val create = req.operation as? SyncOperation.CreateFood ?: continue
            syncQueue.replaceOperation(req.id, create.copy(body = json.encodeToString(food)))
        }
    }

    suspend fun searchFoods(query: String): List<Food> {
        if (appModeManager.isLocal) return searchFoodsCached(query)
        return try {
            api.searchFoods(query)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            searchFoodsCached(query)
        }
    }

    private fun searchFoodsCached(query: String): List<Food> {
        val pattern = "%$query%"
        return db.userDataDatabaseQueries
            .searchFoods(pattern, pattern, 50)
            .executeAsList()
            .mapNotNull { json.decodeOrNull<Food>(it.jsonData) }
    }

    /**
     * Looks up a barcode in Open Food Facts: via the backend proxy when synced, via
     * the public OFF API directly when in Local mode (no backend available).
     */
    suspend fun lookupOpenFoodFacts(barcode: String): OpenFoodFactsProduct? =
        if (appModeManager.isLocal) {
            try {
                openFoodFactsClient.fetchProduct(barcode)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                null
            }
        } else {
            api.lookupOpenFoodFacts(barcode)
        }

    suspend fun enrichFood(
        id: String,
        barcode: String,
    ): Food {
        val product =
            lookupOpenFoodFacts(barcode)
                ?: throw IllegalStateException("Product not found in Open Food Facts")
        if (appModeManager.isLocal) {
            val current = getFoodCached(id) ?: throw IllegalStateException("Food $id not found in local database")
            val enriched = mergeOpenFoodFactsOntoFood(baseline = current, product = product)
            // updateFood is cache-write + (mode-gated) enqueue and fires onFoodChanged.
            return updateFood(id, enriched)
        }
        val current = api.getFood(id)
        val enriched = mergeOpenFoodFactsOntoFood(baseline = current, product = product)
        val updated = api.updateFood(id, enriched)
        cacheFood(updated)
        onFoodChanged?.invoke()
        return updated
    }

    suspend fun findByBarcode(barcode: String): Food? {
        if (appModeManager.isLocal) {
            return db.userDataDatabaseQueries
                .selectFoodByBarcode(barcode)
                .executeAsOneOrNull()
                ?.let { json.decodeOrNull<Food>(it.jsonData) }
        }
        return coroutineScope {
            val apiResult =
                async {
                    try {
                        api.getFoodByBarcode(barcode)
                    } catch (e: Exception) {
                        if (e is kotlin.coroutines.cancellation.CancellationException) throw e
                        errorReporter.captureException(e)
                        null
                    }
                }
            val cacheResult =
                async(ioDispatcher) {
                    db.userDataDatabaseQueries
                        .selectFoodByBarcode(barcode)
                        .executeAsOneOrNull()
                        ?.let { json.decodeOrNull<Food>(it.jsonData) }
                }

            val apiFood = apiResult.await()
            val cachedFood = cacheResult.await()

            if (apiFood != null) {
                cacheFood(apiFood)
                apiFood
            } else {
                cachedFood
            }
        }
    }

    /**
     * Resolves a scanned barcode to a usable food: the user's own food first,
     * then an Open Food Facts hit (created locally so the user lands on its
     * detail, mirroring iOS), else null. Used by the barcode scanner.
     */
    suspend fun findOrCreateByBarcode(barcode: String): Food? {
        findByBarcode(barcode)?.let { return it }
        val product =
            try {
                lookupOpenFoodFacts(barcode)
            } catch (e: Exception) {
                if (e is kotlin.coroutines.cancellation.CancellationException) throw e
                errorReporter.captureException(e)
                null
            } ?: return null
        return createFood(openFoodFactsProductToFoodCreate(product, barcode))
    }

    private fun cacheFood(food: Food) {
        db.userDataDatabaseQueries.insertFood(
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

    private fun cacheFoods(foods: List<Food>) {
        db.userDataDatabaseQueries.transaction {
            foods.forEach { food -> cacheFood(food) }
        }
        // SyncMeta lives in the cache database; written after the user-data commit.
        cacheDb.bissbilanzDatabaseQueries.upsertSyncMeta(
            entityType = "foods",
            lastSyncedAt = Clock.System.now().toString(),
        )
    }

    @OptIn(ExperimentalUuidApi::class)
    private fun foodCreateToFood(
        food: FoodCreate,
        id: String = "temp_${Uuid.random()}",
    ): Food =
        Food(
            id = id,
            userId = "",
            name = food.name,
            brand = food.brand,
            servingSize = food.servingSize,
            servingUnit = Food.ServingUnit.valueOf(food.servingUnit.name),
            calories = food.calories,
            protein = food.protein,
            carbs = food.carbs,
            fat = food.fat,
            fiber = food.fiber,
            barcode = food.barcode,
            isFavorite = food.isFavorite ?: false,
            nutriScore = food.nutriScore?.value,
            novaGroup = food.novaGroup,
            additives = food.additives,
            ingredientsText = food.ingredientsText,
            imageUrl = food.imageUrl,
            saturatedFat = food.saturatedFat,
            monounsaturatedFat = food.monounsaturatedFat,
            polyunsaturatedFat = food.polyunsaturatedFat,
            transFat = food.transFat,
            cholesterol = food.cholesterol,
            omega3 = food.omega3,
            omega6 = food.omega6,
            sugar = food.sugar,
            addedSugars = food.addedSugars,
            sugarAlcohols = food.sugarAlcohols,
            starch = food.starch,
            sodium = food.sodium,
            potassium = food.potassium,
            calcium = food.calcium,
            iron = food.iron,
            magnesium = food.magnesium,
            phosphorus = food.phosphorus,
            zinc = food.zinc,
            copper = food.copper,
            manganese = food.manganese,
            selenium = food.selenium,
            iodine = food.iodine,
            fluoride = food.fluoride,
            chromium = food.chromium,
            molybdenum = food.molybdenum,
            chloride = food.chloride,
            vitaminA = food.vitaminA,
            vitaminC = food.vitaminC,
            vitaminD = food.vitaminD,
            vitaminE = food.vitaminE,
            vitaminK = food.vitaminK,
            vitaminB1 = food.vitaminB1,
            vitaminB2 = food.vitaminB2,
            vitaminB3 = food.vitaminB3,
            vitaminB5 = food.vitaminB5,
            vitaminB6 = food.vitaminB6,
            vitaminB7 = food.vitaminB7,
            vitaminB9 = food.vitaminB9,
            vitaminB12 = food.vitaminB12,
            caffeine = food.caffeine,
            alcohol = food.alcohol,
            water = food.water,
            salt = food.salt,
        )
}
