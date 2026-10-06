package com.bissbilanz.foodpackage

import com.bissbilanz.util.Failures
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.InputStreamReader
import java.util.zip.ZipEntry
import java.util.zip.ZipFile

/**
 * [BulkPackageReader] for packages of tens of thousands of foods. The file is never read as a
 * whole: the manifest is scanned as a stream ([ManifestScanner]) and images are inflated one at
 * a time from the zip's central directory, which `java.util.zip` reads with ZIP64 support.
 *
 * Nothing is trusted from the archive's own sizes and nothing is written to disk from an entry
 * name, like [AndroidFoodPackageArchive].
 */
class AndroidBulkPackageReader : BulkPackageReader {
    override suspend fun open(path: String): BulkPackageSession {
        val file = File(path)
        val length = file.length()
        if (length == 0L) throw FoodPackageException(FoodPackageException.Kind.EMPTY, "The file is empty")
        if (length > BULK_MAX_BYTES) {
            throw FoodPackageException(
                FoodPackageException.Kind.TOO_LARGE,
                "File must be ${BULK_MAX_BYTES / 1024 / 1024 / 1024}GB or smaller",
            )
        }
        if (!isZip(file)) return Session(file, null, null).also { it.scanInfo() }
        val zip =
            try {
                ZipFile(file)
            } catch (e: IOException) {
                throw FoodPackageException(FoodPackageException.Kind.DAMAGED, "The archive is damaged and cannot be read", e)
            }
        try {
            val located = locateManifest(zip)
            return Session(file, zip, located).also { it.scanInfo() }
        } catch (e: Exception) {
            zip.close()
            throw e
        }
    }

    private fun isZip(file: File): Boolean {
        val head = ByteArray(3)
        val read = file.inputStream().use { it.read(head) }
        return read == 3 && head[0] == 0x50.toByte() && head[1] == 0x4B.toByte() && (head[2] == 0x03.toByte() || head[2] == 0x05.toByte())
    }

    private class Located(
        val entry: ZipEntry,
        val root: String,
    )

    private fun locateManifest(zip: ZipFile): Located {
        try {
            zip.getEntry(MANIFEST_NAME)?.let { return Located(it, "") }
            var accountExport = false
            val entries = zip.entries()
            while (entries.hasMoreElements()) {
                val entry = entries.nextElement()
                val match = FOLDER_MANIFEST.matchEntire(entry.name)
                if (match != null) return Located(entry, match.groupValues[1])
                if (entry.name.endsWith("bissbilanz.json")) accountExport = true
            }
            if (accountExport) throw FoodPackageException(FoodPackageException.Kind.ACCOUNT_EXPORT, WRONG_FILE_ACCOUNT_EXPORT)
        } catch (e: IOException) {
            throw FoodPackageException(FoodPackageException.Kind.DAMAGED, "The archive is damaged and cannot be read", e)
        }
        throw FoodPackageException(
            FoodPackageException.Kind.NO_MANIFEST,
            "The archive does not contain a readable bissbilanz-foods.json",
        )
    }

    private class Session(
        private val file: File,
        private val zip: ZipFile?,
        private val located: Located?,
    ) : BulkPackageSession {
        override var info: BulkManifestInfo = BulkManifestInfo(null, 0, 0)
            private set

        private inline fun <T> withManifest(block: (InputStream) -> T): T =
            try {
                if (zip != null && located != null) {
                    zip.getInputStream(located.entry).use(block)
                } else {
                    file.inputStream().use(block)
                }
            } catch (e: IOException) {
                throw FoodPackageException(FoodPackageException.Kind.DAMAGED, "The archive is damaged and cannot be read", e)
            }

        private fun scanner(stream: InputStream) =
            ManifestScanner(InputStreamReader(stream, Charsets.UTF_8), BULK_MAX_MANIFEST_BYTES, BULK_MAX_FOOD_JSON_CHARS)

        /** First pass: checks the header and counts the foods and recipes, so the second pass can report progress. */
        suspend fun scanInfo() {
            var format: String? = null
            var version: Double? = null
            var exportedAt: String? = null
            var foods = -1
            var recipes = 0
            var sawFoodsKey = false
            withManifest { stream ->
                scanner(stream).walk(
                    onKey = { key ->
                        when (key) {
                            "format", "formatVersion", "exportedAt" -> ManifestScanner.Mode.VALUE
                            "foods", "recipes" -> ManifestScanner.Mode.COUNT
                            else -> ManifestScanner.Mode.SKIP
                        }
                    },
                    onValue = { key, value ->
                        val primitive = value as? JsonPrimitive
                        when (key) {
                            "format" -> format = primitive?.takeIf { it.isString }?.content
                            "formatVersion" -> version = primitive?.takeIf { !it.isString }?.doubleOrNull
                            "exportedAt" -> exportedAt = primitive?.takeIf { it.isString }?.content?.take(MAX_EXPORTED_AT)
                        }
                    },
                    onCount = { key, count ->
                        if (key == "foods") {
                            foods = count
                            sawFoodsKey = true
                        } else {
                            recipes = count
                        }
                    },
                )
            }
            if (format != FOOD_PACKAGE_FORMAT) {
                if (sawFoodsKey && version != null && format == null) {
                    throw FoodPackageException(FoodPackageException.Kind.ACCOUNT_EXPORT, WRONG_FILE_ACCOUNT_EXPORT)
                }
                throw FoodPackageException(
                    FoodPackageException.Kind.NOT_A_PACKAGE,
                    "Unrecognized file: expected a Bissbilanz food package",
                )
            }
            val declared = version
            if (declared != null && declared > FOOD_PACKAGE_VERSION) {
                throw FoodPackageException(
                    FoodPackageException.Kind.NEWER_VERSION,
                    "This package was made by a newer version of Bissbilanz — update first",
                )
            }
            if (declared == null || declared < 1) {
                throw FoodPackageException(FoodPackageException.Kind.INVALID, "Invalid food package: formatVersion")
            }
            if (foods < 0) throw FoodPackageException(FoodPackageException.Kind.INVALID, "Invalid food package: foods — Expected array")
            if (foods > BULK_MAX_FOODS) {
                throw FoodPackageException(FoodPackageException.Kind.TOO_LARGE, "A package can hold at most $BULK_MAX_FOODS foods")
            }
            info = BulkManifestInfo(exportedAt, foods, recipes)
        }

        override suspend fun streamFoods(onFood: suspend (BulkFoodResult) -> Unit) {
            withManifest { stream ->
                scanner(stream).walk(
                    onKey = { key -> if (key == "foods") ManifestScanner.Mode.ELEMENTS else ManifestScanner.Mode.SKIP },
                    onElement = { _, index, raw -> onFood(parseFood(index, raw)) },
                )
            }
        }

        private fun parseFood(
            index: Int,
            raw: String?,
        ): BulkFoodResult {
            if (raw == null) return BulkFoodResult(index, null, "foods.$index: too large")
            return try {
                val element = JSON.parseToJsonElement(raw)
                BulkFoodResult(index, FoodPackageManifestCodec.parseFoodElement(element, "foods.$index"), null)
            } catch (e: FoodPackageException) {
                BulkFoodResult(index, null, e.message ?: "foods.$index: invalid")
            } catch (e: kotlinx.serialization.SerializationException) {
                BulkFoodResult(index, null, "foods.$index: malformed JSON")
            }
        }

        override fun readImage(path: String): ByteArray? {
            val zipFile = zip ?: return null
            val root = located?.root ?: return null
            if (!IMAGE_PATH_REGEX.matches(path)) return null
            return try {
                val entry = zipFile.getEntry(root + path) ?: return null
                if (entry.size > BULK_MAX_IMAGE_ENTRY_BYTES) return null
                zipFile.getInputStream(entry).use { readBounded(it, BULK_MAX_IMAGE_ENTRY_BYTES) }
            } catch (e: IOException) {
                Failures.report(e)
                null
            }
        }

        override fun close() {
            zip?.close()
        }
    }

    private companion object {
        val FOLDER_MANIFEST = Regex("^([^/]+/)bissbilanz-foods\\.json$")
        const val MAX_EXPORTED_AT = 64
        val JSON = kotlinx.serialization.json.Json { isLenient = false }

        /** All of [input], or null once it exceeds [limit] bytes — a declared entry size proves nothing. */
        fun readBounded(
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
    }
}
