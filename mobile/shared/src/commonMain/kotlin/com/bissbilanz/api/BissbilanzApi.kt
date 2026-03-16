package com.bissbilanz.api

import com.bissbilanz.auth.AuthManager
import com.bissbilanz.createHttpEngine
import com.bissbilanz.model.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.auth.*
import io.ktor.client.plugins.auth.providers.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

class ApiException(
    message: String,
    val statusCode: Int = 0,
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
            )
        }
        return response.body()
    }

    private suspend inline fun <reified T> post(
        path: String,
        body: Any,
        block: HttpRequestBuilder.() -> Unit = {},
    ): T {
        val response =
            client.post(path) {
                setBody(body)
                block()
            }
        if (!response.status.isSuccess()) {
            throw ApiException(
                "POST $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
                response.status.value,
            )
        }
        return response.body()
    }

    private suspend inline fun <reified T> put(
        path: String,
        body: Any,
    ): T {
        val response =
            client.put(path) {
                setBody(body)
            }
        if (!response.status.isSuccess()) {
            throw ApiException(
                "PUT $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
                response.status.value,
            )
        }
        return response.body()
    }

    private suspend fun delete(path: String) {
        val response = client.delete(path)
        if (!response.status.isSuccess()) {
            throw ApiException(
                "DELETE $path failed: HTTP ${response.status.value} ${response.bodyAsText()}",
                response.status.value,
            )
        }
    }

    fun close() {
        client.close()
    }

    // Foods
    suspend fun getFoods(
        limit: Int = 100,
        offset: Int = 0,
    ): List<Food> {
        val response: FoodsResponse =
            get("/api/foods") {
                parameter("limit", limit)
                parameter("offset", offset)
            }
        return response.foods
    }

    suspend fun getFood(id: String): Food {
        val response: FoodResponse = get("/api/foods/$id")
        return response.food ?: throw ApiException("Expected food in response but got null")
    }

    suspend fun createFood(food: FoodCreate): Food {
        val response: FoodResponse = post("/api/foods", food)
        return response.food ?: throw ApiException("Expected food in response but got null")
    }

    suspend fun updateFood(
        id: String,
        food: FoodCreate,
    ): Food {
        val response: FoodResponse = put("/api/foods/$id", food)
        return response.food ?: throw ApiException("Expected food in response but got null")
    }

    suspend fun deleteFood(id: String) = delete("/api/foods/$id")

    suspend fun searchFoods(query: String): List<Food> {
        val response: FoodsResponse = get("/api/foods") { parameter("q", query) }
        return response.foods
    }

    suspend fun getRecentFoods(limit: Int = 20): List<Food> {
        val response: FoodsResponse = get("/api/foods/recent") { parameter("limit", limit) }
        return response.foods
    }

    suspend fun getFavorites(): List<Food> {
        val response: FoodsResponse = get("/api/favorites") { parameter("type", "foods") }
        return response.foods
    }

    suspend fun getFoodByBarcode(barcode: String): Food? =
        try {
            val response: FoodResponse = get("/api/foods") { parameter("barcode", barcode) }
            response.food
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            null
        }

    // Entries
    suspend fun getEntries(date: String): List<Entry> {
        val response: EntriesResponse = get("/api/entries") { parameter("date", date) }
        return response.entries
    }

    suspend fun createEntry(entry: EntryCreate): Entry {
        val response: EntryResponse = post("/api/entries", entry)
        return response.entry
    }

    suspend fun updateEntry(
        id: String,
        entry: EntryUpdate,
    ): Entry {
        val response: EntryResponse = put("/api/entries/$id", entry)
        return response.entry
    }

    suspend fun deleteEntry(id: String) = delete("/api/entries/$id")

    // Recipes
    suspend fun getRecipes(): List<Recipe> {
        val response: RecipesResponse = get("/api/recipes")
        return response.recipes
    }

    suspend fun getRecipe(id: String): Recipe {
        val response: RecipeResponse = get("/api/recipes/$id")
        return response.recipe
    }

    suspend fun createRecipe(recipe: RecipeCreate): Recipe {
        val response: RecipeResponse = post("/api/recipes", recipe)
        return response.recipe
    }

    suspend fun updateRecipe(
        id: String,
        recipe: RecipeUpdate,
    ): Recipe {
        val response: RecipeResponse = put("/api/recipes/$id", recipe)
        return response.recipe
    }

    suspend fun deleteRecipe(id: String) = delete("/api/recipes/$id")

    // Goals
    suspend fun getGoals(): Goals? =
        try {
            val response: GoalsResponse = get("/api/goals")
            response.goals
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            null
        }

    suspend fun setGoals(goals: Goals): Goals {
        val response: GoalsResponse = put("/api/goals", goals)
        return response.goals ?: throw ApiException("Expected goals in response but got null")
    }

    // Weight
    suspend fun getWeightEntries(limit: Int = 30): List<WeightEntry> {
        val response: WeightEntriesResponse = get("/api/weight") { parameter("limit", limit) }
        return response.entries
    }

    suspend fun createWeightEntry(entry: WeightCreate): WeightEntry {
        val response: WeightEntryResponse = post("/api/weight", entry)
        return response.entry
    }

    suspend fun updateWeightEntry(
        id: String,
        entry: WeightUpdate,
    ): WeightEntry {
        val response: WeightEntryResponse = put("/api/weight/$id", entry)
        return response.entry
    }

    suspend fun deleteWeightEntry(id: String) = delete("/api/weight/$id")

    suspend fun getWeightTrend(
        from: String,
        to: String,
    ): List<WeightTrendEntry> {
        val response: WeightTrendResponse =
            get("/api/weight") {
                parameter("from", from)
                parameter("to", to)
            }
        return response.data
    }

    // Supplements
    suspend fun getSupplements(): List<Supplement> {
        val response: SupplementsResponse = get("/api/supplements")
        return response.supplements
    }

    suspend fun createSupplement(supplement: SupplementCreate): Supplement {
        val response: SupplementResponse = post("/api/supplements", supplement)
        return response.supplement
    }

    suspend fun deleteSupplement(id: String) = delete("/api/supplements/$id")

    suspend fun logSupplement(
        supplementId: String,
        date: String? = null,
    ): SupplementLog {
        val response: SupplementLogResponse = post("/api/supplements/$supplementId/log", mapOf("date" to date))
        return response.log
    }

    suspend fun unlogSupplement(
        supplementId: String,
        date: String,
    ) = delete("/api/supplements/$supplementId/log?date=$date")

    // Stats
    suspend fun getDailyStats(
        startDate: String,
        endDate: String,
    ): DailyStatsResponse =
        get("/api/stats/daily") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getWeeklyStats(): WeeklyMonthlyStatsResponse = get("/api/stats/weekly")

    suspend fun getMonthlyStats(): WeeklyMonthlyStatsResponse = get("/api/stats/monthly")

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

    suspend fun updatePreferences(prefs: PreferencesUpdate): Preferences {
        val response: PreferencesResponse = put("/api/preferences", prefs)
        return response.preferences
    }

    // Meal types
    suspend fun getMealTypes(): MealTypesResponse = get("/api/meal-types")

    suspend fun createMealType(mealType: MealTypeCreate): MealType = post("/api/meal-types", mealType)

    // Copy entries
    suspend fun copyEntries(
        fromDate: String,
        toDate: String,
    ): CopyEntriesResponse =
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

    suspend fun setDayProperties(
        date: String,
        isFastingDay: Boolean,
    ): DayProperties? {
        val response: DayPropertiesResponse =
            put(
                "/api/day-properties",
                DayPropertiesSet(date = date, isFastingDay = isFastingDay),
            )
        return response.properties
    }

    suspend fun deleteDayProperties(date: String) = delete("/api/day-properties?date=$date")

    // Supplement update
    suspend fun updateSupplement(
        id: String,
        supplement: SupplementCreate,
    ): Supplement {
        val response: SupplementResponse = put("/api/supplements/$id", supplement)
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

    suspend fun getAllSupplements(): SupplementsResponse =
        get("/api/supplements") {
            parameter("all", true)
        }

    // Supplement checklist for a date
    suspend fun getSupplementChecklist(date: String): List<SupplementLog> {
        val response: SupplementChecklistResponse = get("/api/supplements/$date/checklist")
        return response.checklist
    }
}

class UnauthorizedException : Exception("Not authenticated")
