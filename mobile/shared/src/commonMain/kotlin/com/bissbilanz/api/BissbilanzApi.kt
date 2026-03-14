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
    ): List<Food> {
        val response: FoodsResponse =
            authenticatedGet("/api/foods") {
                parameter("limit", limit)
                parameter("offset", offset)
            }
        return response.foods
    }

    suspend fun getFood(id: String): Food {
        val response: FoodResponse = authenticatedGet("/api/foods/$id")
        return response.food!!
    }

    suspend fun createFood(food: FoodCreate): Food {
        val response: FoodResponse = authenticatedPost("/api/foods", food)
        return response.food!!
    }

    suspend fun updateFood(
        id: String,
        food: FoodCreate,
    ): Food {
        val response: FoodResponse = authenticatedPut("/api/foods/$id", food)
        return response.food!!
    }

    suspend fun deleteFood(id: String) = authenticatedDelete("/api/foods/$id")

    suspend fun searchFoods(query: String): List<Food> {
        val response: FoodsResponse = authenticatedGet("/api/foods") { parameter("q", query) }
        return response.foods
    }

    suspend fun getRecentFoods(limit: Int = 20): List<Food> {
        val response: FoodsResponse = authenticatedGet("/api/foods/recent") { parameter("limit", limit) }
        return response.foods
    }

    suspend fun getFavorites(): List<Food> {
        val response: FoodsResponse = authenticatedGet("/api/favorites") { parameter("type", "foods") }
        return response.foods
    }

    suspend fun getFoodByBarcode(barcode: String): Food? =
        try {
            val response: FoodResponse = authenticatedGet("/api/foods") { parameter("barcode", barcode) }
            response.food
        } catch (_: Exception) {
            null
        }

    // Entries
    suspend fun getEntries(date: String): List<Entry> {
        val response: EntriesResponse = authenticatedGet("/api/entries") { parameter("date", date) }
        return response.entries
    }

    suspend fun createEntry(entry: EntryCreate): Entry {
        val response: EntryResponse = authenticatedPost("/api/entries", entry)
        return response.entry
    }

    suspend fun updateEntry(
        id: String,
        entry: EntryUpdate,
    ): Entry {
        val response: EntryResponse = authenticatedPut("/api/entries/$id", entry)
        return response.entry
    }

    suspend fun deleteEntry(id: String) = authenticatedDelete("/api/entries/$id")

    // Recipes
    suspend fun getRecipes(): List<Recipe> {
        val response: RecipesResponse = authenticatedGet("/api/recipes")
        return response.recipes
    }

    suspend fun getRecipe(id: String): Recipe {
        val response: RecipeResponse = authenticatedGet("/api/recipes/$id")
        return response.recipe
    }

    suspend fun createRecipe(recipe: RecipeCreate): Recipe {
        val response: RecipeResponse = authenticatedPost("/api/recipes", recipe)
        return response.recipe
    }

    suspend fun updateRecipe(
        id: String,
        recipe: RecipeUpdate,
    ): Recipe {
        val response: RecipeResponse = authenticatedPut("/api/recipes/$id", recipe)
        return response.recipe
    }

    suspend fun deleteRecipe(id: String) = authenticatedDelete("/api/recipes/$id")

    // Goals
    suspend fun getGoals(): Goals? =
        try {
            val response: GoalsResponse = authenticatedGet("/api/goals")
            response.goals
        } catch (_: Exception) {
            null
        }

    suspend fun setGoals(goals: Goals): Goals {
        val response: GoalsResponse = authenticatedPut("/api/goals", goals)
        return response.goals!!
    }

    // Weight
    suspend fun getWeightEntries(limit: Int = 30): List<WeightEntry> {
        val response: WeightEntriesResponse = authenticatedGet("/api/weight") { parameter("limit", limit) }
        return response.entries
    }

    suspend fun createWeightEntry(entry: WeightCreate): WeightEntry {
        val response: WeightEntryResponse = authenticatedPost("/api/weight", entry)
        return response.entry
    }

    suspend fun updateWeightEntry(
        id: String,
        entry: WeightUpdate,
    ): WeightEntry {
        val response: WeightEntryResponse = authenticatedPut("/api/weight/$id", entry)
        return response.entry
    }

    suspend fun deleteWeightEntry(id: String) = authenticatedDelete("/api/weight/$id")

    // Supplements
    suspend fun getSupplements(): List<Supplement> {
        val response: SupplementsResponse = authenticatedGet("/api/supplements")
        return response.supplements
    }

    suspend fun createSupplement(supplement: SupplementCreate): Supplement {
        val response: SupplementResponse = authenticatedPost("/api/supplements", supplement)
        return response.supplement
    }

    suspend fun deleteSupplement(id: String) = authenticatedDelete("/api/supplements/$id")

    suspend fun logSupplement(
        supplementId: String,
        date: String? = null,
    ): SupplementLog {
        val response: SupplementLogResponse = authenticatedPost("/api/supplements/$supplementId/log", mapOf("date" to date))
        return response.log
    }

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

    suspend fun getMealBreakdown(
        startDate: String,
        endDate: String,
    ): MealBreakdownResponse =
        authenticatedGet("/api/stats/meal-breakdown") {
            parameter("startDate", startDate)
            parameter("endDate", endDate)
        }

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

    suspend fun updatePreferences(prefs: PreferencesUpdate): Preferences {
        val response: PreferencesResponse = authenticatedPut("/api/preferences", prefs)
        return response.preferences
    }

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
    ): Supplement {
        val response: SupplementResponse = authenticatedPut("/api/supplements/$id", supplement)
        return response.supplement
    }

    suspend fun getSupplementHistory(
        from: String,
        to: String,
    ): SupplementHistoryResponse =
        authenticatedGet("/api/supplements/history") {
            parameter("from", from)
            parameter("to", to)
        }

    suspend fun getAllSupplements(): SupplementsResponse =
        authenticatedGet("/api/supplements") {
            parameter("all", true)
        }

    // Supplement checklist for a date
    suspend fun getSupplementChecklist(date: String): List<SupplementLog> {
        val response: SupplementChecklistResponse = authenticatedGet("/api/supplements/$date/checklist")
        return response.checklist
    }
}

class UnauthorizedException : Exception("Not authenticated")
