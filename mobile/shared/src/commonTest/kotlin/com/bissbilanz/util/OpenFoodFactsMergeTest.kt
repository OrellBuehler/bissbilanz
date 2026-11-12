package com.bissbilanz.util

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.api.generated.model.ServingUnit
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OpenFoodFactsMergeTest {
    @Test
    fun scalesPerHundredToTheServingForMassAndVolumeUnits() {
        val cases =
            listOf(
                Triple(100.0, "g", 1.0),
                Triple(30.0, "g", 0.3),
                Triple(0.25, "kg", 2.5),
                Triple(250.0, "ml", 2.5),
                Triple(33.0, "cl", 3.3),
                Triple(0.5, "l", 5.0),
                Triple(1.0, "oz", 0.28349523125),
                Triple(1.0, "lb", 4.5359237),
                Triple(8.0, "fl_oz", 2.365882365),
            )
        for ((size, unit, expected) in cases) {
            val scale = openFoodFactsNutrientScale(size, unit)
            assertTrue(scale != null && abs(scale - expected) < 1e-9, "$size $unit scales by $expected, got $scale")
        }
    }

    @Test
    fun householdMeasuresAndEmptyServingsAreNotScaled() {
        for (unit in listOf("cup", "tbsp", "tsp")) assertNull(openFoodFactsNutrientScale(1.0, unit), unit)
        assertNull(openFoodFactsNutrientScale(0.0, "g"))
        assertNull(openFoodFactsNutrientScale(-5.0, "g"))
        assertNull(openFoodFactsNutrientScale(Double.NaN, "g"))
    }

    @Test
    fun neverTouchesIdentityServingOrCoreMacros() {
        val baseline = foodFixture()
        val result = mergeOpenFoodFactsOntoFood(baseline, productFixture())

        assertEquals("My Oats", result.name)
        assertEquals("Mine", result.brand)
        assertEquals(100.0, result.servingSize)
        assertEquals(ServingUnit.g, result.servingUnit)
        assertEquals(380.0, result.calories)
        assertEquals(13.0, result.protein)
        assertEquals(60.0, result.carbs)
        assertEquals(7.0, result.fat)
        assertEquals(10.0, result.fiber)
        assertEquals("4000000000000", result.barcode)
        assertEquals(true, result.isFavorite)
    }

    @Test
    fun takesQualityDataFromTheProductWhenTheFoodHasNone() {
        val result = mergeOpenFoodFactsOntoFood(foodFixture(), productFixture())

        assertEquals(FoodCreate.NutriScore.c, result.nutriScore)
        assertEquals(3, result.novaGroup)
        assertEquals(listOf("en:e330"), result.additives)
        assertEquals("Oats, sugar", result.ingredientsText)
        assertEquals(listOf("en:cereals"), result.categoriesTags)
    }

    @Test
    fun openFoodFactsWinsForNutriScoreAndNovaGroup() {
        val result = mergeOpenFoodFactsOntoFood(foodFixture(nutriScore = "a", novaGroup = 1), productFixture())

        assertEquals(FoodCreate.NutriScore.c, result.nutriScore)
        assertEquals(3, result.novaGroup)
    }

    @Test
    fun keepsStoredScoresWhenTheProductHasNone() {
        val result =
            mergeOpenFoodFactsOntoFood(
                foodFixture(nutriScore = "a", novaGroup = 1),
                productFixture(nutriScore = null, novaGroup = null),
            )

        assertEquals(FoodCreate.NutriScore.a, result.nutriScore)
        assertEquals(1, result.novaGroup)
    }

    @Test
    fun neverReplacesIngredientsOrAdditivesTheUserEntered() {
        val result =
            mergeOpenFoodFactsOntoFood(
                foodFixture(additives = listOf("en:e300"), ingredientsText = "Oats"),
                productFixture(),
            )

        assertEquals(listOf("en:e300"), result.additives)
        assertEquals("Oats", result.ingredientsText)
    }

    @Test
    fun fillsBlankIngredientsAndEmptyAdditives() {
        val result =
            mergeOpenFoodFactsOntoFood(
                foodFixture(additives = emptyList(), ingredientsText = " \n "),
                productFixture(),
            )

        assertEquals(listOf("en:e330"), result.additives)
        assertEquals("Oats, sugar", result.ingredientsText)
    }

    @Test
    fun leavesFieldsAloneWhenTheProductHasNothingForThem() {
        val result = mergeOpenFoodFactsOntoFood(foodFixture(), productFixture(additives = emptyList(), ingredientsText = "  "))

        assertNull(result.additives)
        assertNull(result.ingredientsText)
    }

    @Test
    fun takesTheProductImageOnlyWhenTheFoodHasNone() {
        val shot = "https://images.openfoodfacts.org/front.jpg"
        assertEquals(shot, mergeOpenFoodFactsOntoFood(foodFixture(imageUrl = null), productFixture()).imageUrl)
        assertEquals(shot, mergeOpenFoodFactsOntoFood(foodFixture(imageUrl = ""), productFixture()).imageUrl)
        assertEquals(
            "/uploads/u/photo.webp",
            mergeOpenFoodFactsOntoFood(foodFixture(imageUrl = "/uploads/u/photo.webp"), productFixture()).imageUrl,
            "the server unlinks the previous upload when imageUrl changes, so enriching must not replace a user photo",
        )
        assertEquals(
            "file:///data/photo.webp",
            mergeOpenFoodFactsOntoFood(foodFixture(imageUrl = "file:///data/photo.webp"), productFixture(imageUrl = null)).imageUrl,
        )
    }

    @Test
    fun scalesPerHundredGramNutrientsToTheServing() {
        val result = mergeOpenFoodFactsOntoFood(foodFixture(servingSize = 30.0), productFixture())

        assertEquals(6.0, result.sugar)
        assertEquals(120.0, result.sodium)
    }

    @Test
    fun scalesPerHundredMillilitreNutrientsToAVolumeServing() {
        val result =
            mergeOpenFoodFactsOntoFood(
                foodFixture(servingSize = 33.0, servingUnit = Food.ServingUnit.cl),
                productFixture(sugar = 10.6),
            )

        assertEquals(34.98, result.sugar)
    }

    @Test
    fun scalesAKilogramServingThroughGrams() {
        val result = mergeOpenFoodFactsOntoFood(foodFixture(servingSize = 1.0, servingUnit = Food.ServingUnit.kg), productFixture())

        assertEquals(200.0, result.sugar)
    }

    @Test
    fun leavesExtendedNutrientsAloneForHouseholdMeasures() {
        val result = mergeOpenFoodFactsOntoFood(foodFixture(servingSize = 1.0, servingUnit = Food.ServingUnit.cup), productFixture())

        assertNull(result.sugar)
        assertNull(result.sodium)
        assertEquals(FoodCreate.NutriScore.c, result.nutriScore)
    }

    @Test
    fun keepsAStoredNutrientTheProductLacks() {
        val result = mergeOpenFoodFactsOntoFood(foodFixture(potassium = 300.0), productFixture())

        assertEquals(300.0, result.potassium)
    }

    @Test
    fun neverReplacesANutrientTheUserEntered() {
        val result = mergeOpenFoodFactsOntoFood(foodFixture(servingSize = 50.0, sugar = 3.0), productFixture())

        assertEquals(3.0, result.sugar)
        assertEquals(200.0, result.sodium)
    }

    @Test
    fun neverWritesAnOpenFoodFactsZeroOverAStoredValueAndKeepsAStoredZero() {
        val result = mergeOpenFoodFactsOntoFood(foodFixture(sugar = 4.0, sodium = 0.0), productFixture(sugar = 0.0))

        assertEquals(4.0, result.sugar)
        assertEquals(0.0, result.sodium)
    }

    @Test
    fun fillsAMissingNutrientWithAnOpenFoodFactsZero() {
        assertEquals(0.0, mergeOpenFoodFactsOntoFood(foodFixture(), productFixture(sugar = 0.0)).sugar)
    }

    @Test
    fun skipsNegativeOrNonFiniteProductNutrients() {
        val result =
            mergeOpenFoodFactsOntoFood(
                foodFixture(),
                productFixture(sugar = -1.0, sodium = Double.NaN, iron = Double.POSITIVE_INFINITY),
            )

        assertNull(result.sugar)
        assertNull(result.sodium)
        assertNull(result.iron)
    }

    @Test
    fun roundsScaledValuesToFourDecimals() {
        val result = mergeOpenFoodFactsOntoFood(foodFixture(servingSize = 1.0, servingUnit = Food.ServingUnit.oz), productFixture())

        assertEquals(5.6699, result.sugar)
    }

    @Test
    fun aProductThatOnlyRepeatsTheFoodChangesNothing() {
        val stored =
            foodFixture(
                nutriScore = "c",
                novaGroup = 3,
                additives = listOf("en:e330"),
                ingredientsText = "Oats, sugar",
                imageUrl = "/uploads/u/photo.webp",
                sugar = 20.0,
                sodium = 400.0,
                labels = listOf("cereal"),
            )

        assertFalse(mergeOpenFoodFactsOntoFood(stored, productFixture()).changes(stored))
        assertFalse(mergeOpenFoodFactsOntoFood(foodFixture(), emptyProduct()).changes(foodFixture()))
    }

    @Test
    fun aFilledInFieldIsAChange() {
        val stored = foodFixture()

        assertTrue(mergeOpenFoodFactsOntoFood(stored, productFixture()).changes(stored))
        assertTrue(mergeOpenFoodFactsOntoFood(stored, emptyProduct(sugar = 1.0)).changes(stored))
        assertTrue(mergeOpenFoodFactsOntoFood(stored, emptyProduct(nutriScore = OpenFoodFactsProduct.NutriScore.a)).changes(stored))
    }

    @Test
    fun categoriesAloneSeedLabelsOnAFoodWithoutAnyLikeTheServer() {
        val merged = mergeOpenFoodFactsOntoFood(foodFixture(), emptyProduct(categoriesTags = listOf("en:cereals", "en:breakfasts")))

        assertTrue(merged.changes(foodFixture()))
        assertEquals(listOf("cereal", "breakfast"), merged.catalogLabels(foodFixture()))
    }

    @Test
    fun categoriesNeverTouchAFoodThatAlreadyHasLabels() {
        val labelled = foodFixture(labels = listOf("porridge"))
        val merged = mergeOpenFoodFactsOntoFood(labelled, emptyProduct(categoriesTags = listOf("en:cereals")))

        assertEquals(emptyList(), merged.catalogLabels(labelled))
        assertFalse(merged.changes(labelled))
    }

    @Test
    fun ignoresAnImageOutsideTheOpenFoodFactsHosts() {
        val rejected =
            listOf(
                "ftp://images.openfoodfacts.org/front.jpg",
                "http://images.openfoodfacts.org/front.jpg",
                "https://cdn.example.org/front.jpg",
                "https://images.openfoodfacts.org.example.org/front.jpg",
                "/uploads/someone-else/photo.webp",
                "not a url",
                "https://images.openfoodfacts.org/" + "a".repeat(2048),
            )
        for (imageUrl in rejected) {
            assertNull(mergeOpenFoodFactsOntoFood(foodFixture(), productFixture(imageUrl = imageUrl)).imageUrl, imageUrl)
        }
    }

    @Test
    fun acceptsBothOpenFoodFactsImageHosts() {
        val accepted =
            listOf(
                "https://images.openfoodfacts.org/images/products/1.jpg",
                "https://images.openfoodfacts.net/images/products/1.jpg",
            )
        for (imageUrl in accepted) {
            assertEquals(imageUrl, mergeOpenFoodFactsOntoFood(foodFixture(), productFixture(imageUrl = imageUrl)).imageUrl)
        }
    }

    @Test
    fun categoryLabelsKeepTheObjectLikeSlugsSingularized() {
        assertEquals(
            listOf("breakfast", "spread", "sweet spread", "hazelnut spread", "chocolate spread"),
            labelsFromCategoriesTags(NUTELLA),
        )
        assertEquals(listOf("dairy", "cheese", "italian cheese", "mozzarella"), labelsFromCategoriesTags(MOZZARELLA))
    }

    @Test
    fun categoryLabelsDropForeignPrefixesFreeTextPathsAndTheStoplist() {
        assertTrue(labelsFromCategoriesTags(NUTELLA).none { it.contains("tartiner") })
        assertEquals(emptyList(), labelsFromCategoriesTags(listOf("fr:colas", "de:limonaden", "en:Cola Getränke")))
        assertEquals(listOf("bread", "sliced bread", "wholemeal bread"), labelsFromCategoriesTags(SLICED_BREAD))
        assertEquals(emptyList(), labelsFromCategoriesTags(listOf("en:plant-based-foods", "en:snacks", "en:desserts")))
    }

    @Test
    fun categoryLabelsAreCappedDedupedAndEmptyWithoutTags() {
        assertEquals(
            listOf("beverage", "carbonated drink", "soft drink", "soda", "cola", "sweetened beverage"),
            labelsFromCategoriesTags(COCA_COLA),
        )
        assertEquals(listOf("cola"), labelsFromCategoriesTags(listOf("en:colas", "en:cola", "en:Colas")))
        assertEquals(emptyList(), labelsFromCategoriesTags(emptyList()))
    }

    private fun foodFixture(
        servingSize: Double = 100.0,
        servingUnit: Food.ServingUnit = Food.ServingUnit.g,
        nutriScore: String? = null,
        novaGroup: Int? = null,
        additives: List<String>? = null,
        ingredientsText: String? = null,
        imageUrl: String? = null,
        sugar: Double? = null,
        sodium: Double? = null,
        potassium: Double? = null,
        labels: List<String>? = null,
    ): Food =
        Food(
            id = "food-1",
            userId = "user-1",
            name = "My Oats",
            brand = "Mine",
            servingSize = servingSize,
            servingUnit = servingUnit,
            calories = 380.0,
            protein = 13.0,
            carbs = 60.0,
            fat = 7.0,
            fiber = 10.0,
            barcode = "4000000000000",
            isFavorite = true,
            nutriScore = nutriScore,
            novaGroup = novaGroup,
            additives = additives,
            ingredientsText = ingredientsText,
            imageUrl = imageUrl,
            sugar = sugar,
            sodium = sodium,
            potassium = potassium,
            labels = labels,
        )

    private fun productFixture(
        nutriScore: OpenFoodFactsProduct.NutriScore? = OpenFoodFactsProduct.NutriScore.c,
        novaGroup: Double? = 3.0,
        additives: List<String>? = listOf("en:e330"),
        ingredientsText: String? = "Oats, sugar",
        imageUrl: String? = "https://images.openfoodfacts.org/front.jpg",
        sugar: Double? = 20.0,
        sodium: Double? = 400.0,
        iron: Double? = null,
        categoriesTags: List<String> = listOf("en:cereals"),
    ): OpenFoodFactsProduct =
        OpenFoodFactsProduct(
            id = "4000000000000",
            name = "Product Name",
            brand = "Product Brand",
            barcode = "4000000000000",
            imageUrl = imageUrl,
            nutriScore = nutriScore,
            novaGroup = novaGroup,
            servingSize = 100.0,
            servingUnit = "g",
            calories = 500.0,
            protein = 10.0,
            carbs = 60.0,
            fat = 20.0,
            fiber = 5.0,
            additives = additives,
            ingredientsText = ingredientsText,
            categoriesTags = categoriesTags,
            sugar = sugar,
            sodium = sodium,
            iron = iron,
        )

    private fun emptyProduct(
        nutriScore: OpenFoodFactsProduct.NutriScore? = null,
        sugar: Double? = null,
        categoriesTags: List<String> = emptyList(),
    ) = productFixture(
        nutriScore = nutriScore,
        novaGroup = null,
        additives = null,
        ingredientsText = null,
        imageUrl = null,
        sugar = sugar,
        sodium = null,
        categoriesTags = categoriesTags,
    )

    private companion object {
        val NUTELLA =
            listOf(
                "en:breakfasts",
                "en:spreads",
                "en:sweet-spreads",
                "fr:pates-a-tartiner",
                "en:hazelnut-spreads",
                "en:chocolate-spreads",
                "en:cocoa-and-hazelnuts-spreads",
                "en:Pâtes à tartiner",
            )
        val COCA_COLA =
            listOf(
                "en:beverages-and-beverages-preparations",
                "en:beverages",
                "en:non-alcoholic-beverages",
                "en:carbonated-drinks",
                "en:soft-drinks",
                "en:sodas",
                "en:colas",
                "en:sweetened-beverages",
                "pt:bebidas cafeína",
            )
        val MOZZARELLA =
            listOf(
                "en:dairies",
                "en:fermented-foods",
                "en:fermented-milk-products",
                "en:cheeses",
                "en:italian-cheeses",
                "en:stretched-curd-cheeses",
                "en:mozzarella",
            )
        val SLICED_BREAD =
            listOf(
                "en:plant-based-foods-and-beverages",
                "en:plant-based-foods",
                "en:cereals-and-potatoes",
                "en:cereals-and-their-products",
                "en:breads",
                "en:sliced-breads",
                "en:sliced-breads-without-crust",
                "en:wholemeal-breads",
                "en:wholemeal-sliced-breads",
            )
    }
}
