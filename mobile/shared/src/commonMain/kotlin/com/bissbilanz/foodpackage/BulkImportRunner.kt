package com.bissbilanz.foodpackage

import kotlinx.coroutines.CancellationException

/**
 * The resumable part of the Android import worker. The totals of the job are saved after every committed
 * chunk, so a run that WorkManager stops and starts again carries on counting from there and the
 * summary covers the whole job. [onFoodsQueued] fires after each chunk that queued foods for
 * upload, so they start uploading while the import is still running or after it was stopped.
 */
class BulkImportRunner(
    private val importer: BulkPackageImporter,
    private val checkpoints: BulkImportCheckpoints,
    private val onFoodsQueued: () -> Unit,
) {
    suspend fun run(
        path: String,
        uploadUserId: String?,
        onProgress: suspend (BulkImportProgress) -> Unit = {},
    ): BulkImportSummary {
        try {
            val summary =
                importer.import(
                    path = path,
                    uploadUserId = uploadUserId,
                    resumeFrom = checkpoints.load(path),
                    onCheckpoint = { checkpoint ->
                        checkpoints.save(path, checkpoint)
                        if (uploadUserId != null && checkpoint.created > 0) onFoodsQueued()
                    },
                    onProgress = onProgress,
                )
            checkpoints.clear(path)
            return summary
        } catch (e: Exception) {
            if (e !is CancellationException) checkpoints.clear(path)
            throw e
        }
    }
}
