package com.bissbilanz.android.images

import android.content.Context
import android.net.Uri
import java.io.File

/**
 * On-device store for food and recipe images.
 *
 * One directory serves three needs, all keyed by the server's own filename
 * (a UUID, so collision-free): the offline cache for server-hosted images, the
 * destination the account downgrade localizes photos into, and the home of
 * images attached while in Local mode, which have no server to live on.
 * `file://` URIs out of here are passed straight through by the image loaders.
 */
object LocalImageStore {
    private const val DIR_NAME = "local-images"

    fun directory(context: Context): File = File(context.filesDir, DIR_NAME).apply { mkdirs() }

    /** The cache key for an image URL, or null if the URL isn't one we cache. */
    fun cacheKey(imageUrl: String?): String? {
        if (imageUrl == null) return null
        if (!imageUrl.startsWith("/uploads/")) return null
        val name = imageUrl.substringAfterLast('/')
        return name.takeIf { UPLOAD_NAME.matches(it) }
    }

    fun cachedFile(
        context: Context,
        imageUrl: String?,
    ): File? {
        val key = cacheKey(imageUrl) ?: return null
        return File(directory(context), key).takeIf { it.isFile }
    }

    fun write(
        context: Context,
        fileName: String,
        bytes: ByteArray,
    ): File =
        File(directory(context), fileName).also { file ->
            file.writeBytes(bytes)
        }

    fun fileUri(file: File): String = Uri.fromFile(file).toString()

    /**
     * Drops the on-device copy of an image. Called when the row that referenced
     * it is deleted, so a deleted food doesn't keep occupying storage — and, for
     * a `file://` image, so the only copy goes with it.
     */
    fun evict(
        context: Context,
        imageUrl: String?,
    ) {
        val file = fileFor(context, imageUrl) ?: return
        runCatching { file.delete() }
    }

    /** Clears the whole store — used when the account's data is wiped. */
    fun clear(context: Context) {
        runCatching { directory(context).listFiles()?.forEach { it.delete() } }
    }

    /**
     * Resolves an image URL to a file inside this directory, whether it is a
     * cached upload or a locally-attached `file://` photo. Confined to the
     * directory itself: a stored row must never be able to point the app at an
     * arbitrary file.
     */
    fun fileFor(
        context: Context,
        imageUrl: String?,
    ): File? {
        if (imageUrl == null) return null
        val dir = directory(context).canonicalFile
        val candidate =
            when {
                imageUrl.startsWith("file://") ->
                    Uri.parse(imageUrl).path?.let { File(it) }
                else -> cacheKey(imageUrl)?.let { File(dir, it) }
            } ?: return null
        val file = candidate.canonicalFile
        return file.takeIf { it.parentFile == dir }
    }

    private val UPLOAD_NAME = Regex("^[a-f0-9-]+\\.webp$")
}
