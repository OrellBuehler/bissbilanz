package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodPackageFoodRole
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FoodPackageManifestTest {
    private fun foodJson(extra: String = "") =
        """{"ref":"f1","role":"selected","name":" Oats ","brand":null,"servingSize":40,"servingUnit":"g",
           "calories":150,"protein":5,"carbs":27,"fat":3,"fiber":4,"sugar":1.5,"barcode":"7610","labels":["oat"]$extra}"""

    private fun manifestJson(
        foods: String = foodJson(),
        recipes: String = "[]",
        header: String = """"format":"bissbilanz.food-package","formatVersion":1""",
    ) = """{$header,"exportedAt":"2026-09-28T10:00:00.000Z","foods":[$foods],"recipes":$recipes}"""

    private fun kind(text: String) = assertFailsWith<FoodPackageException> { FoodPackageManifestCodec.parse(text) }.kind

    @Test
    fun parsesAValidManifest() {
        val manifest = FoodPackageManifestCodec.parse(manifestJson())
        assertEquals(1, manifest.formatVersion)
        val food = manifest.foods.single()
        assertEquals("Oats", food.name)
        assertEquals(FoodPackageFoodRole.selected, food.role)
        assertEquals(40.0, food.servingSize)
        assertEquals(mapOf("sugar" to 1.5), food.nutrients)
        assertEquals(listOf("oat"), food.labels)
        assertNull(food.brand)
        assertTrue(manifest.recipes.isEmpty())
    }

    @Test
    fun roleDefaultsToSelected() {
        val text =
            manifestJson(
                foods =
                    """{"ref":"f1","name":"A","servingSize":1,"servingUnit":"g",""" +
                        """"calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0}""",
            )
        assertEquals(
            FoodPackageFoodRole.selected,
            FoodPackageManifestCodec
                .parse(text)
                .foods
                .single()
                .role,
        )
    }

    @Test
    fun recipesAreOptional() {
        val text = """{"format":"bissbilanz.food-package","formatVersion":1,"foods":[]}"""
        assertTrue(FoodPackageManifestCodec.parse(text).recipes.isEmpty())
    }

    @Test
    fun acceptsAByteOrderMark() {
        assertEquals(1, FoodPackageManifestCodec.parse("" + manifestJson()).foods.size)
    }

    @Test
    fun rejectsThingsThatAreNotPackages() {
        assertEquals(FoodPackageException.Kind.NOT_A_PACKAGE, kind("not json"))
        assertEquals(FoodPackageException.Kind.NOT_A_PACKAGE, kind("[1,2]"))
        assertEquals(FoodPackageException.Kind.NOT_A_PACKAGE, kind("""{"format":"other","foods":[]}"""))
    }

    @Test
    fun recognizesAnAccountExport() {
        assertEquals(FoodPackageException.Kind.ACCOUNT_EXPORT, kind("""{"formatVersion":1,"foods":[]}"""))
    }

    @Test
    fun rejectsANewerVersion() {
        assertEquals(
            FoodPackageException.Kind.NEWER_VERSION,
            kind(manifestJson(header = """"format":"bissbilanz.food-package","formatVersion":2""")),
        )
    }

    @Test
    fun rejectsInvalidContent() {
        assertEquals(FoodPackageException.Kind.INVALID, kind(manifestJson(foods = foodJson().replace("\"f1\"", "\"x1\""))))
        assertEquals(FoodPackageException.Kind.INVALID, kind(manifestJson(foods = foodJson().replace("\"g\"", "\"stone\""))))
        assertEquals(
            FoodPackageException.Kind.INVALID,
            kind(manifestJson(foods = foodJson().replace("\"calories\":150", "\"calories\":-1"))),
        )
        assertEquals(
            FoodPackageException.Kind.INVALID,
            kind(manifestJson(foods = foodJson().replace("\"servingSize\":40", "\"servingSize\":0"))),
        )
        assertEquals(FoodPackageException.Kind.INVALID, kind(manifestJson(foods = foodJson(""","novaGroup":7"""))))
        assertEquals(FoodPackageException.Kind.INVALID, kind(manifestJson(foods = foodJson(""","sodium":-3"""))))
        assertEquals(FoodPackageException.Kind.INVALID, kind(manifestJson(foods = foodJson(",\"image\":\"../secret.png\""))))
        assertEquals(FoodPackageException.Kind.INVALID, kind(manifestJson(foods = "${foodJson()},${foodJson()}")))
    }

    @Test
    fun rejectsABrokenRecipe() {
        val recipe = """{"ref":"r1","name":"Porridge","totalServings":2,"ingredients":[{"food":"f1","quantity":50,"servingUnit":"g"}]}"""
        assertEquals(1, FoodPackageManifestCodec.parse(manifestJson(recipes = "[$recipe]")).recipes.size)
        assertEquals(
            FoodPackageException.Kind.INVALID,
            kind(manifestJson(recipes = "[${recipe.replace("\"quantity\":50", "\"quantity\":0")}]")),
        )
        assertEquals(FoodPackageException.Kind.INVALID, kind(manifestJson(recipes = "[$recipe,$recipe]")))
    }

    @Test
    fun roundTripsThroughTheWriter() {
        val recipe =
            """{"ref":"r1","name":"Porridge","totalServings":2,"cookedWeight":300,"image":"images/r1.jpg",""" +
                """"ingredients":[{"food":"f1","quantity":50,"servingUnit":"g"}]}"""
        val manifest =
            FoodPackageManifestCodec.parse(
                manifestJson(foods = foodJson(""","novaGroup":2,"additives":["e330"]"""), recipes = "[$recipe]"),
            )
        val text = FoodPackageManifestCodec.encode(manifest)
        assertEquals(manifest, FoodPackageManifestCodec.parse(text))
        assertTrue("\"format\": \"bissbilanz.food-package\"" in text)
        // Every nutrient is written, null when unknown, like the web exporter.
        assertTrue("\"vitaminB12\": null" in text)
    }

    @Test
    fun theNutrientKeysAreTheFoodModelsExtendedNutrients() {
        assertEquals(43, EXTENDED_NUTRIENT_KEYS.size)
        assertEquals(EXTENDED_NUTRIENT_KEYS.size, EXTENDED_NUTRIENT_KEYS.toSet().size)
        val descriptor = Food.serializer().descriptor
        val names = (0 until descriptor.elementsCount).map { descriptor.getElementName(it) }
        val start = names.indexOf("saturatedFat")
        assertEquals(EXTENDED_NUTRIENT_KEYS, names.subList(start, start + EXTENDED_NUTRIENT_KEYS.size))
    }
}
