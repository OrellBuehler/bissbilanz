package com.bissbilanz.foodpackage

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.BulkFoodImage
import com.bissbilanz.api.HTTP_STATUS_UPDATE_REQUIRED
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodBulkItem
import com.bissbilanz.api.generated.model.FoodBulkResult
import com.bissbilanz.sync.BulkFoodGate
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/** What one [BulkFoodUploader.uploadNext] call achieved. */
sealed interface BulkUploadStep {
    /** Nothing left to upload for this user. */
    data object Idle : BulkUploadStep

    /** A request went through: [handled] foods are settled, [failed] of them rejected for good. */
    data class Progress(
        val handled: Int,
        val failed: Int,
    ) : BulkUploadStep

    data class RateLimited(
        val retryAfterMs: Long,
    ) : BulkUploadStep

    /** Offline, a server error or a timeout: try again later. */
    data class Transient(
        val cause: Throwable,
    ) : BulkUploadStep

    data object Unauthorized : BulkUploadStep

    /** This build is too old for the server; nothing can be uploaded until the app updates. */
    data object UpdateRequired : BulkUploadStep
}

/**
 * Sends bulk-imported foods to the account, [BATCH_SIZE] at a time, through `POST /api/foods/bulk`.
 *
 * The local food row is the source of truth for what is sent, so an edit made while the food
 * waited its turn is what reaches the server. The endpoint is idempotent per id, which is what
 * makes every failure safe to retry: a repeated food answers `exists`.
 *
 * Per-item answers: `created` and `exists` settle the job (and a hosted image replaces the
 * local file), `duplicate_barcode` drops the barcode locally and leaves the job queued so the
 * next request is the one retry without it, `id_conflict` re-keys the food locally and retries,
 * `invalid` parks the job as failed with the server's message.
 */
class BulkFoodUploader(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val json: Json,
    private val images: PackageImageStore,
    private val store: BulkUploadStore,
    private val errorReporter: ErrorReporter,
    private val currentUserId: suspend () -> String?,
    @OptIn(ExperimentalUuidApi::class)
    private val newId: () -> String = { Uuid.random().toString() },
) : BulkFoodGate {
    private val queries get() = db.userDataDatabaseQueries
    private val mutex = Mutex()

    private val modelJson =
        Json {
            encodeDefaults = true
            ignoreUnknownKeys = true
        }

    private val bulkFields: Set<String> =
        FoodBulkItem.serializer().descriptor.let { descriptor ->
            (0 until descriptor.elementsCount).map { descriptor.getElementName(it) }.toSet()
        }

    /** Uploads one batch for [userId]; [onlyIds] restricts it to those foods (a diary entry is waiting for them). */
    suspend fun uploadNext(
        userId: String,
        onlyIds: Set<String>? = null,
    ): BulkUploadStep =
        mutex.withLock {
            withContext(Dispatchers.IO) { uploadBatch(userId, onlyIds) }
        }

    override suspend fun ensureUploaded(foodIds: Set<String>) {
        val waiting = foodIds.filter { withContext(Dispatchers.IO) { store.isPending(it) } }.toSet()
        if (waiting.isEmpty()) return
        val userId = currentUserId() ?: throw UnauthorizedException()
        for (chunk in waiting.chunked(BATCH_SIZE)) {
            when (val step = uploadNext(userId, chunk.toSet())) {
                is BulkUploadStep.RateLimited -> throw ApiException("bulk upload rate limited", HTTP_TOO_MANY_REQUESTS)
                is BulkUploadStep.Transient -> throw ApiException("bulk upload unavailable: ${step.cause.message}", HTTP_UNAVAILABLE)
                BulkUploadStep.Unauthorized -> throw UnauthorizedException()
                BulkUploadStep.UpdateRequired -> throw ApiException("update required", HTTP_STATUS_UPDATE_REQUIRED)
                BulkUploadStep.Idle, is BulkUploadStep.Progress -> Unit
            }
        }
        if (waiting.any { withContext(Dispatchers.IO) { store.isUnsynced(it) } }) {
            throw ApiException("the referenced food could not be uploaded", HTTP_NOT_FOUND)
        }
    }

    private class Prepared(
        val food: Food,
        val item: FoodBulkItem,
        val image: BulkFoodImage?,
    )

    private suspend fun uploadBatch(
        userId: String,
        onlyIds: Set<String>?,
    ): BulkUploadStep {
        val jobs =
            if (onlyIds == null) {
                queries.selectPendingBulkJobs(userId, BATCH_SIZE.toLong()).executeAsList().map { it.foodId }
            } else {
                queries.selectPendingBulkJobsByIds(userId, onlyIds).executeAsList().map { it.foodId }
            }
        if (jobs.isEmpty()) return BulkUploadStep.Idle

        val rows = queries.selectFoodsByIds(jobs).executeAsList().associateBy { it.id }
        val batch = ArrayList<Prepared>(jobs.size)
        var imageBytes = 0
        var dropped = 0
        for (id in jobs) {
            val row = rows[id]
            if (row == null) {
                store.remove(id)
                dropped++
                continue
            }
            val food = json.decodeOrNull<Food>(row.jsonData)
            if (food == null) {
                queries.markBulkJobFailed("The saved food could not be read", id)
                dropped++
                continue
            }
            val image = imageFor(food)
            if (batch.isNotEmpty() && image != null && imageBytes + image.bytes.size > MAX_BATCH_IMAGE_BYTES) break
            imageBytes += image?.bytes?.size ?: 0
            batch.add(Prepared(food, food.toBulkItem(), image))
        }
        if (batch.isEmpty()) return BulkUploadStep.Progress(handled = dropped, failed = 0)

        val results =
            try {
                api.bulkCreateFoods(batch.map { it.item }, batch.filter { it.image != null }.associate { it.food.id to it.image!! }).results
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                return failedRequest(e, batch)
            }
        if (results.size != batch.size) {
            val mismatch = IllegalStateException("bulk create answered ${results.size} results for ${batch.size} foods")
            errorReporter.captureException(mismatch)
            return BulkUploadStep.Transient(mismatch)
        }

        var failed = 0
        for ((index, result) in results.withIndex()) {
            if (applyResult(batch[index], result)) failed++
        }
        return BulkUploadStep.Progress(handled = batch.size + dropped, failed = failed)
    }

    private fun failedRequest(
        error: Exception,
        batch: List<Prepared>,
    ): BulkUploadStep {
        if (error is UnauthorizedException) return BulkUploadStep.Unauthorized
        if (error !is ApiException) return BulkUploadStep.Transient(error)
        return failedApiRequest(error, batch)
    }

    private fun failedApiRequest(
        e: ApiException,
        batch: List<Prepared>,
    ): BulkUploadStep =
        when {
            e.statusCode == HTTP_STATUS_UPDATE_REQUIRED -> BulkUploadStep.UpdateRequired
            e.statusCode == HTTP_UNAUTHORIZED -> BulkUploadStep.Unauthorized
            e.statusCode == HTTP_TOO_MANY_REQUESTS -> BulkUploadStep.RateLimited(retryAfterMs(e))
            e.statusCode == HTTP_BAD_REQUEST || e.statusCode == HTTP_PAYLOAD_TOO_LARGE -> {
                // The server refused the request as a whole, so resending it cannot help.
                errorReporter.captureException(e)
                queries.transaction {
                    batch.forEach {
                        queries.markBulkJobFailed(
                            "The server rejected the request (HTTP ${e.statusCode})",
                            it.food.id,
                        )
                    }
                }
                BulkUploadStep.Progress(handled = batch.size, failed = batch.size)
            }
            else -> {
                if (e.statusCode in 500..599) errorReporter.captureException(e)
                BulkUploadStep.Transient(e)
            }
        }

    private fun retryAfterMs(e: ApiException): Long {
        val seconds =
            e.rawResponse
                ?.headers
                ?.get("Retry-After")
                ?.trim()
                ?.toLongOrNull()
        return if (seconds != null && seconds > 0) seconds * 1000 else DEFAULT_RETRY_AFTER_MS
    }

    /** True when the job ended as failed. */
    private suspend fun applyResult(
        sent: Prepared,
        result: FoodBulkResult,
    ): Boolean {
        val id = sent.food.id
        when (result.status) {
            STATUS_CREATED, STATUS_EXISTS -> {
                queries.markBulkJobDone(id)
                val hosted = result.imageUrl
                if (hosted != null) adoptHostedImage(id, hosted)
            }
            STATUS_DUPLICATE_BARCODE -> {
                dropBarcode(sent.food)
                queries.bumpBulkJobAttempts("duplicate_barcode", id)
            }
            STATUS_ID_CONFLICT -> rekey(sent.food)
            STATUS_INVALID -> {
                queries.markBulkJobFailed(result.message ?: "The server rejected this food", id)
                return true
            }
            else -> {
                errorReporter.captureException(IllegalStateException("unknown bulk create status ${result.status}"))
                queries.markBulkJobFailed("Unexpected answer from the server: ${result.status}", id)
                return true
            }
        }
        return false
    }

    private suspend fun adoptHostedImage(
        id: String,
        hosted: String,
    ) {
        val row = queries.selectFoodById(id).executeAsOneOrNull() ?: return
        val food = json.decodeOrNull<Food>(row.jsonData) ?: return
        val local = food.imageUrl
        if (local == null || local == hosted) return
        write(food.copy(imageUrl = hosted))
        if (local.startsWith("file://")) images.adoptUploaded(local, hosted)
    }

    private fun dropBarcode(food: Food) {
        val row = queries.selectFoodById(food.id).executeAsOneOrNull() ?: return
        val current = json.decodeOrNull<Food>(row.jsonData) ?: return
        write(current.copy(barcode = null))
    }

    /** The id belongs to another account: give the food a new one and everything that pointed at it. */
    private fun rekey(food: Food) {
        val oldId = food.id
        val newId = newId()
        queries.transaction {
            val row = queries.selectFoodById(oldId).executeAsOneOrNull() ?: return@transaction
            val current = json.decodeOrNull<Food>(row.jsonData) ?: return@transaction
            queries.deleteFoodLabels(oldId)
            queries.deleteFood(oldId)
            write(current.copy(id = newId))
            queries.renameBulkJob(newId = newId, oldId = oldId)
            for (entry in queries.selectEntriesByFoodId(oldId).executeAsList()) {
                queries.insertEntry(
                    entry.id,
                    entry.date,
                    entry.mealType,
                    entry.servings,
                    newId,
                    entry.recipeId,
                    entry.foodName,
                    entry.calories,
                    entry.protein,
                    entry.carbs,
                    entry.fat,
                    entry.fiber,
                    entry.jsonData.replace(oldId, newId),
                )
            }
            for (recipe in queries.selectAllRecipes().executeAsList()) {
                if (oldId !in recipe.jsonData) continue
                queries.insertRecipe(
                    recipe.id,
                    recipe.name,
                    recipe.totalServings,
                    recipe.isFavorite,
                    recipe.calories,
                    recipe.protein,
                    recipe.carbs,
                    recipe.fat,
                    recipe.fiber,
                    recipe.jsonData.replace(oldId, newId),
                )
            }
        }
    }

    private fun write(food: Food) {
        queries.deleteFoodLabels(food.id)
        food.labels?.forEach { label -> queries.insertFoodLabel(food.id, label) }
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
        queries.updateFoodKeys(servingUnit = food.servingUnit.value, updatedAt = food.updatedAt, id = food.id)
    }

    private suspend fun imageFor(food: Food): BulkFoodImage? {
        val url = food.imageUrl ?: return null
        if (!url.startsWith("file://")) return null
        val bytes = images.readForUpload(url, BULK_UPLOAD_IMAGE_BYTES) ?: return null
        return BulkFoodImage(bytes, imageContentType(bytes))
    }

    private fun Food.toBulkItem(): FoodBulkItem {
        val source = modelJson.encodeToJsonElement(Food.serializer(), this).jsonObject
        val picked = HashMap<String, JsonElement>()
        for ((key, value) in source) if (key in bulkFields && value !is JsonNull) picked[key] = value
        picked["imageUrl"] = allowedImageUrl(imageUrl)?.let { JsonPrimitive(it) } ?: JsonNull
        return modelJson.decodeFromJsonElement(FoodBulkItem.serializer(), JsonObject(picked))
    }

    companion object {
        const val BATCH_SIZE = 200

        /** Keeps one request well under what a reverse proxy accepts. */
        const val MAX_BATCH_IMAGE_BYTES = 6 * 1024 * 1024
        const val DEFAULT_RETRY_AFTER_MS = 60_000L

        private const val STATUS_CREATED = "created"
        private const val STATUS_EXISTS = "exists"
        private const val STATUS_ID_CONFLICT = "id_conflict"
        private const val STATUS_DUPLICATE_BARCODE = "duplicate_barcode"
        private const val STATUS_INVALID = "invalid"

        private const val HTTP_BAD_REQUEST = 400
        private const val HTTP_UNAUTHORIZED = 401
        private const val HTTP_NOT_FOUND = 404
        private const val HTTP_PAYLOAD_TOO_LARGE = 413
        private const val HTTP_TOO_MANY_REQUESTS = 429
        private const val HTTP_UNAVAILABLE = 503
    }
}

internal fun imageContentType(bytes: ByteArray): String =
    when {
        bytes.size >= 12 && bytes[0] == 'R'.code.toByte() && bytes[1] == 'I'.code.toByte() && bytes[8] == 'W'.code.toByte() -> "image/webp"
        bytes.size >= 4 && bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte() -> "image/png"
        else -> "image/jpeg"
    }
