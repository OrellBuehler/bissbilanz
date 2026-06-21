package com.bissbilanz.api

import com.bissbilanz.api.generated.model.CalendarResponse
import com.bissbilanz.api.generated.model.DailyStatsResponse
import com.bissbilanz.api.generated.model.DayProperties
import com.bissbilanz.api.generated.model.DayPropertiesResponse
import com.bissbilanz.api.generated.model.DayPropertiesSet
import com.bissbilanz.api.generated.model.EntriesCopyResponse
import com.bissbilanz.api.generated.model.EntriesListResponse
import com.bissbilanz.api.generated.model.EntriesRangeResponse
import com.bissbilanz.api.generated.model.EntryCreate
import com.bissbilanz.api.generated.model.EntryRangeItem
import com.bissbilanz.api.generated.model.EntryResponse
import com.bissbilanz.api.generated.model.EntryUpdate
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.FoodDiversityResponse
import com.bissbilanz.api.generated.model.FoodRecent
import com.bissbilanz.api.generated.model.FoodResponse
import com.bissbilanz.api.generated.model.FoodsListResponse
import com.bissbilanz.api.generated.model.FoodsRecentResponse
import com.bissbilanz.api.generated.model.Goals
import com.bissbilanz.api.generated.model.GoalsResponse
import com.bissbilanz.api.generated.model.GoalsSetResponse
import com.bissbilanz.api.generated.model.ImageUploadResponse
import com.bissbilanz.api.generated.model.MaintenanceResponse
import com.bissbilanz.api.generated.model.MealBreakdownResponse
import com.bissbilanz.api.generated.model.MealTimingResponse
import com.bissbilanz.api.generated.model.MealType
import com.bissbilanz.api.generated.model.MealTypeCreate
import com.bissbilanz.api.generated.model.MealTypeResponse
import com.bissbilanz.api.generated.model.MealTypeUpdate
import com.bissbilanz.api.generated.model.MealTypesListResponse
import com.bissbilanz.api.generated.model.MonthlyStatsResponse
import com.bissbilanz.api.generated.model.NutrientsDailyResponse
import com.bissbilanz.api.generated.model.NutrientsExtendedResponse
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.api.generated.model.OpenFoodFactsResponse
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.api.generated.model.PreferencesResponse
import com.bissbilanz.api.generated.model.PreferencesUpdate
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeResponse
import com.bissbilanz.api.generated.model.RecipeSummary
import com.bissbilanz.api.generated.model.RecipeUpdate
import com.bissbilanz.api.generated.model.RecipesListResponse
import com.bissbilanz.api.generated.model.SleepCreate
import com.bissbilanz.api.generated.model.SleepEntriesResponse
import com.bissbilanz.api.generated.model.SleepEntry
import com.bissbilanz.api.generated.model.SleepEntryResponse
import com.bissbilanz.api.generated.model.SleepFoodCorrelationEntry
import com.bissbilanz.api.generated.model.SleepFoodCorrelationResponse
import com.bissbilanz.api.generated.model.SleepUpdate
import com.bissbilanz.api.generated.model.StreaksResponse
import com.bissbilanz.api.generated.model.Supplement
import com.bissbilanz.api.generated.model.SupplementChecklistItem
import com.bissbilanz.api.generated.model.SupplementChecklistResponse
import com.bissbilanz.api.generated.model.SupplementCreate
import com.bissbilanz.api.generated.model.SupplementHistoryResponse
import com.bissbilanz.api.generated.model.SupplementLog
import com.bissbilanz.api.generated.model.SupplementLogResponse
import com.bissbilanz.api.generated.model.SupplementResponse
import com.bissbilanz.api.generated.model.SupplementsListResponse
import com.bissbilanz.api.generated.model.TopFoodsResponse
import com.bissbilanz.api.generated.model.WeeklyStatsResponse
import com.bissbilanz.api.generated.model.WeightCreate
import com.bissbilanz.api.generated.model.WeightEntriesResponse
import com.bissbilanz.api.generated.model.WeightEntry
import com.bissbilanz.api.generated.model.WeightEntryResponse
import com.bissbilanz.api.generated.model.WeightFoodResponse
import com.bissbilanz.api.generated.model.WeightLatestResponse
import com.bissbilanz.api.generated.model.WeightTrendEntry
import com.bissbilanz.api.generated.model.WeightTrendResponse
import com.bissbilanz.api.generated.model.WeightUpdate
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.createHttpEngine
import com.bissbilanz.model.Entry
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.auth.*
import io.ktor.client.plugins.auth.providers.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.datetime.Clock
import kotlinx.serialization.json.Json
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

class ApiException(
    message: String,
    val statusCode: Int = 0,
    val rawResponse: HttpResponse? = null,
) : Exception(message)

class BissbilanzApi(
    private val baseUrl: String,
    private val authManager: AuthManager,
) {
    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = false
            isLenient = true
        }

    private val client =
        HttpClient(createHttpEngine()) {
            install(ContentNegotiation) {
                json(this@BissbilanzApi.json)
            }
            install(HttpTimeout) {
                requestTimeoutMillis = 30_000
                connectTimeoutMillis = 10_000
            }
            install(Auth) {
                bearer {
                    loadTokens {
                        val token = authManager.getAccessToken() ?: return@loadTokens null
                        BearerTokens(token, "")
                    }
                    refreshTokens {
                        if (!authManager.refreshToken()) throw UnauthorizedException()
                        val token = authManager.getAccessToken() ?: throw UnauthorizedException()
                        BearerTokens(token, "")
                    }
                    sendWithoutRequest { request ->
                        request.url.host == Url(baseUrl).host
                    }
                }
            }
            defaultRequest {
                url(baseUrl)
                contentType(ContentType.Application.Json)
            }
        }

    private suspend inline fun <reified T> get(
        path: String,
        block: HttpRequestBuilder.() -> Unit = {},
    ): T {
        val response = client.get(path, block)
        if (!response.status.isSuccess()) {
            throw ApiException(
                "GET $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
                response.status.value,
                response,
            )
        }
        return response.body()
    }

    private fun HttpRequestBuilder.applySyncHeaders(
        idempotencyKey: String?,
        clientEditedAt: String?,
    ) {
        if (idempotencyKey != null) header("Idempotency-Key", idempotencyKey)
        if (clientEditedAt != null) header("X-Client-Edited-At", clientEditedAt)
    }

    private suspend inline fun <reified T> post(
        path: String,
        body: Any,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
        block: HttpRequestBuilder.() -> Unit = {},
    ): T {
        val response =
            client.post(path) {
                setBody(body)
                applySyncHeaders(idempotencyKey, clientEditedAt)
                block()
            }
        if (!response.status.isSuccess()) {
            throw ApiException(
                "POST $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
                response.status.value,
                response,
            )
        }
        return response.body()
    }

    private suspend inline fun <reified T> put(
        path: String,
        body: Any,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): T {
        val response =
            client.put(path) {
                setBody(body)
                applySyncHeaders(idempotencyKey, clientEditedAt)
            }
        if (!response.status.isSuccess()) {
            throw ApiException(
                "PUT $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
                response.status.value,
                response,
            )
        }
        return response.body()
    }

    private suspend inline fun <reified T> patch(
        path: String,
        body: Any,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): T {
        val response =
            client.patch(path) {
                setBody(body)
                applySyncHeaders(idempotencyKey, clientEditedAt)
            }
        if (!response.status.isSuccess()) {
            throw ApiException(
                "PATCH $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
                response.status.value,
                response,
            )
        }
        return response.body()
    }

    private suspend fun delete(
        path: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val response =
            client.delete(path) {
                applySyncHeaders(idempotencyKey, clientEditedAt)
            }
        if (!response.status.isSuccess()) {
            throw ApiException(
                "DELETE $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
                response.status.value,
                response,
            )
        }
    }

    fun close() {
        client.close()
    }

    // Foods
    suspend fun getFoodsPaginated(
        limit: Int = 20,
        offset: Int = 0,
    ): FoodsListResponse =
        get("/api/foods") {
            parameter("limit", limit)
            parameter("offset", offset)
        }

    suspend fun getFoods(
        limit: Int = 100,
        offset: Int = 0,
    ): List<Food> = getFoodsPaginated(limit, offset).foods

    suspend fun getFood(id: String): Food {
        val response: FoodResponse = get("/api/foods/$id")
        return response.food
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun createFood(
        food: FoodCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Food {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: FoodResponse = post("/api/foods", food, key, editedAt)
        return response.food
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateFood(
        id: String,
        food: FoodCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Food {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: FoodResponse = patch("/api/foods/$id", food, key, editedAt)
        return response.food
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteFood(
        id: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/foods/$id", key, editedAt)
    }

    suspend fun searchFoods(query: String): List<Food> {
        val response: FoodsListResponse = get("/api/foods") { parameter("q", query) }
        return response.foods
    }

    suspend fun getRecentFoods(limit: Int = 20): List<FoodRecent> {
        val response: FoodsRecentResponse = get("/api/foods/recent") { parameter("limit", limit) }
        return response.foods
    }

    @kotlinx.serialization.Serializable
    private data class FoodFavoritesResponse(
        val foods: List<Food>? = null,
    )

    suspend fun getFavorites(): List<Food> {
        val response: FoodFavoritesResponse = get("/api/favorites") { parameter("type", "foods") }
        return response.foods ?: emptyList()
    }

    suspend fun getFoodByBarcode(barcode: String): Food? =
        try {
            val response: FoodResponse = get("/api/foods") { parameter("barcode", barcode) }
            response.food
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            null
        }

    suspend fun lookupOpenFoodFacts(barcode: String): OpenFoodFactsProduct? =
        try {
            val response: OpenFoodFactsResponse = get("/api/openfoodfacts/$barcode")
            response.product
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            null
        }

    // Entries
    suspend fun getEntries(date: String): List<Entry> {
        val response: EntriesListResponse = get("/api/entries") { parameter("date", date) }
        return response.propertyEntries.map { item ->
            Entry(
                id = item.id,
                date = date,
                mealType = item.mealType,
                servings = item.servings,
                notes = item.notes,
                foodId = item.foodId,
                recipeId = item.recipeId,
                quickName = item.quickName,
                quickCalories = item.quickCalories,
                quickProtein = item.quickProtein,
                quickCarbs = item.quickCarbs,
                quickFat = item.quickFat,
                quickFiber = item.quickFiber,
                eatenAt = item.eatenAt,
                createdAt = item.createdAt,
                foodName = item.foodName,
                calories = item.calories,
                protein = item.protein,
                carbs = item.carbs,
                fat = item.fat,
                fiber = item.fiber,
                servingSize = item.servingSize,
                servingUnit = item.servingUnit,
            )
        }
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun createEntry(
        entry: EntryCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Entry {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: EntryResponse = post("/api/entries", entry, key, editedAt)
        val e = response.entry
        return Entry(
            id = e.id,
            userId = e.userId,
            foodId = e.foodId,
            recipeId = e.recipeId,
            date = e.date,
            mealType = e.mealType,
            servings = e.servings,
            notes = e.notes,
            quickName = e.quickName,
            quickCalories = e.quickCalories,
            quickProtein = e.quickProtein,
            quickCarbs = e.quickCarbs,
            quickFat = e.quickFat,
            quickFiber = e.quickFiber,
            eatenAt = e.eatenAt,
            createdAt = e.createdAt,
            updatedAt = e.updatedAt,
        )
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateEntry(
        id: String,
        entry: EntryUpdate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Entry {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: EntryResponse = patch("/api/entries/$id", entry, key, editedAt)
        val e = response.entry
        return Entry(
            id = e.id,
            userId = e.userId,
            foodId = e.foodId,
            recipeId = e.recipeId,
            date = e.date,
            mealType = e.mealType,
            servings = e.servings,
            notes = e.notes,
            quickName = e.quickName,
            quickCalories = e.quickCalories,
            quickProtein = e.quickProtein,
            quickCarbs = e.quickCarbs,
            quickFat = e.quickFat,
            quickFiber = e.quickFiber,
            eatenAt = e.eatenAt,
            createdAt = e.createdAt,
            updatedAt = e.updatedAt,
        )
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteEntry(
        id: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/entries/$id", key, editedAt)
    }

    suspend fun getEntriesRange(
        startDate: String,
        endDate: String,
    ): List<EntryRangeItem> {
        val response: EntriesRangeResponse =
            get("/api/entries/range") {
                parameter("startDate", startDate)
                parameter("endDate", endDate)
            }
        return response.propertyEntries
    }

    // Recipes
    suspend fun getRecipes(): List<RecipeSummary> {
        val response: RecipesListResponse = get("/api/recipes")
        return response.recipes
    }

    suspend fun getRecipe(id: String): RecipeDetail {
        val response: RecipeResponse = get("/api/recipes/$id")
        return response.recipe
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun createRecipe(
        recipe: RecipeCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): RecipeDetail {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: RecipeResponse = post("/api/recipes", recipe, key, editedAt)
        return response.recipe
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateRecipe(
        id: String,
        recipe: RecipeUpdate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): RecipeDetail {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: RecipeResponse = patch("/api/recipes/$id", recipe, key, editedAt)
        return response.recipe
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteRecipe(
        id: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/recipes/$id", key, editedAt)
    }

    // Goals
    suspend fun getGoals(): Goals? =
        try {
            val response: GoalsResponse = get("/api/goals")
            response.goals
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            null
        }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun setGoals(
        goals: Goals,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Goals {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: GoalsSetResponse = post("/api/goals", goals, key, editedAt)
        return response.goals
    }

    // Weight
    suspend fun getWeightEntries(limit: Int = 30): List<WeightEntry> {
        val response: WeightEntriesResponse = get("/api/weight") { parameter("limit", limit) }
        return response.propertyEntries
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun createWeightEntry(
        entry: WeightCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): WeightEntry {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: WeightEntryResponse = post("/api/weight", entry, key, editedAt)
        return response.entry
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateWeightEntry(
        id: String,
        entry: WeightUpdate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): WeightEntry {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: WeightEntryResponse = patch("/api/weight/$id", entry, key, editedAt)
        return response.entry
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteWeightEntry(
        id: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/weight/$id", key, editedAt)
    }

    suspend fun getLatestWeightEntry(): WeightEntry? {
        val response: WeightLatestResponse = get("/api/weight/latest")
        return response.entry
    }

    suspend fun getWeightTrend(
        from: String,
        to: String,
    ): List<WeightTrendEntry> {
        val response: WeightTrendResponse =
            get("/api/weight") {
                parameter("from", from)
                parameter("to", to)
            }
        return response.`data`
    }

    // Supplements
    suspend fun getSupplements(): List<Supplement> {
        val response: SupplementsListResponse = get("/api/supplements")
        return response.supplements
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun createSupplement(
        supplement: SupplementCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Supplement {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: SupplementResponse = post("/api/supplements", supplement, key, editedAt)
        return response.supplement
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteSupplement(
        id: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/supplements/$id", key, editedAt)
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun logSupplement(
        supplementId: String,
        date: String? = null,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): SupplementLog {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: SupplementLogResponse =
            post("/api/supplements/$supplementId/log", mapOf("date" to date), key, editedAt)
        return response.log
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun unlogSupplement(
        supplementId: String,
        date: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/supplements/$supplementId/log?date=$date", key, editedAt)
    }

    // Stats
    suspend fun getDailyStats(
        startDate: String,
        endDate: String,
    ): DailyStatsResponse =
        get("/api/stats/daily") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getWeeklyStats(): WeeklyStatsResponse = get("/api/stats/weekly")

    suspend fun getMonthlyStats(): MonthlyStatsResponse = get("/api/stats/monthly")

    suspend fun getMealBreakdown(date: String): MealBreakdownResponse = get("/api/stats/meal-breakdown") { parameter("date", date) }

    suspend fun getMealBreakdown(
        startDate: String,
        endDate: String,
    ): MealBreakdownResponse =
        get("/api/stats/meal-breakdown") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getStreaks(): StreaksResponse = get("/api/stats/streaks")

    suspend fun getTopFoods(
        days: Int = 7,
        limit: Int = 10,
    ): TopFoodsResponse =
        get("/api/stats/top-foods") {
            parameter("days", days)
            parameter("limit", limit)
        }

    // Preferences
    suspend fun getPreferences(): Preferences {
        val response: PreferencesResponse = get("/api/preferences")
        return response.preferences
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun updatePreferences(
        prefs: PreferencesUpdate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Preferences {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: PreferencesResponse = patch("/api/preferences", prefs, key, editedAt)
        return response.preferences
    }

    // Meal types
    suspend fun getMealTypes(): MealTypesListResponse = get("/api/meal-types")

    suspend fun createMealType(mealType: MealTypeCreate): MealType = post("/api/meal-types", mealType)

    suspend fun updateMealType(
        id: String,
        mealType: MealTypeUpdate,
    ): MealType {
        val response: MealTypeResponse = patch("/api/meal-types/$id", mealType)
        return response.mealType
    }

    suspend fun deleteMealType(id: String) = delete("/api/meal-types/$id")

    // Copy entries
    suspend fun copyEntries(
        fromDate: String,
        toDate: String,
    ): EntriesCopyResponse =
        post("/api/entries/copy", mapOf<String, String>()) {
            parameter("fromDate", fromDate)
            parameter("toDate", toDate)
        }

    // Calendar
    suspend fun getCalendarStats(month: String): CalendarResponse = get("/api/stats/calendar") { parameter("month", month) }

    // Maintenance
    suspend fun getMaintenanceCalories(
        startDate: String,
        endDate: String,
        muscleRatio: Double = 0.3,
    ): MaintenanceResponse =
        get("/api/maintenance") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
            parameter("muscleRatio", muscleRatio)
        }

    // Day Properties
    suspend fun getDayProperties(date: String): DayProperties? {
        val response: DayPropertiesResponse = get("/api/day-properties") { parameter("date", date) }
        return response.properties
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun setDayProperties(
        date: String,
        isFastingDay: Boolean,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): DayProperties? {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: DayPropertiesResponse =
            put(
                "/api/day-properties",
                DayPropertiesSet(date = date, isFastingDay = isFastingDay),
                key,
                editedAt,
            )
        return response.properties
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteDayProperties(
        date: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/day-properties?date=$date", key, editedAt)
    }

    // Supplement update
    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateSupplement(
        id: String,
        supplement: SupplementCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): Supplement {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: SupplementResponse = patch("/api/supplements/$id", supplement, key, editedAt)
        return response.supplement
    }

    suspend fun getSupplementHistory(
        from: String,
        to: String,
    ): SupplementHistoryResponse =
        get("/api/supplements/history") {
            parameter("from", from)
            parameter("to", to)
        }

    suspend fun getAllSupplements(): SupplementsListResponse =
        get("/api/supplements") {
            parameter("all", true)
        }

    // Supplement checklist for a date
    suspend fun getSupplementChecklist(date: String): List<SupplementChecklistItem> {
        val response: SupplementChecklistResponse = get("/api/supplements/$date/checklist")
        return response.checklist
    }

    // Sleep
    suspend fun getSleepEntries(
        from: String? = null,
        to: String? = null,
    ): List<SleepEntry> {
        val response: SleepEntriesResponse =
            get("/api/sleep") {
                from?.let { parameter("from", it) }
                to?.let { parameter("to", it) }
            }
        return response.propertyEntries
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun createSleepEntry(
        entry: SleepCreate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): SleepEntry {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: SleepEntryResponse = post("/api/sleep", entry, key, editedAt)
        return response.entry
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun updateSleepEntry(
        id: String,
        entry: SleepUpdate,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ): SleepEntry {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        val response: SleepEntryResponse = patch("/api/sleep/$id", entry, key, editedAt)
        return response.entry
    }

    @OptIn(ExperimentalUuidApi::class)
    suspend fun deleteSleepEntry(
        id: String,
        idempotencyKey: String? = null,
        clientEditedAt: String? = null,
    ) {
        val key = idempotencyKey ?: Uuid.random().toString()
        val editedAt = clientEditedAt ?: Clock.System.now().toString()
        delete("/api/sleep/$id", key, editedAt)
    }

    // Analytics
    suspend fun getSleepFoodCorrelation(
        startDate: String,
        endDate: String,
    ): List<SleepFoodCorrelationEntry> {
        val response: SleepFoodCorrelationResponse =
            get("/api/analytics/sleep-food") {
                parameter("startDate", startDate)
                parameter("endDate", endDate)
            }
        return response.data
    }

    suspend fun getAnalyticsFoodDiversity(
        startDate: String,
        endDate: String,
    ): FoodDiversityResponse =
        get("/api/analytics/food-diversity") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getAnalyticsMealTiming(
        startDate: String,
        endDate: String,
    ): MealTimingResponse =
        get("/api/analytics/meal-timing") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getAnalyticsNutrientsDaily(
        startDate: String,
        endDate: String,
    ): NutrientsDailyResponse =
        get("/api/analytics/nutrients-daily") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getAnalyticsNutrientsExtended(
        startDate: String,
        endDate: String,
    ): NutrientsExtendedResponse =
        get("/api/analytics/nutrients-extended") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getAnalyticsWeightFood(
        startDate: String,
        endDate: String,
    ): WeightFoodResponse =
        get("/api/analytics/weight-food") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getAnalyticsSleepFood(
        startDate: String,
        endDate: String,
    ): SleepFoodCorrelationResponse =
        get("/api/analytics/sleep-food") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    // Images
    suspend fun uploadImage(
        fileName: String,
        fileBytes: ByteArray,
        contentType: String = "image/jpeg",
    ): String {
        val response =
            client.submitFormWithBinaryData(
                url = "/api/images/upload",
                formData =
                    formData {
                        append(
                            "file",
                            fileBytes,
                            Headers.build {
                                append(HttpHeaders.ContentType, contentType)
                                append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
                            },
                        )
                    },
            )
        if (!response.status.isSuccess()) {
            throw ApiException(
                "POST /api/images/upload failed: HTTP ${response.status.value} ${response.bodyAsText()}",
                response.status.value,
            )
        }
        val body: ImageUploadResponse = response.body()
        return body.imageUrl
    }

    suspend fun downloadBytes(url: String): ByteArray {
        val response = client.get(url)
        if (!response.status.isSuccess()) {
            throw ApiException("GET $url failed: HTTP ${response.status.value}", response.status.value)
        }
        return response.body()
    }
}

class UnauthorizedException : Exception("Not authenticated")
