package com.bissbilanz.foodpackage

import kotlinx.coroutines.test.runTest
import java.io.File
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AndroidBulkPackageReaderTest {
    private val reader = AndroidBulkPackageReader()
    private val files = mutableListOf<File>()

    @AfterTest
    fun cleanUp() = files.forEach { it.delete() }

    private fun temp(suffix: String = ".bissbilanz") = File.createTempFile("bulk-test", suffix).also { files.add(it) }

    private suspend fun collect(path: String): List<BulkFoodResult> {
        val results = mutableListOf<BulkFoodResult>()
        reader.open(path).use { session -> session.streamFoods { results.add(it) } }
        return results
    }

    private suspend fun kind(block: suspend () -> Unit): FoodPackageException.Kind {
        try {
            block()
        } catch (e: FoodPackageException) {
            return e.kind
        }
        throw AssertionError("expected the package to be refused")
    }

    @Test
    fun streamsManyFoodsInManifestOrder() =
        runTest {
            val foods = (1..4000).map { BulkPackageFixtures.foodJson(it) }
            val file = BulkPackageFixtures.zip(temp(), BulkPackageFixtures.manifest(foods))

            reader.open(file.path).use { session ->
                assertEquals(4000, session.info.foodCount)
                assertEquals(0, session.info.recipeCount)
                assertEquals("2026-10-06T10:00:00.000Z", session.info.exportedAt)
            }
            val results = collect(file.path)

            assertEquals(4000, results.size)
            assertTrue(results.all { it.food != null })
            assertEquals("Food 1", results.first().food?.name)
            assertEquals("Food 4000", results.last().food?.name)
            assertEquals((0 until 4000).toList(), results.map { it.index })
        }

    @Test
    fun acceptsAnyKeyOrderWithRecipesAfterFoodsAndTheHeaderLast() =
        runTest {
            val recipe =
                """{"ref":"r1","name":"Soup","totalServings":2,"cookedWeight":null,"image":null,""" +
                    """"ingredients":[{"food":"f1","quantity":1,"servingUnit":"g"}]}"""
            val manifest =
                BulkPackageFixtures.manifest(
                    foods = listOf(BulkPackageFixtures.foodJson(1), BulkPackageFixtures.foodJson(2)),
                    recipes = listOf(recipe),
                    order = listOf("foods", "recipes", "exportedAt", "formatVersion", "format"),
                )
            val file = BulkPackageFixtures.zip(temp(), manifest)

            reader.open(file.path).use { session ->
                assertEquals(2, session.info.foodCount)
                assertEquals(1, session.info.recipeCount)
            }
            assertEquals(2, collect(file.path).size)
        }

    @Test
    fun hardStringsInsideFoodsDoNotConfuseTheScanner() =
        runTest {
            val tricky =
                BulkPackageFixtures.foodJson(
                    1,
                    name = "Salt \"n\" } ] { [ pepper \\ ",
                    brand = "Brace } Brand",
                    labels = listOf("a,b", "c]"),
                )
            val file = BulkPackageFixtures.zip(temp(), BulkPackageFixtures.manifest(listOf(tricky, BulkPackageFixtures.foodJson(2))))

            val results = collect(file.path)

            assertEquals("Salt \"n\" } ] { [ pepper \\", results[0].food?.name)
            assertEquals("Brace } Brand", results[0].food?.brand)
            assertEquals(listOf("a,b", "c]"), results[0].food?.labels)
            assertEquals("Food 2", results[1].food?.name)
        }

    @Test
    fun anInvalidFoodIsReportedAndTheStreamGoesOn() =
        runTest {
            val broken = """{"ref":"f2","name":"","servingSize":100}"""
            val notJson = """{"ref": nope}"""
            val manifest =
                BulkPackageFixtures.manifest(
                    listOf(BulkPackageFixtures.foodJson(1), broken, notJson, BulkPackageFixtures.foodJson(4)),
                )
            val file = BulkPackageFixtures.zip(temp(), manifest)

            val results = collect(file.path)

            assertEquals(4, results.size)
            assertNotNull(results[0].food)
            assertNull(results[1].food)
            assertTrue(results[1].error!!.contains("foods.1"))
            assertNull(results[2].food)
            assertNotNull(results[3].food)
        }

    @Test
    fun anOversizedFoodIsReportedWithoutBeingKept() =
        runTest {
            val huge =
                BulkPackageFixtures.foodJson(
                    1,
                    name = "Big",
                    extra = ""","padding":"${"x".repeat(BULK_MAX_FOOD_JSON_CHARS + 10)}"""",
                )
            val file = BulkPackageFixtures.zip(temp(), BulkPackageFixtures.manifest(listOf(huge, BulkPackageFixtures.foodJson(2))))

            val results = collect(file.path)

            assertNull(results[0].food)
            assertTrue(results[0].error!!.contains("too large"))
            assertEquals("Food 2", results[1].food?.name)
        }

    @Test
    fun readsImagesFromTheArchiveAndRefusesOthers() =
        runTest {
            val file =
                BulkPackageFixtures.zip(
                    temp(),
                    BulkPackageFixtures.manifest(listOf(BulkPackageFixtures.foodJson(1, image = "images/f1.webp"))),
                    images = mapOf("images/f1.webp" to BulkPackageFixtures.webp),
                )

            reader.open(file.path).use { session ->
                assertContentEquals(BulkPackageFixtures.webp, session.readImage("images/f1.webp"))
                assertNull(session.readImage("images/missing.webp"))
                assertNull(session.readImage("../etc/passwd"))
                assertNull(session.readImage("README.txt"))
            }
        }

    @Test
    fun findsTheManifestInsideOneTopLevelFolder() =
        runTest {
            val file =
                BulkPackageFixtures.zip(
                    temp(),
                    BulkPackageFixtures.manifest(listOf(BulkPackageFixtures.foodJson(1, image = "images/f1.webp"))),
                    images = mapOf("images/f1.webp" to BulkPackageFixtures.webp),
                    prefix = "my-foods/",
                )

            reader.open(file.path).use { session ->
                assertEquals(1, session.info.foodCount)
                assertNotNull(session.readImage("images/f1.webp"))
            }
        }

    @Test
    fun readsABareJsonManifest() =
        runTest {
            val file = temp(".json").apply { writeText("" + BulkPackageFixtures.manifest(listOf(BulkPackageFixtures.foodJson(1)))) }

            assertEquals(1, collect(file.path).size)
        }

    @Test
    fun refusesWhatIsNotAFoodPackage() =
        runTest {
            val wrongFormat = BulkPackageFixtures.zip(temp(), BulkPackageFixtures.manifest(emptyList(), format = "something.else"))
            assertEquals(FoodPackageException.Kind.NOT_A_PACKAGE, kind { reader.open(wrongFormat.path) })

            val accountExport = temp(".json").apply { writeText("""{"formatVersion":1,"foods":[]}""") }
            assertEquals(FoodPackageException.Kind.ACCOUNT_EXPORT, kind { reader.open(accountExport.path) })

            val newer = BulkPackageFixtures.zip(temp(), BulkPackageFixtures.manifest(emptyList(), version = 2))
            assertEquals(FoodPackageException.Kind.NEWER_VERSION, kind { reader.open(newer.path) })

            val noManifest =
                temp().apply {
                    outputStream().use { out ->
                        java.util.zip.ZipOutputStream(out).use {
                            it.putNextEntry(java.util.zip.ZipEntry("a.txt"))
                            it.write(1)
                        }
                    }
                }
            assertEquals(FoodPackageException.Kind.NO_MANIFEST, kind { reader.open(noManifest.path) })

            val empty = temp()
            assertEquals(FoodPackageException.Kind.EMPTY, kind { reader.open(empty.path) })

            val garbage = temp(".json").apply { writeText("not json at all") }
            assertEquals(FoodPackageException.Kind.NOT_A_PACKAGE, kind { reader.open(garbage.path) })
        }

    @Test
    fun aTruncatedManifestIsDamagedNotSilentlyShort() =
        runTest {
            val text = BulkPackageFixtures.manifest((1..20).map { BulkPackageFixtures.foodJson(it) })
            val file = temp(".json").apply { writeText(text.substring(0, text.length / 2)) }

            assertEquals(FoodPackageException.Kind.DAMAGED, kind { reader.open(file.path) })
        }
}
