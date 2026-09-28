package com.bissbilanz.foodpackage

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.security.MessageDigest
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

/**
 * [FoodPackageArchive] on `java.util.zip`; the same rules as the server's `archive.ts`.
 *
 * A zip is opened without trusting any of its sizes: only `bissbilanz-foods.json` is inflated up
 * front, under a cap, and images are inflated later, only for the exact `images/<name>.<ext>`
 * paths the manifest names, each under its own cap and a running total. Nothing is ever written
 * to disk from an entry name, so a `../` entry has nothing to escape from.
 */
class AndroidFoodPackageArchive : FoodPackageArchive {
    override fun read(path: String): FoodPackageFile {
        val file = File(path)
        val length = file.length()
        if (length == 0L) throw FoodPackageException(FoodPackageException.Kind.EMPTY, "The file is empty")
        if (length > MAX_PACKAGE_BYTES) {
            throw FoodPackageException(
                FoodPackageException.Kind.TOO_LARGE,
                "File must be ${MAX_PACKAGE_BYTES / 1024 / 1024}MB or smaller",
            )
        }
        val hash = sha256(file)
        if (!isZip(file)) {
            if (length > MAX_MANIFEST_BYTES) {
                throw FoodPackageException(
                    FoodPackageException.Kind.NOT_A_PACKAGE,
                    "Unrecognized file: expected a Bissbilanz food package",
                )
            }
            val manifest = FoodPackageManifestCodec.parse(file.readBytes().decodeToString())
            return Opened(file, manifest, hash, root = null)
        }
        return openZip(file, hash)
    }

    private fun isZip(file: File): Boolean {
        val head = ByteArray(3)
        val read = file.inputStream().use { it.read(head) }
        return read == 3 && head[0] == 0x50.toByte() && head[1] == 0x4B.toByte() && (head[2] == 0x03.toByte() || head[2] == 0x05.toByte())
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    /** The manifest at the root, or inside one top-level folder (re-zipped by a file manager). */
    private fun manifestPrefix(name: String): String? {
        if (name == MANIFEST_NAME) return ""
        val match = FOLDER_MANIFEST.matchEntire(name) ?: return null
        return match.groupValues[1]
    }

    private fun openZip(
        file: File,
        hash: String,
    ): FoodPackageFile {
        try {
            ZipFile(file).use { zip ->
                var entries = 0
                var prefix: String? = null
                var manifestEntry: ZipEntry? = null
                var accountExport = false
                val enumeration = zip.entries()
                while (enumeration.hasMoreElements()) {
                    val entry = enumeration.nextElement()
                    if (++entries > MAX_ZIP_ENTRIES) {
                        throw FoodPackageException(FoodPackageException.Kind.TOO_MANY_FILES, "The archive has too many files")
                    }
                    val found = manifestPrefix(entry.name)
                    if (found != null && prefix == null && entry.size <= MAX_MANIFEST_BYTES) {
                        prefix = found
                        manifestEntry = entry
                    } else if (entry.name.endsWith("bissbilanz.json")) {
                        accountExport = true
                    }
                }
                val entry = manifestEntry
                val root = prefix
                if (entry == null || root == null) {
                    if (accountExport) throw FoodPackageException(FoodPackageException.Kind.ACCOUNT_EXPORT, WRONG_FILE_ACCOUNT_EXPORT)
                    throw FoodPackageException(
                        FoodPackageException.Kind.NO_MANIFEST,
                        "The archive does not contain a readable bissbilanz-foods.json",
                    )
                }
                val bytes =
                    zip.getInputStream(entry).use { readBounded(it, MAX_MANIFEST_BYTES) }
                        ?: throw FoodPackageException(FoodPackageException.Kind.TOO_LARGE, "The package manifest is too large")
                return Opened(file, FoodPackageManifestCodec.parse(bytes.decodeToString()), hash, root)
            }
        } catch (e: IOException) {
            throw FoodPackageException(FoodPackageException.Kind.DAMAGED, "The archive is damaged and cannot be read", e)
        }
    }

    /** All of [input], or null once it exceeds [limit] bytes — a declared entry size proves nothing. */
    private fun readBounded(
        input: InputStream,
        limit: Long,
    ): ByteArray? {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(16 * 1024)
        var total = 0L
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            if (total > limit) return null
            out.write(buffer, 0, count)
        }
        return out.toByteArray()
    }

    private inner class Opened(
        private val file: File,
        override val manifest: PackageManifest,
        override val packageHash: String,
        /** The folder the manifest sits in (empty for the root); null for a bare JSON manifest. */
        private val root: String?,
    ) : FoodPackageFile {
        override fun readImages(paths: List<String>): Map<String, ByteArray> {
            val wanted = paths.filter { IMAGE_PATH_REGEX.matches(it) }.distinct()
            if (root == null || wanted.isEmpty()) return emptyMap()
            val images = LinkedHashMap<String, ByteArray>()
            var total = 0L
            try {
                ZipFile(file).use { zip ->
                    for (path in wanted) {
                        val entry = zip.getEntry(root + path) ?: continue
                        if (entry.size > MAX_IMAGE_ENTRY_BYTES || total + entry.size > MAX_TOTAL_INFLATED_BYTES) continue
                        val bytes = zip.getInputStream(entry).use { readBounded(it, MAX_IMAGE_ENTRY_BYTES) } ?: continue
                        total += bytes.size
                        if (total > MAX_TOTAL_INFLATED_BYTES) break
                        images[path] = bytes
                    }
                }
            } catch (e: IOException) {
                throw FoodPackageException(FoodPackageException.Kind.DAMAGED, "The archive is damaged and cannot be read", e)
            }
            return images
        }
    }

    override fun write(
        manifestJson: String,
        images: Map<String, ByteArray>,
    ): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            zip.setLevel(6)
            putEntry(zip, "README.txt", README.encodeToByteArray())
            putEntry(zip, MANIFEST_NAME, manifestJson.encodeToByteArray())
            // Photos are already compressed — store without deflate.
            zip.setLevel(0)
            for ((name, bytes) in images) putEntry(zip, name, bytes)
        }
        return out.toByteArray()
    }

    private fun putEntry(
        zip: ZipOutputStream,
        name: String,
        bytes: ByteArray,
    ) {
        val entry = ZipEntry(name)
        entry.time = FIXED_ENTRY_TIME
        zip.putNextEntry(entry)
        zip.write(bytes)
        zip.closeEntry()
    }

    private companion object {
        val FOLDER_MANIFEST = Regex("^([^/]+/)bissbilanz-foods\\.json$")

        /** 2026-01-01T12:00:00Z; every archive carries the same timestamps. */
        const val FIXED_ENTRY_TIME = 1_767_268_800_000L

        const val README =
            "Bissbilanz food package\n" +
                "=======================\n" +
                "\n" +
                "A collection of foods and recipes to share with other Bissbilanz users.\n" +
                "Import it in Bissbilanz under Foods -> Import -> Food package.\n" +
                "\n" +
                "bissbilanz-foods.json   Foods, recipes and their ingredients.\n" +
                "images/                 Photos of the foods and recipes.\n"
    }
}
