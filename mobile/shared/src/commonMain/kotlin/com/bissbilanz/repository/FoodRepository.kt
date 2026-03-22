package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.FoodsListResponse
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.util.decodeOrNull
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
    private val db: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
    private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO,
) {
    var onFoodChanged: (suspend () -> Unit)? = null
    private val _recentFoods = MutableStateFlow<List<Food>>(emptyList())
    val recentFoods: StateFlow<List<Food>> = _recentFoods.asStateFlow()

    fun allFoods(): Flow<List<Food>> =
        db.bissbilanzDatabaseQueries
            .selectAllFoods()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<Food>(it.jsonData) } }

    fun favorites(): Flow<List<Food>> =
        db.bissbilanzDatabaseQueries
            .selectFavorites()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<Food>(it.jsonData) } }

    suspend fun fetchFoodsPaginated(
        limit: Int = 20,
        offset: Int = 0,
    ): FoodsListResponse {
        val response = api.getFoodsPaginated(limit, offset)
        cacheFoods(response.foods)
        return response
    }

    suspend fun refreshFoods(
        limit: Int = 100,
        offset: Int = 0,
    ) {
        val foods = api.getFoods(limit, offset)
        cacheFoods(foods)
    }

    suspend fun refreshFavorites() {
        val favs = api.getFavorites()
        favs.forEach { cacheFood(it) }
    }

    suspend fun refreshRecentFoods(limit: Int = 20) {
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

    suspend fun getFood(id: String): Food =
        try {
            val food = api.getFood(id)
            cacheFood(food)
            food
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            val cached = db.bissbilanzDatabaseQueries.selectFoodById(id).executeAsOneOrNull()
            cached?.let { json.decodeOrNull<Food>(it.jsonData) } ?: throw e
        }

    fun getFoodCached(id: String): Food? {
        val cached = db.bissbilanzDatabaseQueries.selectFoodById(id).executeAsOneOrNull()
        return cached?.let { json.decodeOrNull<Food>(it.jsonData) }
    }

    suspend fun createFood(food: FoodCreate): Food {
        val tempFood = foodCreateToFood(food)
        cacheFood(tempFood)
        syncQueue.enqueue(SyncOperation.CreateFood(json.encodeToString(food)))
        onFoodChanged?.invoke()
        return tempFood
    }

    suspend fun updateFood(
        id: String,
        food: FoodCreate,
    ): Food {
        val tempFood = foodCreateToFood(food, id)
        cacheFood(tempFood)
        syncQueue.enqueue(SyncOperation.UpdateFood(id, json.encodeToString(food)))
        onFoodChanged?.invoke()
        return tempFood
    }

    suspend fun deleteFood(id: String) {
        db.bissbilanzDatabaseQueries.deleteFood(id)
        syncQueue.enqueue(SyncOperation.DeleteFood(id))
        onFoodChanged?.invoke()
    }

    suspend fun searchFoods(query: String): List<Food> =
        try {
            api.searchFoods(query)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            val pattern = "%$query%"
            db.bissbilanzDatabaseQueries
                .searchFoods(pattern, pattern, 50)
                .executeAsList()
                .mapNotNull { json.decodeOrNull<Food>(it.jsonData) }
        }

    suspend fun enrichFood(
        id: String,
        barcode: String,
    ): Food {
        val product =
            api.lookupOpenFoodFacts(barcode)
                ?: throw IllegalStateException("Product not found in Open Food Facts")
        val current = api.getFood(id)
        val enriched =
            FoodCreate(
                name = current.name,
                servingSize = current.servingSize,
                servingUnit = ServingUnit.valueOf(current.servingUnit.name),
                calories = current.calories,
                protein = current.protein,
                carbs = current.carbs,
                fat = current.fat,
                fiber = current.fiber,
                brand = current.brand,
                barcode = current.barcode,
                isFavorite = current.isFavorite,
                nutriScore = product.nutriScore?.let { FoodCreate.NutriScore.valueOf(it.name) },
                novaGroup = product.novaGroup?.toInt(),
                additives = product.additives,
                ingredientsText = product.ingredientsText,
                imageUrl = product.imageUrl ?: current.imageUrl,
                saturatedFat = product.saturatedFat ?: current.saturatedFat,
                monounsaturatedFat = product.monounsaturatedFat ?: current.monounsaturatedFat,
                polyunsaturatedFat = product.polyunsaturatedFat ?: current.polyunsaturatedFat,
                transFat = product.transFat ?: current.transFat,
                cholesterol = product.cholesterol ?: current.cholesterol,
                omega3 = product.omega3 ?: current.omega3,
                omega6 = product.omega6 ?: current.omega6,
                sugar = product.sugar ?: current.sugar,
                addedSugars = product.addedSugars ?: current.addedSugars,
                sugarAlcohols = product.sugarAlcohols ?: current.sugarAlcohols,
                starch = product.starch ?: current.starch,
                sodium = product.sodium ?: current.sodium,
                potassium = product.potassium ?: current.potassium,
                calcium = product.calcium ?: current.calcium,
                iron = product.iron ?: current.iron,
                magnesium = product.magnesium ?: current.magnesium,
                phosphorus = product.phosphorus ?: current.phosphorus,
                zinc = product.zinc ?: current.zinc,
                copper = product.copper ?: current.copper,
                manganese = product.manganese ?: current.manganese,
                selenium = product.selenium ?: current.selenium,
                iodine = product.iodine ?: current.iodine,
                fluoride = product.fluoride ?: current.fluoride,
                chromium = product.chromium ?: current.chromium,
                molybdenum = product.molybdenum ?: current.molybdenum,
                chloride = product.chloride ?: current.chloride,
                vitaminA = product.vitaminA ?: current.vitaminA,
                vitaminC = product.vitaminC ?: current.vitaminC,
                vitaminD = product.vitaminD ?: current.vitaminD,
                vitaminE = product.vitaminE ?: current.vitaminE,
                vitaminK = product.vitaminK ?: current.vitaminK,
                vitaminB1 = product.vitaminB1 ?: current.vitaminB1,
                vitaminB2 = product.vitaminB2 ?: current.vitaminB2,
                vitaminB3 = product.vitaminB3 ?: current.vitaminB3,
                vitaminB5 = product.vitaminB5 ?: current.vitaminB5,
                vitaminB6 = product.vitaminB6 ?: current.vitaminB6,
                vitaminB7 = product.vitaminB7 ?: current.vitaminB7,
                vitaminB9 = product.vitaminB9 ?: current.vitaminB9,
                vitaminB12 = product.vitaminB12 ?: current.vitaminB12,
                caffeine = product.caffeine ?: current.caffeine,
                alcohol = product.alcohol ?: current.alcohol,
                water = product.water ?: current.water,
                salt = product.salt ?: current.salt,
            )
        val updated = api.updateFood(id, enriched)
        cacheFood(updated)
        onFoodChanged?.invoke()
        return updated
    }

    suspend fun findByBarcode(barcode: String): Food? =
        coroutineScope {
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
                    db.bissbilanzDatabaseQueries
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

    private fun cacheFood(food: Food) {
        db.bissbilanzDatabaseQueries.insertFood(
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
        db.bissbilanzDatabaseQueries.transaction {
            foods.forEach { food -> cacheFood(food) }
            db.bissbilanzDatabaseQueries.upsertSyncMeta(
                entityType = "foods",
                lastSyncedAt = Clock.System.now().toString(),
            )
        }
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
            nutriScore = null,
            novaGroup = null,
            additives = null,
            ingredientsText = null,
            imageUrl = food.imageUrl,
        )
}
