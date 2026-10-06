package com.bissbilanz.android.navigation

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.bissbilanz.foodpackage.BULK_MAX_BYTES
import com.bissbilanz.util.Failures
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * A food package handed to the app from outside — a `.bissbilanz` file tapped in a messenger, the
 * Files app or a mail client, or shared to Bissbilanz.
 *
 * Like [PendingNavigation], the request has to outlive the trip through the UI: on a cold start
 * the intent is read before anything is composed, and a user who has not signed in or chosen
 * Local mode yet only reaches the navigation graph later. The request is held until the import
 * screen claims it.
 */
object PendingPackageImport {
    /** What the stream turned into: a cached copy to import, or the reason there is none. */
    data class Request(
        val fileName: String,
        val path: String?,
        val problem: Problem? = null,
    )

    enum class Problem { UNREADABLE, TOO_LARGE, NO_SPACE }

    private val _request = MutableStateFlow<Request?>(null)
    val request: StateFlow<Request?> = _request.asStateFlow()

    fun request(request: Request) {
        _request.value = request
    }

    /** Clears the request, unless a newer one already replaced it. */
    fun consume(request: Request) {
        _request.compareAndSet(request, null)
    }
}

/**
 * Copies a content or file URI into the app cache before anything looks at it: the URI grant a
 * sender hands over is temporary, and the import reads the file more than once (preview, then
 * commit).
 */
object IncomingPackageFiles {
    private const val DIR = "incoming"
    private const val MAX_AGE_MS = 24L * 60 * 60 * 1000
    private const val FREE_SPACE_MARGIN_BYTES = 64L * 1024 * 1024
    const val DEFAULT_NAME = "package.bissbilanz"

    /** The name the sending app shows for [uri], as Android reports it. */
    fun displayName(
        context: Context,
        uri: Uri,
    ): String {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) cursor.getString(index)?.takeIf { it.isNotBlank() }?.let { return it }
            }
        }
        return uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: DEFAULT_NAME
    }

    private fun declaredSize(
        context: Context,
        uri: Uri,
    ): Long {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (index >= 0 && !cursor.isNull(index)) return cursor.getLong(index)
            }
        }
        return -1
    }

    /** Blocking: call off the main thread. */
    @OptIn(ExperimentalUuidApi::class)
    fun copyToCache(
        context: Context,
        uri: Uri,
    ): PendingPackageImport.Request {
        val name = displayName(context, uri)
        val declared = declaredSize(context, uri)
        if (declared > BULK_MAX_BYTES) {
            return PendingPackageImport.Request(name, null, PendingPackageImport.Problem.TOO_LARGE)
        }
        val dir = File(context.cacheDir, DIR).apply { mkdirs() }
        sweep(dir)
        if (!hasRoomFor(dir, declared)) {
            return PendingPackageImport.Request(name, null, PendingPackageImport.Problem.NO_SPACE)
        }
        val target = File(dir, "${Uuid.random()}.pkg")
        val input =
            try {
                context.contentResolver.openInputStream(uri)
            } catch (e: java.io.IOException) {
                Failures.report(e)
                null
            } catch (e: SecurityException) {
                Failures.report(e)
                null
            } ?: return PendingPackageImport.Request(name, null, PendingPackageImport.Problem.UNREADABLE)
        var total = 0L
        try {
            input.use { source ->
                target.outputStream().use { out ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val count = source.read(buffer)
                        if (count < 0) break
                        total += count
                        // The declared size proves nothing; stop copying once the real one is too big.
                        if (total > BULK_MAX_BYTES) break
                        out.write(buffer, 0, count)
                    }
                }
            }
        } catch (e: java.io.IOException) {
            Failures.report(e)
            target.delete()
            return PendingPackageImport.Request(name, null, PendingPackageImport.Problem.UNREADABLE)
        }
        if (total > BULK_MAX_BYTES) {
            target.delete()
            return PendingPackageImport.Request(name, null, PendingPackageImport.Problem.TOO_LARGE)
        }
        return PendingPackageImport.Request(name, target.absolutePath)
    }

    /**
     * Room for the copy plus what a big package's photos take once they are stored in the app
     * (about as much again), and some headroom. An unknown size passes: the copy itself stops
     * at the limit.
     */
    internal fun hasRoomFor(
        dir: File,
        declared: Long,
    ): Boolean = declared <= 0 || dir.usableSpace >= declared * 2 + FREE_SPACE_MARGIN_BYTES

    /** Drops cached copies from earlier imports. */
    private fun sweep(dir: File) {
        val cutoff = System.currentTimeMillis() - MAX_AGE_MS
        dir.listFiles()?.filter { it.lastModified() < cutoff }?.forEach { it.delete() }
    }

    fun delete(path: String?) {
        if (path != null) File(path).delete()
    }
}

/** Told when a food package import finished, so lists that are already loaded can reload. */
object FoodPackageEvents {
    val imported = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
}
