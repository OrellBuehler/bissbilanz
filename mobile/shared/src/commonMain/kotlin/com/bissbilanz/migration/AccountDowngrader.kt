package com.bissbilanz.migration

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.EntryRangeItem
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.model.Entry
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.userdata.UserDataDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.todayIn
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Turns a synced account into a local-only install: downloads the complete
 * account history into the local database, then deletes the server account and
 * flips the app to [AppMode.LOCAL] — the user keeps all their data on-device.
 *
 * The inverse of [LocalDataMigrator] (which uploads local data on sign-in).
 * Because the download writes canonical server rows (real UUIDs, no temp_ ids),
 * a later sign-in simply migrates them back up through the normal migration
 * path.
 */
class AccountDowngrader(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val syncQueue: SyncQueue,
    private val authManager: AuthManager,
    private val appModeManager: AppModeManager,
    private val json: Json,
    private val photoLocalizer: PhotoLocalizer? = null,
) {
    /** Localizes a server-hosted photo so it survives account deletion. */
    fun interface PhotoLocalizer {
        /**
         * Downloads the server-relative image (an `/uploads/…` URL) and returns
         * a replacement URL (e.g. `file://…`), or null to keep the original.
         */
        suspend fun localize(imageUrl: String): String?
    }

    /** Un-uploaded writes that must be flushed before the download starts. */
    suspend fun pendingOps(): Long = syncQueue.pendingCount()

    /**
     * Downloads every collection into the local database. Idempotent — every
     * write is an upsert of canonical server state, so a failed run can simply
     * be retried. Must complete without throwing before [finalize] is called.
     */
    suspend fun downloadAll(onProgress: (DownloadStep) -> Unit = {}) {
        withContext(Dispatchers.IO) {
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
            // Account creation bounds all data — nothing can predate it.
            val floor = api.getAccount().createdAt?.take(10) ?: "2024-01-01"

            onProgress(DownloadStep.FOODS)
            downloadFoods()
            onProgress(DownloadStep.RECIPES)
            downloadRecipes()
            onProgress(DownloadStep.SUPPLEMENTS)
            downloadSupplements()
            onProgress(DownloadStep.ENTRIES)
            downloadEntries(floor, today)
            downloadSupplementLogs(floor, today)
            onProgress(DownloadStep.MEASUREMENTS)
            downloadWeight()
            downloadSleep(floor, today)
            downloadDayProperties(floor, today)
            onProgress(DownloadStep.SETTINGS)
            downloadGoals()
            downloadPreferences()
        }
    }

    /**
     * Deletes the server account and flips the app to Local mode. The local
     * database is left untouched — it is now the primary store.
     */
    suspend fun finalize() {
        api.deleteAccount()
        syncQueue.clear()
        authManager.logout()
        appModeManager.setMode(AppMode.LOCAL)
    }

    enum class DownloadStep { FOODS, RECIPES, SUPPLEMENTS, ENTRIES, MEASUREMENTS, SETTINGS }

    private suspend fun localizedImageUrl(imageUrl: String?): String? {
        if (imageUrl == null || !imageUrl.startsWith("/uploads/")) return imageUrl
        val localizer = photoLocalizer ?: return imageUrl
        return localizer.localize(imageUrl) ?: imageUrl
    }

    private suspend fun downloadFoods() {
        val queries = db.userDataDatabaseQueries
        var offset = 0
        while (true) {
            val page = api.getFoods(limit = PAGE_SIZE, offset = offset)
            for (raw in page) {
                val food = raw.copy(imageUrl = localizedImageUrl(raw.imageUrl))
                queries.insertFood(
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
            if (page.size < PAGE_SIZE) break
            offset += PAGE_SIZE
        }
    }

    private suspend fun downloadRecipes() {
        val queries = db.userDataDatabaseQueries
        for (summary in api.getRecipes()) {
            // Details carry the ingredient list — required for local editing.
            val raw = api.getRecipe(summary.id)
            val recipe = raw.copy(imageUrl = localizedImageUrl(raw.imageUrl))
            queries.insertRecipe(
                id = recipe.id,
                name = recipe.name,
                totalServings = recipe.totalServings,
                isFavorite = if (recipe.isFavorite) 1L else 0L,
                calories = recipe.calories,
                protein = recipe.protein,
                carbs = recipe.carbs,
                fat = recipe.fat,
                fiber = recipe.fiber,
                jsonData = json.encodeToString(recipe),
            )
        }
    }

    private suspend fun downloadSupplements() {
        val queries = db.userDataDatabaseQueries
        for (supplement in api.getSupplements()) {
            queries.insertSupplement(
                id = supplement.id,
                name = supplement.name,
                isActive = if (supplement.isActive) 1L else 0L,
                sortOrder = supplement.sortOrder.toLong(),
                jsonData = json.encodeToString(supplement),
            )
        }
    }

    private suspend fun downloadEntries(
        floor: String,
        today: String,
    ) {
        val queries = db.userDataDatabaseQueries
        forEachWindow(floor, today) { from, to ->
            val items = api.getEntriesRange(from, to)
            queries.transaction {
                for (item in items) {
                    val entry = item.toEntry()
                    queries.insertEntry(
                        id = entry.id,
                        date = entry.date,
                        mealType = entry.mealType,
                        servings = entry.servings,
                        foodId = entry.foodId,
                        recipeId = entry.recipeId,
                        foodName = entry.foodName,
                        calories = entry.calories ?: 0.0,
                        protein = entry.protein ?: 0.0,
                        carbs = entry.carbs ?: 0.0,
                        fat = entry.fat ?: 0.0,
                        fiber = entry.fiber ?: 0.0,
                        jsonData = json.encodeToString(entry),
                    )
                }
            }
        }
    }

    private suspend fun downloadSupplementLogs(
        floor: String,
        today: String,
    ) {
        val queries = db.userDataDatabaseQueries
        forEachWindow(floor, today) { from, to ->
            for (log in api.getSupplementHistory(from, to).history) {
                queries.insertSupplementLog(
                    // Same synthesized key as SupplementRepository's cache rows
                    id = "${log.supplementId}-${log.date}",
                    supplementId = log.supplementId,
                    date = log.date,
                    takenAt = log.takenAt,
                )
            }
        }
    }

    private suspend fun downloadWeight() {
        val queries = db.userDataDatabaseQueries
        for (entry in api.getWeightEntries()) {
            queries.insertWeightEntry(
                id = entry.id,
                entryDate = entry.entryDate,
                weightKg = entry.weightKg,
                loggedAt = entry.loggedAt,
                jsonData = json.encodeToString(entry),
            )
        }
    }

    private suspend fun downloadSleep(
        floor: String,
        today: String,
    ) {
        val queries = db.userDataDatabaseQueries
        forEachWindow(floor, today) { from, to ->
            for (entry in api.getSleepEntries(from, to)) {
                queries.insertSleepEntry(
                    id = entry.id,
                    entryDate = entry.entryDate,
                    durationMinutes = entry.durationMinutes.toLong(),
                    quality = entry.quality.toLong(),
                    loggedAt = entry.loggedAt,
                    jsonData = json.encodeToString(entry),
                )
            }
        }
    }

    private suspend fun downloadDayProperties(
        floor: String,
        today: String,
    ) {
        val queries = db.userDataDatabaseQueries
        forEachWindow(floor, today) { from, to ->
            for (day in api.getDayPropertiesRange(from, to)) {
                queries.upsertDayProperties(
                    date = day.date,
                    isFastingDay = if (day.isFastingDay) 1L else 0L,
                )
            }
        }
    }

    private suspend fun downloadGoals() {
        val goals = api.getGoals() ?: return
        db.userDataDatabaseQueries.insertGoals(
            calorieGoal = goals.calorieGoal,
            proteinGoal = goals.proteinGoal,
            carbGoal = goals.carbGoal,
            fatGoal = goals.fatGoal,
            fiberGoal = goals.fiberGoal,
        )
    }

    private suspend fun downloadPreferences() {
        val preferences = api.getPreferences()
        db.userDataDatabaseQueries.insertPreferences(json.encodeToString(preferences))
    }

    /** Runs [block] over the range in windows the server accepts (≤366 days). */
    private suspend fun forEachWindow(
        floor: String,
        today: String,
        block: suspend (from: String, to: String) -> Unit,
    ) {
        var to = LocalDate.parse(today)
        val start = LocalDate.parse(floor)
        while (to >= start) {
            val from = maxOf(to.minus(DatePeriod(days = WINDOW_DAYS - 1)), start)
            block(from.toString(), to.toString())
            to = from.minus(DatePeriod(days = 1))
        }
    }

    private fun EntryRangeItem.toEntry(): Entry =
        Entry(
            id = id,
            foodId = foodId,
            recipeId = recipeId,
            date = date,
            mealType = mealType,
            servings = servings,
            notes = notes,
            quickName = quickName,
            quickCalories = quickCalories,
            quickProtein = quickProtein,
            quickCarbs = quickCarbs,
            quickFat = quickFat,
            quickFiber = quickFiber,
            quickNutrients = quickNutrients,
            eatenAt = eatenAt,
            foodName = foodName,
            calories = calories,
            protein = protein,
            carbs = carbs,
            fat = fat,
            fiber = fiber,
            servingSize = servingSize,
            servingUnit = servingUnit,
        )

    companion object {
        private const val PAGE_SIZE = 200
        private const val WINDOW_DAYS = 360
    }
}
