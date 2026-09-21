package com.bissbilanz.android.images

import android.content.Context
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

/**
 * Deletes on-device photos no food or recipe points at any more.
 *
 * An account has the server's hourly sweep for this (`src/lib/server/
 * image-cleanup.ts`): an upload no row references is an orphan once it is old
 * enough. Local mode has no server, and every photo taken for a form the user then
 * abandons — or replaces before saving — leaves its only copy behind, so the app
 * runs the same sweep itself at start-up.
 *
 * The grace period is what keeps a photo that was attached moments ago, and whose
 * row is not saved yet, from being deleted out from under the open form.
 */
class LocalImageSweeper(
    private val context: Context,
    private val db: UserDataDatabase,
    private val json: Json,
    private val appModeManager: AppModeManager,
) {
    suspend fun sweep() {
        // Synced mode's files are a download cache of images the server still owns:
        // nothing here is the only copy, and the server does the real cleanup.
        if (!appModeManager.isLocal) return
        val queries = db.userDataDatabaseQueries
        val referenced =
            withContext(Dispatchers.IO) {
                buildSet {
                    queries.selectAllFoods().executeAsList().mapNotNullTo(this) {
                        json.decodeOrNull<Food>(it.jsonData)?.imageUrl
                    }
                    queries.selectAllRecipes().executeAsList().mapNotNullTo(this) {
                        json.decodeOrNull<RecipeDetail>(it.jsonData)?.imageUrl
                    }
                }
            }
        sweepUnreferenced(context, referenced)
    }
}

/** The file half of [LocalImageSweeper.sweep], with the referenced URLs already gathered. */
internal suspend fun sweepUnreferenced(
    context: Context,
    referenced: Set<String>,
    now: Long = System.currentTimeMillis(),
) {
    withContext(Dispatchers.IO) {
        val keep = referenced.mapNotNull { LocalImageStore.fileFor(context, it)?.name }.toSet()
        val cutoff = now - GRACE_MS
        LocalImageStore.directory(context).listFiles()?.forEach { file ->
            if (file.name in keep || file.lastModified() > cutoff) return@forEach
            runCatching { file.delete() }
        }
    }
}

private const val GRACE_MS = 24 * 60 * 60 * 1000L
