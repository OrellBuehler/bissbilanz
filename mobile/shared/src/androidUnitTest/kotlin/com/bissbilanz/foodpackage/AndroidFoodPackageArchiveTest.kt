package com.bissbilanz.foodpackage

import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class AndroidFoodPackageArchiveTest {
    private val archive = AndroidFoodPackageArchive()
    private val created = mutableListOf<File>()

    @AfterTest
    fun cleanUp() = created.forEach { it.delete() }

    private fun tempFile(bytes: ByteArray): File =
        File.createTempFile("package", ".bissbilanz").also {
            it.writeBytes(bytes)
            created.add(it)
        }

    private val manifest =
        """{"format":"bissbilanz.food-package","formatVersion":1,"exportedAt":null,
           "foods":[{"ref":"f1","name":"Oats","servingSize":40,"servingUnit":"g","calories":150,"protein":5,"carbs":27,"fat":3,"fiber":4,
                     "image":"images/f1.webp"}],"recipes":[]}"""

    private fun zip(entries: Map<String, ByteArray>): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            for ((name, bytes) in entries) {
                zip.putNextEntry(ZipEntry(name))
                zip.write(bytes)
                zip.closeEntry()
            }
        }
        return out.toByteArray()
    }

    private fun kind(bytes: ByteArray) = assertFailsWith<FoodPackageException> { archive.read(tempFile(bytes).path) }.kind

    @Test
    fun writesAPackageItsOwnReaderAccepts() {
        val image = byteArrayOf(1, 2, 3, 4)
        val written = archive.write(manifest, mapOf("images/f1.webp" to image))
        val opened = archive.read(tempFile(written).path)
        assertEquals(
            "Oats",
            opened.manifest.foods
                .single()
                .name,
        )
        assertEquals(64, opened.packageHash.length)
        assertContentEquals(image, opened.readImages(listOf("images/f1.webp")).getValue("images/f1.webp"))
    }

    @Test
    fun writtenArchiveHoldsTheReadmeManifestAndImages() {
        val written = archive.write(manifest, mapOf("images/f1.webp" to byteArrayOf(9)))
        val names = mutableListOf<String>()
        java.util.zip.ZipInputStream(written.inputStream()).use { input ->
            while (true) names.add((input.nextEntry ?: break).name)
        }
        assertEquals(listOf("README.txt", "bissbilanz-foods.json", "images/f1.webp"), names)
    }

    @Test
    fun readsOnlyTheRequestedImages() {
        val bytes =
            zip(
                mapOf(
                    MANIFEST_NAME to manifest.encodeToByteArray(),
                    "images/f1.webp" to byteArrayOf(1),
                    "images/f2.webp" to byteArrayOf(2),
                ),
            )
        val opened = archive.read(tempFile(bytes).path)
        assertEquals(listOf("images/f1.webp"), opened.readImages(listOf("images/f1.webp")).keys.toList())
        assertTrue(opened.readImages(listOf("images/missing.webp")).isEmpty())
    }

    @Test
    fun neverReadsAPathTheManifestSchemaWouldNotAllow() {
        val bytes =
            zip(
                mapOf(
                    MANIFEST_NAME to manifest.encodeToByteArray(),
                    "secret.txt" to byteArrayOf(1),
                    "images/../secret.txt" to byteArrayOf(2),
                ),
            )
        val opened = archive.read(tempFile(bytes).path)
        assertTrue(opened.readImages(listOf("secret.txt", "images/../secret.txt", "../secret.txt", "images/f1.exe")).isEmpty())
    }

    @Test
    fun acceptsAManifestInsideOneTopLevelFolder() {
        val bytes = zip(mapOf("share/$MANIFEST_NAME" to manifest.encodeToByteArray(), "share/images/f1.webp" to byteArrayOf(7)))
        val opened = archive.read(tempFile(bytes).path)
        assertEquals(1, opened.manifest.foods.size)
        assertContentEquals(byteArrayOf(7), opened.readImages(listOf("images/f1.webp")).getValue("images/f1.webp"))
    }

    @Test
    fun acceptsABareJsonManifest() {
        val opened = archive.read(tempFile(manifest.encodeToByteArray()).path)
        assertEquals(
            "Oats",
            opened.manifest.foods
                .single()
                .name,
        )
        assertTrue(opened.readImages(listOf("images/f1.webp")).isEmpty())
    }

    @Test
    fun skipsAnImageOverTheEntryCap() {
        val big = ByteArray((MAX_IMAGE_ENTRY_BYTES + 1).toInt())
        val bytes = zip(mapOf(MANIFEST_NAME to manifest.encodeToByteArray(), "images/f1.webp" to big))
        assertTrue(archive.read(tempFile(bytes).path).readImages(listOf("images/f1.webp")).isEmpty())
    }

    @Test
    fun theHashIdentifiesTheFile() {
        val a = archive.read(tempFile(archive.write(manifest, emptyMap())).path)
        val b = archive.read(tempFile(archive.write(manifest.replace("Oats", "Oat"), emptyMap())).path)
        assertTrue(a.packageHash != b.packageHash)
        assertEquals(a.packageHash, archive.read(tempFile(archive.write(manifest, emptyMap())).path).packageHash)
    }

    @Test
    fun rejectsFilesThatAreNotFoodPackages() {
        assertEquals(FoodPackageException.Kind.NOT_A_PACKAGE, kind("hello world".encodeToByteArray()))
        assertEquals(FoodPackageException.Kind.NO_MANIFEST, kind(zip(mapOf("photo.jpg" to byteArrayOf(1)))))
        assertEquals(FoodPackageException.Kind.ACCOUNT_EXPORT, kind(zip(mapOf("bissbilanz.json" to "{}".encodeToByteArray()))))
        assertEquals(
            FoodPackageException.Kind.INVALID,
            kind(
                zip(
                    mapOf(
                        MANIFEST_NAME to manifest.replace("\"Oats\"", "\"\"").encodeToByteArray(),
                    ),
                ),
            ),
        )
        assertEquals(FoodPackageException.Kind.DAMAGED, kind(byteArrayOf(0x50, 0x4B, 0x03, 0x04, 1, 2, 3, 4, 5)))
    }

    @Test
    fun rejectsAnEmptyFile() {
        assertEquals(FoodPackageException.Kind.EMPTY, kind(ByteArray(0)))
    }

    @Test
    fun rejectsAManifestOverTheSizeCap() {
        val padded = manifest + " ".repeat((MAX_MANIFEST_BYTES + 1).toInt())
        val bytes = zip(mapOf(MANIFEST_NAME to padded.encodeToByteArray()))
        val error = kind(bytes)
        assertTrue(error == FoodPackageException.Kind.NO_MANIFEST || error == FoodPackageException.Kind.TOO_LARGE)
    }

    @Test
    fun readsTheServerFixture() {
        val fixture = File("../../tests/fixtures/food-package/server-export.bissbilanz")
        assertTrue(fixture.isFile, "missing ${fixture.absolutePath}")
        val opened = archive.read(fixture.path)
        val manifest = opened.manifest
        assertEquals(listOf("Bio Haferflocken", "Bündner Käse", "Honig", "Vollmilch"), manifest.foods.map { it.name })
        assertEquals(
            mapOf("saturatedFat" to 0.5, "sugar" to 0.4, "sodium" to 2.0, "iron" to 1.8, "vitaminB1" to 0.2, "vitaminB12" to 0.0),
            manifest.foods[0].nutrients,
        )
        assertEquals(listOf("oat", "cereal"), manifest.foods[0].labels)
        assertEquals("Porridge", manifest.recipes.single().name)
        assertEquals(450.0, manifest.recipes.single().cookedWeight)
        val images = opened.readImages(listOf("images/f1.webp", "images/r1.webp"))
        assertEquals(setOf("images/f1.webp", "images/r1.webp"), images.keys)
        assertEquals("RIFF", images.getValue("images/f1.webp").copyOfRange(0, 4).decodeToString())
    }
}
