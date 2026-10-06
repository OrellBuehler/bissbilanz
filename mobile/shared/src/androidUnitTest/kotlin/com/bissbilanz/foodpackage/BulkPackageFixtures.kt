package com.bissbilanz.foodpackage

import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** Test packages in the shape `crawler/lib/package-writer.ts` writes: a manifest plus uncompressed images. */
internal object BulkPackageFixtures {
    /** A tiny but valid lossy webp header, enough for [webp] sniffing and 400 x 400 dimension checks. */
    val webp: ByteArray =
        "RIFF".encodeToByteArray() + byteArrayOf(0x20, 0, 0, 0) + "WEBPVP8 ".encodeToByteArray() +
            byteArrayOf(0x10, 0, 0, 0, 0, 0, 0, 0x9D.toByte(), 0x01, 0x2A, 0x90.toByte(), 0x01, 0x90.toByte(), 0x01)

    fun foodJson(
        index: Int,
        name: String = "Food $index",
        brand: String? = null,
        barcode: String? = null,
        image: String? = null,
        labels: List<String> = emptyList(),
        extra: String = "",
    ): String =
        buildString {
            append("""{"ref":"f$index","role":"selected","name":${quote(name)},""")
            append(""""brand":${brand?.let { quote(it) } ?: "null"},""")
            append(""""servingSize":100,"servingUnit":"g","calories":${100 + index % 50},"protein":1,"carbs":2,"fat":3,"fiber":4,""")
            append(""""barcode":${barcode?.let { quote(it) } ?: "null"},""")
            append(""""labels":[${labels.joinToString(",") { quote(it) }}],""")
            append(""""image":${image?.let { quote(it) } ?: "null"},"imageUrl":null""")
            append(extra)
            append("}")
        }

    fun quote(value: String): String = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

    fun manifest(
        foods: List<String>,
        recipes: List<String> = emptyList(),
        version: Int = 1,
        format: String = FOOD_PACKAGE_FORMAT,
        order: List<String> = listOf("format", "formatVersion", "exportedAt", "foods", "recipes"),
    ): String {
        val parts =
            mapOf(
                "format" to """"format":${quote(format)}""",
                "formatVersion" to """"formatVersion":$version""",
                "exportedAt" to """"exportedAt":"2026-10-06T10:00:00.000Z"""",
                "foods" to """"foods":[${foods.joinToString(",\n")}]""",
                "recipes" to """"recipes":[${recipes.joinToString(",")}]""",
            )
        return "{\n" + order.joinToString(",\n") { parts.getValue(it) } + "\n}"
    }

    fun zip(
        file: File,
        manifest: String,
        images: Map<String, ByteArray> = emptyMap(),
        prefix: String = "",
    ): File {
        ZipOutputStream(file.outputStream().buffered()).use { zip ->
            zip.setLevel(6)
            put(zip, "${prefix}README.txt", "Bissbilanz food package".encodeToByteArray())
            put(zip, "$prefix$MANIFEST_NAME", manifest.encodeToByteArray())
            zip.setLevel(0)
            for ((name, bytes) in images) put(zip, "$prefix$name", bytes)
        }
        return file
    }

    private fun put(
        zip: ZipOutputStream,
        name: String,
        bytes: ByteArray,
    ) {
        zip.putNextEntry(ZipEntry(name))
        zip.write(bytes)
        zip.closeEntry()
    }
}
