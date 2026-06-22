package com.bissbilanz.migration

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.FavoriteMealTimeframeInput
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.Goals
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.api.generated.model.PreferencesUpdate
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeIngredientInput
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.api.generated.model.SleepCreate
import com.bissbilanz.api.generated.model.SleepEntry
import com.bissbilanz.api.generated.model.Supplement
import com.bissbilanz.api.generated.model.SupplementBackingFood
import com.bissbilanz.api.generated.model.SupplementCreate
import com.bissbilanz.api.generated.model.SupplementIngredient
import com.bissbilanz.api.generated.model.SupplementIngredientInput
import com.bissbilanz.api.generated.model.WeightCreate
import com.bissbilanz.api.generated.model.WeightEntry
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.cache.LocalDataWiper
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.model.Entry
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.userdata.CachedEntry
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/** What would be uploaded by [LocalDataMigrator.migrate], counted from the local cache. */
data class MigrationPlan(
    val foods: Int,
    val recipes: Int,
    val entries: Int,
    val weights: Int,
    val sleepEntries: Int,
    val supplements: Int,
    val supplementLogs: Int,
    val dayProperties: Int,
    val hasGoals: Boolean,
    val hasPreferences: Boolean,
) {
    val total: Int
        get() =
            foods + recipes + entries + weights + sleepEntries + supplements +
                supplementLogs + dayProperties + (if (hasGoals) 1 else 0) + (if (hasPreferences) 1 else 0)
}

sealed class MigrationState {
    data object Idle : MigrationState()

    /** [step] is a stable key (see LocalDataMigrator.STEP_*) so the UI can localize labels. */
    data class Running(
        val done: Int,
        val total: Int,
        val step: String,
    ) : MigrationState()

    data object Completed : MigrationState()

    data class Failed(
        val message: String,
    ) : MigrationState()
}

/**
 * One-shot upload of the local (anonymous) cache state to a freshly logged-in account.
 *
 * Algorithm:
 * 1. Defensively clear the sync queue (it must already be empty in Local mode; queued
 *    ops would double-apply what this migrator uploads from the cache state).
 * 2. Normalize: every local row whose id does NOT start with `temp_` is re-keyed to a
 *    fresh `temp_` UUID. Such rows are stale leftovers from an earlier synced session
 *    (logout does not wipe the cache) but they are still the user's local data.
 *    References are rewritten together with the row: `CachedEntry.foodId/recipeId`
 *    (column AND the embedded ids inside `jsonData`), recipe ingredient `foodId`s,
 *    supplement ingredient `foodId`s and supplement log `supplementId`s. After this
 *    pass the invariant "`temp_` prefix == not yet uploaded" holds, which is what makes
 *    a failed run resumable. Normalization runs once per migration attempt cycle — a
 *    marker row in `SyncMeta` skips it on retries so rows that already received server
 *    ids from a partial run are not re-keyed (and re-uploaded) again. The marker is
 *    cleared on success, by [discardLocalData] and by [resetNormalization] (called when
 *    an attempt cycle is abandoned).
 * 3. Upload in dependency order — foods, recipes, entries, weights, sleep, supplements,
 *    supplement logs, goals, preferences, day properties. After every successful create
 *    the local row is immediately replaced with the server record and all local
 *    references to the old temp id are rewritten to the server id. Recipe/supplement
 *    ingredients and entry food/recipe references therefore always point at server ids
 *    by the time their owning row is uploaded, even when resuming a failed run.
 *    Dangling references (e.g. an entry whose food was deleted locally) still carry a
 *    `temp_` id at upload time: entries fall back to a quick entry built from the
 *    cached display values, recipe/supplement ingredients are dropped.
 * 4. Only after everything succeeded the mode flips to [AppMode.SYNCED] and the state
 *    becomes [MigrationState.Completed].
 * 5. Any failure aborts the run ([MigrationState.Failed]) with all partial progress
 *    preserved locally — already-uploaded rows have server ids, so calling [migrate]
 *    again resumes by uploading only the remaining `temp_` rows. Goals, preferences and
 *    day properties have no ids; they are idempotent set-calls and simply re-run.
 */
class LocalDataMigrator(
    private val db: UserDataDatabase,
    private val cacheDb: BissbilanzDatabase,
    private val api: BissbilanzApi,
    private val json: Json,
    private val appModeManager: AppModeManager,
    private val syncQueue: SyncQueue,
    private val errorReporter: ErrorReporter,
    private val localDataWiper: LocalDataWiper,
) {
    private val _state = MutableStateFlow<MigrationState>(MigrationState.Idle)
    val state: StateFlow<MigrationState> = _state.asStateFlow()

    private val migrateMutex = Mutex()

    private val queries get() = db.userDataDatabaseQueries
    private val cacheQueries get() = cacheDb.bissbilanzDatabaseQueries

    /** Counts the local rows that [migrate] would upload. */
    fun plan(): MigrationPlan =
        MigrationPlan(
            foods = queries.selectAllFoods().executeAsList().size,
            recipes = queries.selectAllRecipes().executeAsList().size,
            entries = queries.selectAllEntries().executeAsList().size,
            weights = queries.selectAllWeightEntries().executeAsList().size,
            sleepEntries = queries.selectAllSleepEntries().executeAsList().size,
            supplements = queries.selectAllSupplements().executeAsList().size,
            supplementLogs = queries.selectAllSupplementLogs().executeAsList().size,
            dayProperties = queries.selectAllDayProperties().executeAsList().size,
            hasGoals = queries.selectGoals().executeAsOneOrNull() != null,
            hasPreferences = queries.selectPreferences().executeAsOneOrNull() != null,
        )

    /** True when the account already has foods or logged entries (cheap API checks). */
    suspend fun serverHasData(): Boolean {
        if (api.getFoodsPaginated(limit = 1, offset = 0).total > 0) return true
        return api.getRecentFoods(limit = 1).isNotEmpty()
    }

    /** Uploads the local cache state to the account. Safe to call again after a failure. */
    suspend fun migrate() {
        if (!migrateMutex.tryLock()) return
        try {
            runMigration()
        } finally {
            migrateMutex.unlock()
        }
    }

    /**
     * Wipes all local user data and the sync queue (the user chose "start fresh"),
     * then flips the mode to [AppMode.SYNCED].
     */
    suspend fun discardLocalData() {
        localDataWiper.wipeAll()
        appModeManager.setMode(AppMode.SYNCED)
    }

    /**
     * Clears the one-shot normalization marker. Must be called when a migration attempt
     * cycle is abandoned (e.g. the user cancels back to Local mode) — a stale marker
     * would make a later migration skip re-keying rows it has never seen.
     */
    fun resetNormalization() {
        cacheQueries.deleteSyncMeta(NORMALIZED_MARKER)
    }

    private suspend fun runMigration() {
        try {
            val total = plan().total
            _state.value = MigrationState.Running(0, total, STEP_PREPARE)
            syncQueue.clear()
            normalizeOnce()
            var done = uploadedCount()
            done = uploadFoods(done, total)
            done = uploadRecipes(done, total)
            done = uploadEntries(done, total)
            done = uploadWeights(done, total)
            done = uploadSleep(done, total)
            done = uploadSupplements(done, total)
            done = uploadSupplementLogs(done, total)
            done = uploadGoals(done, total)
            done = uploadPreferences(done, total)
            uploadDayProperties(done, total)
            cacheQueries.deleteSyncMeta(NORMALIZED_MARKER)
            appModeManager.setMode(AppMode.SYNCED)
            _state.value = MigrationState.Completed
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            _state.value = MigrationState.Failed(e.message ?: "Migration failed")
        }
    }

    // ---------------------------------------------------------------------------------
    // Normalization
    // ---------------------------------------------------------------------------------

    private fun normalizeOnce() {
        if (cacheQueries.selectSyncMeta(NORMALIZED_MARKER).executeAsOneOrNull() != null) return
        queries.transaction {
            normalizeFoods()
            normalizeRecipes()
            normalizeSupplements()
            normalizeEntries()
            normalizeWeights()
            normalizeSleep()
        }
        // The marker lives in the cache DB, so it cannot be committed atomically with
        // the normalization above. Written only after the commit: a crash in between
        // re-runs normalization, which is a no-op for rows that already carry temp_ ids.
        cacheQueries.upsertSyncMeta(NORMALIZED_MARKER, Clock.System.now().toString())
    }

    private fun normalizeFoods() {
        for (row in queries.selectAllFoods().executeAsList()) {
            if (row.id.startsWith(TEMP_PREFIX)) continue
            val newId = newTempId()
            val food = json.decodeOrNull<Food>(row.jsonData)?.copy(id = newId)
            queries.deleteFood(row.id)
            queries.insertFood(
                id = newId,
                name = row.name,
                brand = row.brand,
                calories = row.calories,
                protein = row.protein,
                carbs = row.carbs,
                fat = row.fat,
                fiber = row.fiber,
                isFavorite = row.isFavorite,
                barcode = row.barcode,
                jsonData = food?.let { json.encodeToString(it) } ?: row.jsonData,
            )
            remapFoodReferences(row.id, newId)
        }
    }

    private fun normalizeRecipes() {
        for (row in queries.selectAllRecipes().executeAsList()) {
            if (row.id.startsWith(TEMP_PREFIX)) continue
            val newId = newTempId()
            val recipe = json.decodeOrNull<RecipeDetail>(row.jsonData)?.copy(id = newId)
            queries.deleteRecipe(row.id)
            queries.insertRecipe(
                id = newId,
                name = row.name,
                totalServings = row.totalServings,
                isFavorite = row.isFavorite,
                calories = row.calories,
                protein = row.protein,
                carbs = row.carbs,
                fat = row.fat,
                fiber = row.fiber,
                jsonData = recipe?.let { json.encodeToString(it) } ?: row.jsonData,
            )
            remapRecipeReferences(row.id, newId)
        }
    }

    private fun normalizeSupplements() {
        for (row in queries.selectAllSupplements().executeAsList()) {
            if (row.id.startsWith(TEMP_PREFIX)) continue
            val newId = newTempId()
            val supplement = json.decodeOrNull<Supplement>(row.jsonData)?.copy(id = newId)
            queries.deleteSupplement(row.id)
            queries.insertSupplement(
                id = newId,
                name = row.name,
                isActive = row.isActive,
                sortOrder = row.sortOrder,
                jsonData = supplement?.let { json.encodeToString(it) } ?: row.jsonData,
            )
            remapSupplementReferences(row.id, newId, rekeyLogIds = true)
        }
    }

    private fun normalizeEntries() {
        for (row in queries.selectAllEntries().executeAsList()) {
            if (row.id.startsWith(TEMP_PREFIX)) continue
            val newId = newTempId()
            val entry = json.decodeOrNull<Entry>(row.jsonData)?.copy(id = newId)
            queries.deleteEntry(row.id)
            insertEntryRow(row, id = newId, jsonData = entry?.let { json.encodeToString(it) } ?: row.jsonData)
        }
    }

    private fun normalizeWeights() {
        for (row in queries.selectAllWeightEntries().executeAsList()) {
            if (row.id.startsWith(TEMP_PREFIX)) continue
            val newId = newTempId()
            val entry = json.decodeOrNull<WeightEntry>(row.jsonData)?.copy(id = newId)
            queries.deleteWeightEntry(row.id)
            queries.insertWeightEntry(
                id = newId,
                entryDate = row.entryDate,
                weightKg = row.weightKg,
                loggedAt = row.loggedAt,
                jsonData = entry?.let { json.encodeToString(it) } ?: row.jsonData,
            )
        }
    }

    private fun normalizeSleep() {
        for (row in queries.selectAllSleepEntries().executeAsList()) {
            if (row.id.startsWith(TEMP_PREFIX)) continue
            val newId = newTempId()
            val entry = json.decodeOrNull<SleepEntry>(row.jsonData)?.copy(id = newId)
            queries.deleteSleepEntry(row.id)
            queries.insertSleepEntry(
                id = newId,
                entryDate = row.entryDate,
                durationMinutes = row.durationMinutes,
                quality = row.quality,
                loggedAt = row.loggedAt,
                jsonData = entry?.let { json.encodeToString(it) } ?: row.jsonData,
            )
        }
    }

    // ---------------------------------------------------------------------------------
    // Reference rewriting
    // ---------------------------------------------------------------------------------

    /** Rewrites entry, recipe-ingredient and supplement-ingredient references to a food id. */
    private fun remapFoodReferences(
        oldId: String,
        newId: String,
    ) {
        for (row in queries.selectEntriesByFoodId(oldId).executeAsList()) {
            val entry = json.decodeOrNull<Entry>(row.jsonData)
            val updated = entry?.copy(foodId = newId, food = entry.food?.copy(id = newId))
            insertEntryRow(
                row,
                foodId = newId,
                jsonData = updated?.let { json.encodeToString(it) } ?: row.jsonData,
            )
        }
        for (row in queries.selectAllRecipes().executeAsList()) {
            val recipe = json.decodeOrNull<RecipeDetail>(row.jsonData) ?: continue
            if (recipe.ingredients.none { it.foodId == oldId }) continue
            val updated =
                recipe.copy(
                    ingredients = recipe.ingredients.map { if (it.foodId == oldId) it.copy(foodId = newId) else it },
                )
            queries.insertRecipe(
                id = row.id,
                name = row.name,
                totalServings = row.totalServings,
                isFavorite = row.isFavorite,
                calories = row.calories,
                protein = row.protein,
                carbs = row.carbs,
                fat = row.fat,
                fiber = row.fiber,
                jsonData = json.encodeToString(updated),
            )
        }
        for (row in queries.selectAllSupplements().executeAsList()) {
            val supplement = json.decodeOrNull<Supplement>(row.jsonData) ?: continue
            if (supplement.ingredients.none { it.foodId == oldId }) continue
            val updated =
                supplement.copy(
                    ingredients = supplement.ingredients.map { if (it.foodId == oldId) it.copy(foodId = newId) else it },
                )
            queries.insertSupplement(
                id = row.id,
                name = row.name,
                isActive = row.isActive,
                sortOrder = row.sortOrder,
                jsonData = json.encodeToString(updated),
            )
        }
    }

    private fun remapRecipeReferences(
        oldId: String,
        newId: String,
    ) {
        for (row in queries.selectEntriesByRecipeId(oldId).executeAsList()) {
            val entry = json.decodeOrNull<Entry>(row.jsonData)
            val updated = entry?.copy(recipeId = newId, recipe = entry.recipe?.copy(id = newId))
            insertEntryRow(
                row,
                recipeId = newId,
                jsonData = updated?.let { json.encodeToString(it) } ?: row.jsonData,
            )
        }
    }

    /**
     * Rewrites supplement log references. The synthesized log row id
     * (`"<supplementId>-<date>"`) doubles as the uploaded-marker: it is only re-keyed
     * during normalization ([rekeyLogIds] = true) or after the log itself was uploaded —
     * NOT when the owning supplement gets its server id, so a `temp_`-prefixed log id
     * still means "this log has not been uploaded yet".
     */
    private fun remapSupplementReferences(
        oldId: String,
        newId: String,
        rekeyLogIds: Boolean,
    ) {
        for (row in queries.selectSupplementLogsBySupplementId(oldId).executeAsList()) {
            queries.deleteSupplementLogById(row.id)
            queries.insertSupplementLog(
                id = if (rekeyLogIds) "$newId-${row.date}" else row.id,
                supplementId = newId,
                date = row.date,
                takenAt = row.takenAt,
            )
        }
    }

    /** Re-inserts an entry row keeping all cached display columns unless overridden. */
    private fun insertEntryRow(
        row: CachedEntry,
        id: String = row.id,
        foodId: String? = row.foodId,
        recipeId: String? = row.recipeId,
        jsonData: String = row.jsonData,
    ) {
        queries.insertEntry(
            id = id,
            date = row.date,
            mealType = row.mealType,
            servings = row.servings,
            foodId = foodId,
            recipeId = recipeId,
            foodName = row.foodName,
            calories = row.calories,
            protein = row.protein,
            carbs = row.carbs,
            fat = row.fat,
            fiber = row.fiber,
            jsonData = jsonData,
        )
    }

    // ---------------------------------------------------------------------------------
    // Upload steps
    // ---------------------------------------------------------------------------------

    /** Items already carrying server ids from a previous partial run. */
    private fun uploadedCount(): Int =
        queries.selectAllFoods().executeAsList().count { !it.id.startsWith(TEMP_PREFIX) } +
            queries.selectAllRecipes().executeAsList().count { !it.id.startsWith(TEMP_PREFIX) } +
            queries.selectAllEntries().executeAsList().count { !it.id.startsWith(TEMP_PREFIX) } +
            queries.selectAllWeightEntries().executeAsList().count { !it.id.startsWith(TEMP_PREFIX) } +
            queries.selectAllSleepEntries().executeAsList().count { !it.id.startsWith(TEMP_PREFIX) } +
            queries.selectAllSupplements().executeAsList().count { !it.id.startsWith(TEMP_PREFIX) } +
            queries.selectAllSupplementLogs().executeAsList().count { !it.id.startsWith(TEMP_PREFIX) }

    private fun progress(
        done: Int,
        total: Int,
        step: String,
    ) {
        _state.value = MigrationState.Running(done, total, step)
    }

    private suspend fun uploadFoods(
        startDone: Int,
        total: Int,
    ): Int {
        var done = startDone
        progress(done, total, STEP_FOODS)
        for (row in queries.selectAllFoods().executeAsList().filter { it.id.startsWith(TEMP_PREFIX) }) {
            val cached =
                json.decodeOrNull<Food>(row.jsonData)
                    ?: throw IllegalStateException("Could not read local food \"${row.name}\"")
            val server = api.createFood(cached.toFoodCreate())
            queries.transaction {
                queries.deleteFood(row.id)
                queries.insertFood(
                    id = server.id,
                    name = server.name,
                    brand = server.brand,
                    calories = server.calories,
                    protein = server.protein,
                    carbs = server.carbs,
                    fat = server.fat,
                    fiber = server.fiber,
                    isFavorite = if (server.isFavorite) 1L else 0L,
                    barcode = server.barcode,
                    jsonData = json.encodeToString(server),
                )
                remapFoodReferences(row.id, server.id)
            }
            progress(++done, total, STEP_FOODS)
        }
        return done
    }

    private suspend fun uploadRecipes(
        startDone: Int,
        total: Int,
    ): Int {
        var done = startDone
        progress(done, total, STEP_RECIPES)
        for (row in queries.selectAllRecipes().executeAsList().filter { it.id.startsWith(TEMP_PREFIX) }) {
            val cached =
                json.decodeOrNull<RecipeDetail>(row.jsonData)
                    ?: throw IllegalStateException("Could not read local recipe \"${row.name}\"")
            val ingredients =
                cached.ingredients
                    // Dangling food references (food deleted locally) are dropped.
                    .filterNot { it.foodId.startsWith(TEMP_PREFIX) }
                    .map {
                        RecipeIngredientInput(
                            foodId = it.foodId,
                            quantity = it.quantity,
                            servingUnit = ServingUnit.valueOf(it.servingUnit.name),
                        )
                    }
            if (ingredients.isEmpty()) {
                // The server rejects ingredient-less recipes (min 1). Nothing usable is
                // left of this recipe — drop it locally instead of failing the whole
                // migration with a 400 forever. Its entries fall back to quick entries.
                queries.deleteRecipe(row.id)
                progress(++done, total, STEP_RECIPES)
                continue
            }
            val create =
                RecipeCreate(
                    name = cached.name,
                    totalServings = cached.totalServings,
                    ingredients = ingredients,
                    isFavorite = cached.isFavorite,
                    imageUrl = cached.imageUrl,
                )
            val server = api.createRecipe(create)
            queries.transaction {
                queries.deleteRecipe(row.id)
                queries.insertRecipe(
                    id = server.id,
                    name = server.name,
                    totalServings = server.totalServings,
                    isFavorite = if (server.isFavorite) 1L else 0L,
                    calories = server.calories,
                    protein = server.protein,
                    carbs = server.carbs,
                    fat = server.fat,
                    fiber = server.fiber,
                    jsonData = json.encodeToString(server),
                )
                remapRecipeReferences(row.id, server.id)
            }
            progress(++done, total, STEP_RECIPES)
        }
        return done
    }

    private suspend fun uploadEntries(
        startDone: Int,
        total: Int,
    ): Int {
        var done = startDone
        progress(done, total, STEP_ENTRIES)
        for (row in queries.selectAllEntries().executeAsList().filter { it.id.startsWith(TEMP_PREFIX) }) {
            val cached =
                json.decodeOrNull<Entry>(row.jsonData)
                    ?: throw IllegalStateException("Could not read local entry from ${row.date}")
            val server = api.createEntry(cached.toEntryCreate())
            val updated =
                cached.copy(
                    id = server.id,
                    userId = server.userId,
                    createdAt = server.createdAt ?: cached.createdAt,
                    updatedAt = server.updatedAt,
                )
            queries.transaction {
                queries.deleteEntry(row.id)
                insertEntryRow(row, id = server.id, jsonData = json.encodeToString(updated))
            }
            progress(++done, total, STEP_ENTRIES)
        }
        return done
    }

    private suspend fun uploadWeights(
        startDone: Int,
        total: Int,
    ): Int {
        var done = startDone
        progress(done, total, STEP_WEIGHTS)
        for (row in queries.selectAllWeightEntries().executeAsList().filter { it.id.startsWith(TEMP_PREFIX) }) {
            val cached =
                json.decodeOrNull<WeightEntry>(row.jsonData)
                    ?: throw IllegalStateException("Could not read local weight entry from ${row.entryDate}")
            val server =
                api.createWeightEntry(
                    WeightCreate(weightKg = cached.weightKg, entryDate = cached.entryDate, notes = cached.notes),
                )
            queries.transaction {
                queries.deleteWeightEntry(row.id)
                queries.insertWeightEntry(
                    id = server.id,
                    entryDate = server.entryDate,
                    weightKg = server.weightKg,
                    loggedAt = server.loggedAt ?: row.loggedAt,
                    jsonData = json.encodeToString(server),
                )
            }
            progress(++done, total, STEP_WEIGHTS)
        }
        return done
    }

    private suspend fun uploadSleep(
        startDone: Int,
        total: Int,
    ): Int {
        var done = startDone
        progress(done, total, STEP_SLEEP)
        for (row in queries.selectAllSleepEntries().executeAsList().filter { it.id.startsWith(TEMP_PREFIX) }) {
            val cached =
                json.decodeOrNull<SleepEntry>(row.jsonData)
                    ?: throw IllegalStateException("Could not read local sleep entry from ${row.entryDate}")
            val server =
                api.createSleepEntry(
                    SleepCreate(
                        durationMinutes = cached.durationMinutes,
                        quality = cached.quality,
                        entryDate = cached.entryDate,
                        bedtime = cached.bedtime,
                        wakeTime = cached.wakeTime,
                        wakeUps = cached.wakeUps,
                        notes = cached.notes,
                    ),
                )
            queries.transaction {
                queries.deleteSleepEntry(row.id)
                queries.insertSleepEntry(
                    id = server.id,
                    entryDate = server.entryDate,
                    durationMinutes = server.durationMinutes.toLong(),
                    quality = server.quality.toLong(),
                    loggedAt = server.loggedAt ?: row.loggedAt,
                    jsonData = json.encodeToString(server),
                )
            }
            progress(++done, total, STEP_SLEEP)
        }
        return done
    }

    private suspend fun uploadSupplements(
        startDone: Int,
        total: Int,
    ): Int {
        var done = startDone
        progress(done, total, STEP_SUPPLEMENTS)
        for (row in queries.selectAllSupplements().executeAsList().filter { it.id.startsWith(TEMP_PREFIX) }) {
            val cached =
                json.decodeOrNull<Supplement>(row.jsonData)
                    ?: throw IllegalStateException("Could not read local supplement \"${row.name}\"")
            val ingredients = cached.ingredients.mapNotNull { it.toIngredientInput() }
            if (ingredients.isEmpty()) {
                // The server rejects ingredient-less supplements (min 1). Drop the shell
                // locally instead of failing the whole migration with a 400 forever; its
                // logs are removed by the orphan handling in uploadSupplementLogs.
                queries.deleteSupplement(row.id)
                progress(++done, total, STEP_SUPPLEMENTS)
                continue
            }
            val create =
                SupplementCreate(
                    name = cached.name,
                    scheduleType = SupplementCreate.ScheduleType.valueOf(cached.scheduleType.name),
                    ingredients = ingredients,
                    scheduleDays = cached.scheduleDays,
                    scheduleStartDate = cached.scheduleStartDate,
                    isActive = cached.isActive,
                    sortOrder = cached.sortOrder,
                    timeOfDay = cached.timeOfDay?.let { SupplementCreate.TimeOfDay.valueOf(it.name) },
                )
            val server = api.createSupplement(create)
            queries.transaction {
                queries.deleteSupplement(row.id)
                queries.insertSupplement(
                    id = server.id,
                    name = server.name,
                    isActive = if (server.isActive) 1L else 0L,
                    sortOrder = server.sortOrder.toLong(),
                    jsonData = json.encodeToString(server),
                )
                remapSupplementReferences(row.id, server.id, rekeyLogIds = false)
            }
            progress(++done, total, STEP_SUPPLEMENTS)
        }
        return done
    }

    private suspend fun uploadSupplementLogs(
        startDone: Int,
        total: Int,
    ): Int {
        var done = startDone
        progress(done, total, STEP_SUPPLEMENT_LOGS)
        for (row in queries.selectAllSupplementLogs().executeAsList().filter { it.id.startsWith(TEMP_PREFIX) }) {
            if (row.supplementId.startsWith(TEMP_PREFIX)) {
                // Orphan log (supplement deleted locally) — nothing to log it against.
                queries.deleteSupplementLogById(row.id)
                progress(++done, total, STEP_SUPPLEMENT_LOGS)
                continue
            }
            api.logSupplement(row.supplementId, row.date)
            queries.transaction {
                queries.deleteSupplementLogById(row.id)
                queries.insertSupplementLog(
                    id = "${row.supplementId}-${row.date}",
                    supplementId = row.supplementId,
                    date = row.date,
                    takenAt = row.takenAt,
                )
            }
            progress(++done, total, STEP_SUPPLEMENT_LOGS)
        }
        return done
    }

    private suspend fun uploadGoals(
        startDone: Int,
        total: Int,
    ): Int {
        var done = startDone
        val row = queries.selectGoals().executeAsOneOrNull() ?: return done
        progress(done, total, STEP_GOALS)
        api.setGoals(
            Goals(
                calorieGoal = row.calorieGoal,
                proteinGoal = row.proteinGoal,
                carbGoal = row.carbGoal,
                fatGoal = row.fatGoal,
                fiberGoal = row.fiberGoal,
            ),
        )
        progress(++done, total, STEP_GOALS)
        return done
    }

    private suspend fun uploadPreferences(
        startDone: Int,
        total: Int,
    ): Int {
        var done = startDone
        val row = queries.selectPreferences().executeAsOneOrNull() ?: return done
        val prefs = json.decodeOrNull<Preferences>(row.jsonData) ?: return done
        progress(done, total, STEP_PREFERENCES)
        api.updatePreferences(prefs.toPreferencesUpdate())
        progress(++done, total, STEP_PREFERENCES)
        return done
    }

    private suspend fun uploadDayProperties(
        startDone: Int,
        total: Int,
    ): Int {
        var done = startDone
        progress(done, total, STEP_DAY_PROPERTIES)
        for (row in queries.selectAllDayProperties().executeAsList()) {
            api.setDayProperties(row.date, row.isFastingDay != 0L)
            progress(++done, total, STEP_DAY_PROPERTIES)
        }
        return done
    }

    // ---------------------------------------------------------------------------------
    // Model mapping
    // ---------------------------------------------------------------------------------

    /**
     * An ingredient whose `foodId` already carries a server id references that food.
     * A still-`temp_` foodId has no uploaded food row behind it — either the backing
     * food was created inline with the supplement (it never exists as a local food row)
     * or the food was deleted locally. In both cases the embedded backing food is
     * recreated inline, mirroring what the original create request sent to the server.
     * Returns null only when nothing usable is left (blank backing food name).
     */
    private fun SupplementIngredient.toIngredientInput(): SupplementIngredientInput? {
        if (!foodId.startsWith(TEMP_PREFIX)) {
            return SupplementIngredientInput(foodId = foodId, servings = servings, sortOrder = sortOrder)
        }
        if (food.name.isBlank()) return null
        return SupplementIngredientInput(food = food.toFoodCreate(), servings = servings, sortOrder = sortOrder)
    }

    private fun SupplementBackingFood.toFoodCreate(): FoodCreate =
        FoodCreate(
            name = name,
            servingSize = servingSize,
            servingUnit = ServingUnit.entries.firstOrNull { it.value == servingUnit } ?: ServingUnit.g,
            calories = calories,
            protein = protein,
            carbs = carbs,
            fat = fat,
            fiber = fiber,
            brand = brand,
            ingredientsText = ingredientsText,
        )

    private fun Food.toFoodCreate(): FoodCreate =
        FoodCreate(
            name = name,
            servingSize = servingSize,
            servingUnit = ServingUnit.valueOf(servingUnit.name),
            calories = calories,
            protein = protein,
            carbs = carbs,
            fat = fat,
            fiber = fiber,
            brand = brand,
            saturatedFat = saturatedFat,
            monounsaturatedFat = monounsaturatedFat,
            polyunsaturatedFat = polyunsaturatedFat,
            transFat = transFat,
            cholesterol = cholesterol,
            omega3 = omega3,
            omega6 = omega6,
            sugar = sugar,
            addedSugars = addedSugars,
            sugarAlcohols = sugarAlcohols,
            starch = starch,
            sodium = sodium,
            potassium = potassium,
            calcium = calcium,
            iron = iron,
            magnesium = magnesium,
            phosphorus = phosphorus,
            zinc = zinc,
            copper = copper,
            manganese = manganese,
            selenium = selenium,
            iodine = iodine,
            fluoride = fluoride,
            chromium = chromium,
            molybdenum = molybdenum,
            chloride = chloride,
            vitaminA = vitaminA,
            vitaminC = vitaminC,
            vitaminD = vitaminD,
            vitaminE = vitaminE,
            vitaminK = vitaminK,
            vitaminB1 = vitaminB1,
            vitaminB2 = vitaminB2,
            vitaminB3 = vitaminB3,
            vitaminB5 = vitaminB5,
            vitaminB6 = vitaminB6,
            vitaminB7 = vitaminB7,
            vitaminB9 = vitaminB9,
            vitaminB12 = vitaminB12,
            caffeine = caffeine,
            alcohol = alcohol,
            water = water,
            salt = salt,
            barcode = barcode,
            isFavorite = isFavorite,
            nutriScore = nutriScore?.let { score -> FoodCreate.NutriScore.entries.firstOrNull { it.value == score } },
            novaGroup = novaGroup,
            additives = additives,
            ingredientsText = ingredientsText,
            imageUrl = imageUrl,
        )

    /**
     * copyEntries-style mapping. Food/recipe references that are still unresolved
     * (`temp_` id with no matching food/recipe row) fall back to a quick entry built
     * from the cached display values so the log line survives the migration.
     */
    private fun Entry.toEntryCreate(): EntryCreate {
        val resolvedFoodId = foodId?.takeUnless { it.startsWith(TEMP_PREFIX) }
        val resolvedRecipeId = recipeId?.takeUnless { it.startsWith(TEMP_PREFIX) }
        val orphan = (foodId != null && resolvedFoodId == null) || (recipeId != null && resolvedRecipeId == null)
        return EntryCreate(
            mealType = mealType,
            servings = servings,
            date = date,
            foodId = resolvedFoodId,
            recipeId = resolvedRecipeId,
            notes = notes,
            quickName = quickName ?: if (orphan) food?.name ?: recipe?.name ?: foodName else null,
            quickCalories = quickCalories ?: if (orphan) food?.calories ?: recipe?.calories ?: calories else null,
            quickProtein = quickProtein ?: if (orphan) food?.protein ?: recipe?.protein ?: protein else null,
            quickCarbs = quickCarbs ?: if (orphan) food?.carbs ?: recipe?.carbs ?: carbs else null,
            quickFat = quickFat ?: if (orphan) food?.fat ?: recipe?.fat ?: fat else null,
            quickFiber = quickFiber ?: if (orphan) food?.fiber ?: recipe?.fiber ?: fiber else null,
            eatenAt = eatenAt,
        )
    }

    /**
     * Builds the update from the cached preferences. Empty lists are sent as `null`
     * (server default wins) because the local default state is indistinguishable from
     * "user cleared everything".
     */
    private fun Preferences.toPreferencesUpdate(): PreferencesUpdate =
        PreferencesUpdate(
            showChartWidget = showChartWidget,
            showFavoritesWidget = showFavoritesWidget,
            showSupplementsWidget = showSupplementsWidget,
            showWeightWidget = showWeightWidget,
            showMealBreakdownWidget = showMealBreakdownWidget,
            showTopFoodsWidget = showTopFoodsWidget,
            showSleepWidget = showSleepWidget,
            widgetOrder =
                widgetOrder
                    .mapNotNull { value -> PreferencesUpdate.WidgetOrder.entries.firstOrNull { it.value == value } }
                    .takeIf { it.isNotEmpty() },
            startPage = PreferencesUpdate.StartPage.entries.firstOrNull { it.value == startPage },
            favoriteTapAction = PreferencesUpdate.FavoriteTapAction.entries.firstOrNull { it.value == favoriteTapAction },
            favoriteMealAssignmentMode =
                PreferencesUpdate.FavoriteMealAssignmentMode.entries
                    .firstOrNull { it.value == favoriteMealAssignmentMode },
            favoriteMealTimeframes =
                favoriteMealTimeframes
                    .map {
                        FavoriteMealTimeframeInput(
                            mealType = it.mealType,
                            startTime = it.startTime,
                            endTime = it.endTime,
                            customMealTypeId = it.customMealTypeId,
                        )
                    }.takeIf { it.isNotEmpty() },
            mealOrder = mealOrder.takeIf { it.isNotEmpty() },
            visibleNutrients = visibleNutrients.takeIf { it.isNotEmpty() },
            locale = locale?.let { value -> PreferencesUpdate.Locale.entries.firstOrNull { it.value == value } },
            timeZone = timeZone,
            caloricLagDaysOverride = caloricLagDaysOverride,
        )

    @OptIn(ExperimentalUuidApi::class)
    private fun newTempId(): String = "$TEMP_PREFIX${Uuid.random()}"

    companion object {
        private const val TEMP_PREFIX = "temp_"
        private const val NORMALIZED_MARKER = "migration_normalized"

        const val STEP_PREPARE = "prepare"
        const val STEP_FOODS = "foods"
        const val STEP_RECIPES = "recipes"
        const val STEP_ENTRIES = "entries"
        const val STEP_WEIGHTS = "weights"
        const val STEP_SLEEP = "sleep"
        const val STEP_SUPPLEMENTS = "supplements"
        const val STEP_SUPPLEMENT_LOGS = "supplement_logs"
        const val STEP_GOALS = "goals"
        const val STEP_PREFERENCES = "preferences"
        const val STEP_DAY_PROPERTIES = "day_properties"
    }
}
