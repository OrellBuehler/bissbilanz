package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.normalizeLabels
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/** What a bulk import did, counted per food of the package. */
data class BulkImportSummary(
    val foodsInPackage: Int,
    val created: Int,
    /** Already in the food list (same name and brand), or repeated inside the package. */
    val skippedExisting: Int,
    val invalid: Int,
    val images: Int,
    /** Foods whose image is named in the manifest but missing from, or unreadable in, the archive. */
    val imagesMissing: Int,
    /** Recipes in the package; a bulk import only brings foods. */
    val recipesSkipped: Int,
    /** Foods queued for upload to the account; zero in Local mode. */
    val queuedForUpload: Int,
)

/**
 * The running totals of one import job as of the last committed chunk. A run that is stopped and
 * started again passes the last one back as `resumeFrom`: the foods it covers are not looked at
 * again and the counts carry on from it, so the final summary spans every run of the job.
 */
data class BulkImportCheckpoint(
    val processed: Int,
    val created: Int,
    val skippedExisting: Int,
    val invalid: Int,
    val images: Int,
    val imagesMissing: Int,
)

data class BulkImportProgress(
    val processed: Int,
    val total: Int,
    val created: Int,
)

/**
 * Imports a package too big for the normal preview-and-resolve flow: tens of thousands of
 * foods, read as a stream and written in chunks, so the foods are usable as soon as the first
 * chunk is in and memory stays flat.
 *
 * There is no per-item conflict step. A food is skipped when the food list already holds its
 * name and brand (same key as [foodKey]) or when it repeats earlier in the package; a barcode
 * the list already holds is dropped, not the food. Running the same import again therefore
 * imports only what is still missing, which is what makes it resumable. A caller that wants one
 * summary across the restarts of a job keeps the last [BulkImportCheckpoint] and hands it back
 * as `resumeFrom`; without it the counts cover this run only.
 *
 * With an [uploadUserId] (signed-in mode) every new food also gets an upload job; the food row
 * is the mirror and stays usable while [BulkUploadStore] drains the jobs in the background.
 */
class BulkPackageImporter(
    private val db: UserDataDatabase,
    private val json: Json,
    private val reader: BulkPackageReader,
    private val images: PackageImageStore,
    private val now: () -> String = { Clock.System.now().toString() },
    @OptIn(ExperimentalUuidApi::class)
    private val newId: () -> String = { Uuid.random().toString() },
) {
    private val queries get() = db.userDataDatabaseQueries

    suspend fun peek(path: String): BulkManifestInfo = withContext(Dispatchers.IO) { reader.open(path).use { it.info } }

    suspend fun import(
        path: String,
        uploadUserId: String?,
        resumeFrom: BulkImportCheckpoint? = null,
        onCheckpoint: suspend (BulkImportCheckpoint) -> Unit = {},
        onProgress: suspend (BulkImportProgress) -> Unit = {},
    ): BulkImportSummary =
        withContext(Dispatchers.IO) {
            reader.open(path).use { session ->
                val total = session.info.foodCount
                val keys = HashSet<String>()
                val barcodes = HashSet<String>()
                for (row in queries.selectFoodIdentityKeys().executeAsList()) {
                    keys.add(foodKey(row.name, row.brand))
                    trimBarcode(row.barcode)?.let { barcodes.add(it) }
                }
                val stamp = now()
                val resume = resumeFrom?.takeIf { it.processed in 0..total }
                val resumedUntil = resume?.processed ?: 0
                var seen = 0
                var processed = resumedUntil
                var created = resume?.created ?: 0
                var skipped = resume?.skippedExisting ?: 0
                var invalid = resume?.invalid ?: 0
                var storedImages = resume?.images ?: 0
                var missingImages = resume?.imagesMissing ?: 0
                val chunk = ArrayList<PackageFood>(CHUNK_SIZE)

                suspend fun flush() {
                    if (chunk.isEmpty()) return
                    val rows = ArrayList<Food>(chunk.size)
                    val written = ArrayList<String>()
                    try {
                        for (packaged in chunk) {
                            if (!keys.add(foodKey(packaged.name, packaged.brand))) {
                                skipped++
                                continue
                            }
                            var barcode = trimBarcode(packaged.barcode)
                            if (barcode != null && !barcodes.add(barcode)) barcode = null
                            var imageUrl: String? = null
                            if (packaged.image != null) {
                                val bytes = session.readImage(packaged.image)
                                val stored = bytes?.let { images.saveImportedBulk(it) }
                                if (stored == null) {
                                    missingImages++
                                } else {
                                    written.add(stored)
                                    imageUrl = stored
                                    storedImages++
                                }
                            }
                            rows.add(
                                packaged.toNewFood(
                                    id = newId(),
                                    barcode = barcode,
                                    imageUrl = imageUrl ?: packageImageUrl(packaged.imageUrl),
                                    labels = normalizeLabels(packaged.labels),
                                    now = stamp,
                                ),
                            )
                        }
                        queries.transaction {
                            for (food in rows) {
                                writeFood(food)
                                if (uploadUserId != null) queries.insertBulkJob(food.id, uploadUserId)
                            }
                        }
                    } catch (e: Exception) {
                        written.forEach { images.discard(it) }
                        throw e
                    }
                    created += rows.size
                    chunk.clear()
                    onCheckpoint(BulkImportCheckpoint(processed, created, skipped, invalid, storedImages, missingImages))
                }

                session.streamFoods { result ->
                    if (++seen <= resumedUntil) return@streamFoods
                    processed++
                    val food = result.food
                    if (food == null) {
                        invalid++
                    } else {
                        chunk.add(food)
                        if (chunk.size >= CHUNK_SIZE) {
                            flush()
                            onProgress(BulkImportProgress(processed, total, created))
                        }
                    }
                }
                flush()
                onProgress(BulkImportProgress(processed, total, created))
                BulkImportSummary(
                    foodsInPackage = total,
                    created = created,
                    skippedExisting = skipped,
                    invalid = invalid,
                    images = storedImages,
                    imagesMissing = missingImages,
                    recipesSkipped = session.info.recipeCount,
                    queuedForUpload = if (uploadUserId != null) created else 0,
                )
            }
        }

    private fun writeFood(food: Food) {
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
            isFavorite = 0L,
            barcode = food.barcode,
            jsonData = json.encodeToString(food),
        )
        queries.updateFoodKeys(servingUnit = food.servingUnit.value, updatedAt = food.updatedAt, id = food.id)
    }

    companion object {
        const val CHUNK_SIZE = 500
    }
}
