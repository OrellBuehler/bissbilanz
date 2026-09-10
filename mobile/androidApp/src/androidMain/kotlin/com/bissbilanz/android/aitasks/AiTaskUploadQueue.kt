package com.bissbilanz.android.aitasks

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

@Serializable
enum class AiTaskUploadStatus {
    PENDING,
    UPLOADING,
    FAILED,
}

/**
 * One meal queued for the assistant, as kept on disk between launches. Mirrors
 * iOS's `PersistedAiTaskUpload`: everything the worker needs to (re)send it, plus
 * enough state for AiTasksScreen to show it and offer Retry / Discard.
 */
@Serializable
data class QueuedAiTaskUpload(
    val id: String,
    val date: String,
    val description: String?,
    val mealType: String?,
    val eatenAt: String?,
    val photoPaths: List<String>,
    val idempotencyKey: String,
    val queuedAtEpochMs: Long,
    val status: AiTaskUploadStatus = AiTaskUploadStatus.PENDING,
    val attempts: Int = 0,
    val lastError: String? = null,
    val retryable: Boolean = true,
)

/**
 * Disk-backed queue of AI task uploads still in flight or failed.
 *
 * Lives in `filesDir`, never `cacheDir` — the OS is free to purge that under
 * storage pressure, which would silently drop a meal's photos along with any
 * chance of retrying it. A failed upload stays here, photos included, until the
 * user retries or discards it from AiTasksScreen — the same contract as iOS's
 * AiTaskUploadDisk/AiTaskStore pair.
 */
class AiTaskUploadQueue(
    context: Context,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    private val root = File(context.filesDir, DIR_NAME).apply { mkdirs() }
    private val indexFile = File(root, INDEX_FILE)
    private val lock = Any()

    private val _items = MutableStateFlow(readIndex())
    val items: StateFlow<List<QueuedAiTaskUpload>> = _items.asStateFlow()

    /** Writes the photos and the metadata, oldest-first order preserved by queuedAtEpochMs. */
    fun enqueue(
        date: String,
        description: String?,
        mealType: String?,
        eatenAt: String?,
        photos: List<ByteArray>,
    ): QueuedAiTaskUpload {
        val id = UUID.randomUUID().toString()
        val dir = photoDirectory(id).apply { mkdirs() }
        val paths =
            photos.mapIndexed { index, bytes ->
                File(dir, "photo_$index.jpg").apply { writeBytes(bytes) }.absolutePath
            }
        val item =
            QueuedAiTaskUpload(
                id = id,
                date = date,
                description = description,
                mealType = mealType,
                eatenAt = eatenAt,
                photoPaths = paths,
                idempotencyKey = UUID.randomUUID().toString(),
                queuedAtEpochMs = System.currentTimeMillis(),
            )
        mutate { it + item }
        return item
    }

    fun get(id: String): QueuedAiTaskUpload? = _items.value.firstOrNull { it.id == id }

    fun markUploading(id: String) {
        mutate { list ->
            list.map { if (it.id == id) it.copy(status = AiTaskUploadStatus.UPLOADING, attempts = it.attempts + 1) else it }
        }
    }

    fun markFailed(
        id: String,
        error: String?,
        retryable: Boolean,
    ) {
        mutate { list ->
            list.map {
                if (it.id == id) it.copy(status = AiTaskUploadStatus.FAILED, lastError = error, retryable = retryable) else it
            }
        }
    }

    /** Re-queues a failed upload for another attempt, starting the attempt count over. */
    fun retry(id: String) {
        mutate { list ->
            list.map {
                if (it.id == id) {
                    it.copy(status = AiTaskUploadStatus.PENDING, lastError = null, retryable = true, attempts = 0)
                } else {
                    it
                }
            }
        }
    }

    /** Drops the item and deletes its photos. Safe to call for an id already gone. */
    fun remove(id: String) {
        photoDirectory(id).deleteRecursively()
        mutate { list -> list.filterNot { it.id == id } }
    }

    private fun photoDirectory(id: String) = File(root, id)

    private fun mutate(transform: (List<QueuedAiTaskUpload>) -> List<QueuedAiTaskUpload>) {
        synchronized(lock) {
            val updated = transform(readIndexLocked())
            writeIndexLocked(updated)
            _items.value = updated
        }
    }

    private fun readIndex(): List<QueuedAiTaskUpload> = synchronized(lock) { readIndexLocked() }

    private fun readIndexLocked(): List<QueuedAiTaskUpload> {
        if (!indexFile.exists()) return emptyList()
        return runCatching {
            json.decodeFromString<List<QueuedAiTaskUpload>>(indexFile.readText())
        }.getOrDefault(emptyList())
    }

    /** Writes to a temp file first so a crash mid-write cannot leave a truncated index behind. */
    private fun writeIndexLocked(items: List<QueuedAiTaskUpload>) {
        val tmp = File(root, "$INDEX_FILE.tmp")
        tmp.writeText(json.encodeToString(items))
        tmp.renameTo(indexFile)
    }

    private companion object {
        const val DIR_NAME = "ai_task_uploads"
        const val INDEX_FILE = "queue.json"
    }
}
