package com.bissbilanz.foodpackage

/** Where a bulk import keeps its running totals between the runs WorkManager gives it. */
interface BulkImportCheckpoints {
    fun load(path: String): BulkImportCheckpoint?

    fun save(
        path: String,
        checkpoint: BulkImportCheckpoint,
    )

    fun clear(path: String)
}
