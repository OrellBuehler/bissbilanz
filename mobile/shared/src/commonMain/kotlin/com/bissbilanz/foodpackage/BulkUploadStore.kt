package com.bissbilanz.foodpackage

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToOne
import com.bissbilanz.userdata.UserDataDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** How far the background upload of bulk-imported foods has come. */
data class BulkUploadCounts(
    val total: Long,
    val done: Long,
    val pending: Long,
    val failed: Long,
) {
    /** Foods that exist only on this device so far. */
    val unsynced: Long get() = pending + failed

    val isActive: Boolean get() = total > 0 && unsynced > 0
}

/**
 * The upload jobs of foods imported in bulk. The foods themselves are ordinary rows of the
 * food table (the local mirror); a job only says "this one still has to reach the server".
 * Rows are keyed by the signed-in user that owns the upload, so another account never sends
 * them.
 */
class BulkUploadStore(
    private val db: UserDataDatabase,
) {
    private val queries get() = db.userDataDatabaseQueries

    fun counts(): BulkUploadCounts =
        queries.countBulkJobs().executeAsOne().let { BulkUploadCounts(it.total, it.done ?: 0, it.pending ?: 0, it.failed ?: 0) }

    fun countsFlow(): Flow<BulkUploadCounts> =
        queries
            .countBulkJobs()
            .asFlow()
            .mapToOne(Dispatchers.IO)
            .map { BulkUploadCounts(it.total, it.done ?: 0, it.pending ?: 0, it.failed ?: 0) }

    /** Foods the server does not have: still queued, or rejected. Both must survive a refresh that prunes foods the server lacks. */
    fun unsyncedFoodIds(): Set<String> = queries.selectBulkJobFoodIds().executeAsList().toHashSet()

    fun isUnsynced(foodId: String): Boolean =
        queries.selectBulkJob(foodId).executeAsOneOrNull()?.state.let {
            it == STATE_PENDING ||
                it == STATE_FAILED
        }

    fun isPending(foodId: String): Boolean = queries.selectBulkJob(foodId).executeAsOneOrNull()?.state == STATE_PENDING

    fun remove(foodId: String) {
        queries.deleteBulkJob(foodId)
    }

    /** Puts rejected foods back in the queue (after an app update, or because the user asks). */
    fun retryFailed(userId: String) {
        queries.retryFailedBulkJobs(userId)
    }

    /** Forgets jobs of another account: their foods are no longer protected from a refresh. */
    fun dropOtherUsers(userId: String) {
        queries.deleteBulkJobsOfOtherUsers(userId)
    }

    /** Clears the finished rows once nothing is left to upload, so the counter starts at zero for the next import. */
    fun clearFinished(userId: String) {
        val counts = counts()
        if (counts.total > 0 && counts.unsynced == 0L) queries.deleteDoneBulkJobs(userId)
    }

    companion object {
        const val STATE_PENDING = "pending"
        const val STATE_DONE = "done"
        const val STATE_FAILED = "failed"
    }
}
