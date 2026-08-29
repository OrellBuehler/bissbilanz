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
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
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
            val account = api.getAccount()
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
            val createdOn = account.user.createdAt?.take(10)
            // The account's own dated rows bound the download, NOT its creation
            // date: entry/sleep/weight/day dates are client-chosen, so imported
            // or backfilled days legitimately predate the account, and a device
            // running ahead of UTC can log a day past the server's "today".
            val floor = listOfNotNull(account.dataRange.earliest, createdOn).minOrNull() ?: FALLBACK_FLOOR
            val ceiling = maxOf(account.dataRange.latest ?: today, today)

            onProgress(DownloadStep.FOODS)
            downloadFoods()
            onProgress(DownloadStep.RECIPES)
            downloadRecipes()
            onProgress(DownloadStep.SUPPLEMENTS)
            downloadSupplements()
            onProgress(DownloadStep.ENTRIES)
            downloadDatedCollections(floor, ceiling)
            onProgress(DownloadStep.MEASUREMENTS)
            downloadWeight()
            onProgress(DownloadStep.SETTINGS)
            downloadGoals()
            downloadPreferences()
        }
    }

    /**
     * Deletes the server account and flips the app to Local mode. The local
     * database is left untouched — it is now the primary store.
     *
     * The mode flip happens BEFORE the irreversible delete: if the delete
     * succeeds but the process dies (or a later step throws) the app must never
     * be left in [AppMode.SYNCED] talking to an account that no longer exists —
     * from there the user's obvious next move, signing out, wipes the very data
     * the download just rescued. A failed delete restores the previous mode, so
     * the only state that survives an error is the one the user started in.
     */
    suspend fun finalize() {
        val previousMode = appModeManager.mode.value
        appModeManager.setMode(AppMode.LOCAL)
        try {
            api.deleteAccount()
        } catch (e: Throwable) {
            if (previousMode == null) appModeManager.clear() else appModeManager.setMode(previousMode)
            throw e
        }
        // The account is gone; the local store is now primary. Nothing below may
        // fail the downgrade — a stale queue row or session token is recoverable,
        // reporting failure here is not.
        runCatching { syncQueue.clear() }
        runCatching { authManager.logout() }
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
            val localized = page.map { it.copy(imageUrl = localizedImageUrl(it.imageUrl)) }
            queries.transaction {
                for (food in localized) {
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
            }
            if (page.size < PAGE_SIZE) break
            offset += PAGE_SIZE
        }
    }

    private suspend fun downloadRecipes() {
        val queries = db.userDataDatabaseQueries
        val summaries = api.getRecipes()
        // Details carry the ingredient list — required for local editing. One
        // request per recipe is unavoidable, so run them in small parallel
        // batches instead of a strictly sequential walk.
        for (batch in summaries.chunked(DETAIL_CONCURRENCY)) {
            val details =
                coroutineScope {
                    batch
                        .map { summary -> async { api.getRecipe(summary.id) } }
                        .awaitAll()
                        .map { it.copy(imageUrl = localizedImageUrl(it.imageUrl)) }
                }
            queries.transaction {
                for (recipe in details) {
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
        }
    }

    private suspend fun downloadSupplements() {
        val queries = db.userDataDatabaseQueries
        // `all=true`: the default list is active-only, and archived supplements
        // are just as unrecoverable as any other row once the account is gone.
        val supplements = api.getAllSupplements().supplements
        queries.transaction {
            for (supplement in supplements) {
                queries.insertSupplement(
                    id = supplement.id,
                    name = supplement.name,
                    isActive = if (supplement.isActive) 1L else 0L,
                    sortOrder = supplement.sortOrder.toLong(),
                    jsonData = json.encodeToString(supplement),
                )
            }
        }
    }

    /**
     * Entries, supplement logs, sleep and day properties in one walk over the
     * date range — they share the same windows, so four separate walks would
     * only quadruple the round trips.
     */
    private suspend fun downloadDatedCollections(
        floor: String,
        ceiling: String,
    ) {
        val queries = db.userDataDatabaseQueries
        forEachWindow(floor, ceiling) { from, to ->
            val entries = api.getEntriesRange(from, to)
            val supplementLogs = api.getSupplementHistory(from, to).history
            val sleep = api.getSleepEntries(from, to)
            val days = api.getDayPropertiesRange(from, to)
            queries.transaction {
                for (item in entries) {
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
                for (log in supplementLogs) {
                    queries.insertSupplementLog(
                        // Same synthesized key as SupplementRepository's cache rows
                        id = "${log.supplementId}-${log.date}",
                        supplementId = log.supplementId,
                        date = log.date,
                        takenAt = log.takenAt,
                    )
                }
                for (entry in sleep) {
                    queries.insertSleepEntry(
                        id = entry.id,
                        entryDate = entry.entryDate,
                        durationMinutes = entry.durationMinutes.toLong(),
                        quality = entry.quality.toLong(),
                        loggedAt = entry.loggedAt,
                        jsonData = json.encodeToString(entry),
                    )
                }
                for (day in days) {
                    queries.upsertDayProperties(
                        date = day.date,
                        isFastingDay = if (day.isFastingDay) 1L else 0L,
                    )
                }
            }
        }
    }

    private suspend fun downloadWeight() {
        val queries = db.userDataDatabaseQueries
        val entries = api.getWeightEntries()
        queries.transaction {
            for (entry in entries) {
                queries.insertWeightEntry(
                    id = entry.id,
                    entryDate = entry.entryDate,
                    weightKg = entry.weightKg,
                    loggedAt = entry.loggedAt,
                    jsonData = json.encodeToString(entry),
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
        ceiling: String,
        block: suspend (from: String, to: String) -> Unit,
    ) {
        val start = LocalDate.parse(floor)
        var to = maxOf(LocalDate.parse(ceiling), start)
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
            supplementId = supplementId,
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
        private const val DETAIL_CONCURRENCY = 6

        /** Only reached when the server reports neither a creation date nor any dated row. */
        private const val FALLBACK_FLOOR = "2024-01-01"
    }
}
