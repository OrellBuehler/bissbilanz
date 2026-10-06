package com.bissbilanz.android.bulk

import android.content.Context
import com.bissbilanz.foodpackage.BulkImportCheckpoint
import com.bissbilanz.foodpackage.BulkImportCheckpoints

class PreferencesBulkImportCheckpoints(
    context: Context,
) : BulkImportCheckpoints {
    private val prefs = context.getSharedPreferences("bulk_import_checkpoint", Context.MODE_PRIVATE)

    override fun load(path: String): BulkImportCheckpoint? {
        if (prefs.getString(KEY_PATH, null) != path) return null
        return BulkImportCheckpoint(
            processed = prefs.getInt(KEY_PROCESSED, 0),
            created = prefs.getInt(KEY_CREATED, 0),
            skippedExisting = prefs.getInt(KEY_SKIPPED, 0),
            invalid = prefs.getInt(KEY_INVALID, 0),
            images = prefs.getInt(KEY_IMAGES, 0),
            imagesMissing = prefs.getInt(KEY_IMAGES_MISSING, 0),
        )
    }

    override fun save(
        path: String,
        checkpoint: BulkImportCheckpoint,
    ) {
        prefs
            .edit()
            .putString(KEY_PATH, path)
            .putInt(KEY_PROCESSED, checkpoint.processed)
            .putInt(KEY_CREATED, checkpoint.created)
            .putInt(KEY_SKIPPED, checkpoint.skippedExisting)
            .putInt(KEY_INVALID, checkpoint.invalid)
            .putInt(KEY_IMAGES, checkpoint.images)
            .putInt(KEY_IMAGES_MISSING, checkpoint.imagesMissing)
            .commit()
    }

    override fun clear(path: String) {
        if (prefs.getString(KEY_PATH, null) == path) prefs.edit().clear().commit()
    }

    private companion object {
        const val KEY_PATH = "path"
        const val KEY_PROCESSED = "processed"
        const val KEY_CREATED = "created"
        const val KEY_SKIPPED = "skipped"
        const val KEY_INVALID = "invalid"
        const val KEY_IMAGES = "images"
        const val KEY_IMAGES_MISSING = "images_missing"
    }
}
