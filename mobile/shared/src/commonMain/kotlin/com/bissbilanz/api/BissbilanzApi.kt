package com.bissbilanz.api

import com.bissbilanz.auth.AuthManager
import com.bissbilanz.createHttpEngine
import com.bissbilanz.model.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

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
            defaultRequest {
                url(baseUrl)
                contentType(ContentType.Application.Json)
            }
        }

    private suspend fun HttpRequestBuilder.authorize() {
        val token = authManager.getAccessToken() ?: throw UnauthorizedException()
        header(HttpHeaders.Authorization, "Bearer $token")
    }

    private suspend inline fun <reified T> authenticatedGet(
        path: String,
        block: HttpRequestBuilder.() -> Unit = {},
    ): T {
        val response =
            client.get(path) {
                authorize()
                block()
            }
        if (response.status == HttpStatusCode.Unauthorized) {
            if (authManager.refreshToken()) {
                val retry =
                    client.get(path) {
                        authorize()
                        block()
                    }
                return retry.body()
            }
            throw UnauthorizedException()
        }
        return response.body()
    }

    private suspend inline fun <reified T> authenticatedPost(
        path: String,
        body: Any,
        block: HttpRequestBuilder.() -> Unit = {},
    ): T {
        val response =
            client.post(path) {
                authorize()
                setBody(body)
                block()
            }
        if (response.status == HttpStatusCode.Unauthorized) {
            if (authManager.refreshToken()) {
                val retry =
                    client.post(path) {
                        authorize()
                        setBody(body)
                        block()
                    }
                return retry.body()
            }
            throw UnauthorizedException()
        }
        return response.body()
    }

    private suspend inline fun <reified T> authenticatedPut(
        path: String,
        body: Any,
    ): T {
        val response =
            client.put(path) {
                authorize()
                setBody(body)
            }
        if (response.status == HttpStatusCode.Unauthorized) {
            if (authManager.refreshToken()) {
                val retry =
                    client.put(path) {
                        authorize()
                        setBody(body)
                    }
                return retry.body()
            }
            throw UnauthorizedException()
        }
        return response.body()
    }

    private suspend fun authenticatedDelete(path: String) {
        val response = client.delete(path) { authorize() }
        if (response.status == HttpStatusCode.Unauthorized) {
            if (authManager.refreshToken()) {
                client.delete(path) { authorize() }
                return
            }
            throw UnauthorizedException()
        }
    }

    // Foods
    suspend fun getFoods(
        limit: Int = 100,
        offset: Int = 0,
    ): List<Food> =
        authenticatedGet("/api/foods") {
            parameter("limit", limit)
            parameter("offset", offset)
        }

    suspend fun getFood(id: String): Food = authenticatedGet("/api/foods/$id")

    suspend fun createFood(food: FoodCreate): Food = authenticatedPost("/api/foods", food)

    suspend fun updateFood(
        id: String,
        food: FoodCreate,
    ): Food = authenticatedPut("/api/foods/$id", food)

    suspend fun deleteFood(id: String) = authenticatedDelete("/api/foods/$id")

    suspend fun searchFoods(query: String): List<Food> = authenticatedGet("/api/foods") { parameter("search", query) }

    suspend fun getRecentFoods(limit: Int = 20): List<Food> = authenticatedGet("/api/foods/recent") { parameter("limit", limit) }

    suspend fun getFavorites(): List<Food> = authenticatedGet("/api/foods") { parameter("favorites", true) }

    suspend fun getFoodByBarcode(barcode: String): Food? =
        try {
            authenticatedGet("/api/foods") { parameter("barcode", barcode) }
        } catch (_: Exception) {
            null
        }

    // Entries
    suspend fun getEntries(date: String): List<Entry> = authenticatedGet("/api/entries") { parameter("date", date) }

    suspend fun createEntry(entry: EntryCreate): Entry = authenticatedPost("/api/entries", entry)

    suspend fun updateEntry(
        id: String,
        entry: EntryUpdate,
    ): Entry = authenticatedPut("/api/entries/$id", entry)

    suspend fun deleteEntry(id: String) = authenticatedDelete("/api/entries/$id")

    // Recipes
    suspend fun getRecipes(): List<Recipe> = authenticatedGet("/api/recipes")

    suspend fun getRecipe(id: String): Recipe = authenticatedGet("/api/recipes/$id")

    suspend fun createRecipe(recipe: RecipeCreate): Recipe = authenticatedPost("/api/recipes", recipe)

    suspend fun updateRecipe(
        id: String,
        recipe: RecipeUpdate,
    ): Recipe = authenticatedPut("/api/recipes/$id", recipe)

    suspend fun deleteRecipe(id: String) = authenticatedDelete("/api/recipes/$id")

    // Goals
    suspend fun getGoals(): Goals? =
        try {
            authenticatedGet("/api/goals")
        } catch (_: Exception) {
            null
        }

    suspend fun setGoals(goals: Goals): Goals = authenticatedPut("/api/goals", goals)

    // Weight
    suspend fun getWeightEntries(limit: Int = 30): List<WeightEntry> = authenticatedGet("/api/weight") { parameter("limit", limit) }

    suspend fun createWeightEntry(entry: WeightCreate): WeightEntry = authenticatedPost("/api/weight", entry)

    suspend fun updateWeightEntry(
        id: String,
        entry: WeightUpdate,
    ): WeightEntry = authenticatedPut("/api/weight/$id", entry)

    suspend fun deleteWeightEntry(id: String) = authenticatedDelete("/api/weight/$id")

    // Supplements
    suspend fun getSupplements(): List<Supplement> = authenticatedGet("/api/supplements")

    suspend fun createSupplement(supplement: SupplementCreate): Supplement = authenticatedPost("/api/supplements", supplement)

    suspend fun deleteSupplement(id: String) = authenticatedDelete("/api/supplements/$id")

    suspend fun logSupplement(
        supplementId: String,
        date: String? = null,
    ): SupplementLog = authenticatedPost("/api/supplements/$supplementId/log", mapOf("date" to date))

    suspend fun unlogSupplement(
        supplementId: String,
        date: String,
    ) = authenticatedDelete("/api/supplements/$supplementId/log?date=$date")

    // Stats
    suspend fun getDailyStats(
        startDate: String,
        endDate: String,
    ): DailyStatsResponse =
        authenticatedGet("/api/stats/daily") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

    suspend fun getWeeklyStats(): WeeklyMonthlyStatsResponse = authenticatedGet("/api/stats/weekly")

    suspend fun getMonthlyStats(): WeeklyMonthlyStatsResponse = authenticatedGet("/api/stats/monthly")

    suspend fun getMealBreakdown(date: String): MealBreakdownResponse =
        authenticatedGet("/api/stats/meal-breakdown") { parameter("date", date) }

    suspend fun getStreaks(): StreaksResponse = authenticatedGet("/api/stats/streaks")

    suspend fun getTopFoods(
        days: Int = 7,
        limit: Int = 10,
    ): TopFoodsResponse =
        authenticatedGet("/api/stats/top-foods") {
            parameter("days", days)
            parameter("limit", limit)
        }

    // Preferences
    suspend fun getPreferences(): Preferences {
        val response: PreferencesResponse = authenticatedGet("/api/preferences")
        return response.preferences
    }

    suspend fun updatePreferences(prefs: PreferencesUpdate): Preferences = authenticatedPut("/api/preferences", prefs)

    // Meal types
    suspend fun getMealTypes(): MealTypesResponse = authenticatedGet("/api/meal-types")

    suspend fun createMealType(mealType: MealTypeCreate): MealType = authenticatedPost("/api/meal-types", mealType)

    // Copy entries
    suspend fun copyEntries(
        fromDate: String,
        toDate: String,
    ): CopyEntriesResponse =
        authenticatedPost("/api/entries/copy", mapOf<String, String>()) {
            parameter("fromDate", fromDate)
            parameter("toDate", toDate)
        }

    // Calendar
    suspend fun getCalendarStats(month: String): CalendarResponse = authenticatedGet("/api/stats/calendar") { parameter("month", month) }

    // Maintenance
    suspend fun getMaintenanceCalories(
        startDate: String,
        endDate: String,
        muscleRatio: Double = 0.3,
    ): MaintenanceResponse =
        authenticatedGet("/api/maintenance") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
            parameter("muscleRatio", muscleRatio)
        }

    // Supplement update
    suspend fun updateSupplement(
        id: String,
        supplement: SupplementCreate,
    ): Supplement = authenticatedPut("/api/supplements/$id", supplement)

    // Supplement checklist for a date
    suspend fun getSupplementChecklist(date: String): List<SupplementLog> = authenticatedGet("/api/supplements/$date/checklist")
}

class UnauthorizedException : Exception("Not authenticated")
