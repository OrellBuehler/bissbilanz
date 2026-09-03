package com.bissbilanz.api

import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.createHttpEngine
import io.ktor.client.*
import io.ktor.client.engine.*
import io.ktor.client.plugins.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlin.math.round

/**
 * Direct Open Food Facts v2 client used in Local mode, where the app has no backend
 * to proxy through. Replicates the field selection and mapping of the SvelteKit
 * server proxy (`src/lib/server/openfoodfacts.ts`) so the result matches the
 * generated [OpenFoodFactsProduct] model returned by `/api/openfoodfacts/{barcode}`.
 */
class OpenFoodFactsClient(
    engine: HttpClientEngine = createHttpEngine(),
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    private val client =
        HttpClient(engine) {
            install(HttpTimeout) {
                requestTimeoutMillis = 30_000
                connectTimeoutMillis = 10_000
            }
        }

    suspend fun fetchProduct(barcode: String): OpenFoodFactsProduct? {
        val response =
            client.get("$API_BASE/$barcode.json") {
                parameter("fields", FIELDS)
                header(HttpHeaders.UserAgent, USER_AGENT)
                accept(ContentType.Application.Json)
            }
        if (!response.status.isSuccess()) return null

        val root =
            try {
                json.parseToJsonElement(response.bodyAsText()).jsonObject
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                return null
            }
        if ((root["status"] as? JsonPrimitive)?.intOrNull != 1) return null
        val product = root["product"] as? JsonObject ?: return null
        return mapProduct(product, barcode)
    }

    /**
     * Free-text product search, mirroring the server proxy's `searchProducts`
     * (`/cgi/search.pl`). Only products with a name and a barcode are returned so
     * every hit can be instantiated by barcode later.
     */
    suspend fun searchProducts(
        query: String,
        limit: Int = 10,
    ): List<OpenFoodFactsProduct> {
        val response =
            client.get(SEARCH_BASE) {
                parameter("search_terms", query)
                parameter("search_simple", "1")
                parameter("action", "process")
                parameter("json", "1")
                parameter("page_size", limit.coerceIn(1, 20))
                parameter("fields", "code,$FIELDS")
                header(HttpHeaders.UserAgent, USER_AGENT)
                accept(ContentType.Application.Json)
            }
        if (!response.status.isSuccess()) return emptyList()

        val root =
            try {
                json.parseToJsonElement(response.bodyAsText()).jsonObject
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                return emptyList()
            }
        val products = root["products"] as? JsonArray ?: return emptyList()
        return products.mapNotNull { element ->
            val product = element as? JsonObject ?: return@mapNotNull null
            val code = product.stringOrNull("code")?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            mapProduct(product, code).takeIf { it.name.isNotBlank() }
        }
    }

    private fun mapProduct(
        product: JsonObject,
        barcode: String,
    ): OpenFoodFactsProduct {
        val nutriments = product["nutriments"] as? JsonObject ?: JsonObject(emptyMap())

        return OpenFoodFactsProduct(
            // The server proxy has no separate id; the barcode identifies the product.
            id = barcode,
            name = product.stringOrNull("product_name") ?: "",
            brand = product.stringOrNull("brands") ?: "",
            barcode = barcode,
            imageUrl = product.stringOrNull("image_front_url"),
            nutriScore =
                product.stringOrNull("nutriscore_grade")?.let { grade ->
                    OpenFoodFactsProduct.NutriScore.entries.firstOrNull { it.value == grade }
                },
            novaGroup = nutrimentNumber(product, "nova_group")?.takeIf { it in 1.0..4.0 },
            servingSize = 100.0,
            servingUnit = "g",
            calories = nutrimentNumber(nutriments, "energy-kcal_100g") ?: 0.0,
            protein = nutrimentNumber(nutriments, "proteins_100g") ?: 0.0,
            carbs = nutrimentNumber(nutriments, "carbohydrates_100g") ?: 0.0,
            fat = nutrimentNumber(nutriments, "fat_100g") ?: 0.0,
            fiber = nutrimentNumber(nutriments, "fiber_100g") ?: 0.0,
            additives =
                (product["additives_tags"] as? JsonArray)
                    ?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }
                    ?: emptyList(),
            ingredientsText = product.stringOrNull("ingredients_text"),
            saturatedFat = extractNutrient(nutriments, "saturated-fat_100g"),
            monounsaturatedFat = extractNutrient(nutriments, "monounsaturated-fat_100g"),
            polyunsaturatedFat = extractNutrient(nutriments, "polyunsaturated-fat_100g"),
            transFat = extractNutrient(nutriments, "trans-fat_100g"),
            cholesterol = extractNutrient(nutriments, "cholesterol_100g", G_TO_MG),
            omega3 = extractNutrient(nutriments, "omega-3-fat_100g"),
            omega6 = extractNutrient(nutriments, "omega-6-fat_100g"),
            sugar = extractNutrient(nutriments, "sugars_100g"),
            addedSugars = extractNutrient(nutriments, "added-sugars_100g"),
            sugarAlcohols = extractNutrient(nutriments, "sugar-alcohols_100g"),
            starch = extractNutrient(nutriments, "starch_100g"),
            sodium = extractNutrient(nutriments, "sodium_100g", G_TO_MG),
            potassium = extractNutrient(nutriments, "potassium_100g", G_TO_MG),
            calcium = extractNutrient(nutriments, "calcium_100g", G_TO_MG),
            iron = extractNutrient(nutriments, "iron_100g", G_TO_MG),
            magnesium = extractNutrient(nutriments, "magnesium_100g", G_TO_MG),
            phosphorus = extractNutrient(nutriments, "phosphorus_100g", G_TO_MG),
            zinc = extractNutrient(nutriments, "zinc_100g", G_TO_MG),
            copper = extractNutrient(nutriments, "copper_100g", G_TO_MG),
            manganese = extractNutrient(nutriments, "manganese_100g", G_TO_MG),
            selenium = extractNutrient(nutriments, "selenium_100g", G_TO_UG),
            iodine = extractNutrient(nutriments, "iodine_100g", G_TO_UG),
            fluoride = extractNutrient(nutriments, "fluoride_100g", G_TO_MG),
            chromium = extractNutrient(nutriments, "chromium_100g", G_TO_UG),
            molybdenum = extractNutrient(nutriments, "molybdenum_100g", G_TO_UG),
            chloride = extractNutrient(nutriments, "chloride_100g", G_TO_MG),
            vitaminA = extractNutrient(nutriments, "vitamin-a_100g", G_TO_UG),
            vitaminC = extractNutrient(nutriments, "vitamin-c_100g", G_TO_MG),
            vitaminD = extractNutrient(nutriments, "vitamin-d_100g", G_TO_UG),
            vitaminE = extractNutrient(nutriments, "vitamin-e_100g", G_TO_MG),
            vitaminK = extractNutrient(nutriments, "vitamin-k_100g", G_TO_UG),
            vitaminB1 = extractNutrient(nutriments, "vitamin-b1_100g", G_TO_MG),
            vitaminB2 = extractNutrient(nutriments, "vitamin-b2_100g", G_TO_MG),
            vitaminB3 = extractNutrient(nutriments, "vitamin-b3_100g", G_TO_MG),
            vitaminB5 = extractNutrient(nutriments, "vitamin-b5_100g", G_TO_MG),
            vitaminB6 = extractNutrient(nutriments, "vitamin-b6_100g", G_TO_MG),
            vitaminB7 = extractNutrient(nutriments, "vitamin-b7_100g", G_TO_UG),
            vitaminB9 = extractNutrient(nutriments, "vitamin-b9_100g", G_TO_UG),
            vitaminB12 = extractNutrient(nutriments, "vitamin-b12_100g", G_TO_UG),
            caffeine = extractNutrient(nutriments, "caffeine_100g", G_TO_MG),
            alcohol = extractNutrient(nutriments, "alcohol_100g"),
            water = extractNutrient(nutriments, "water_100g"),
            salt = extractNutrient(nutriments, "salt_100g"),
        )
    }

    private fun JsonObject.stringOrNull(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

    /** OFF nutriment values may be numbers or numeric strings. */
    private fun nutrimentNumber(
        obj: JsonObject,
        key: String,
    ): Double? = (obj[key] as? JsonPrimitive)?.doubleOrNull?.takeIf { !it.isNaN() }

    /**
     * Mirrors the server proxy's `extractNutrient`: optional unit conversion and
     * rounding to 2 decimal places, null when missing or not numeric.
     */
    private fun extractNutrient(
        nutriments: JsonObject,
        offKey: String,
        conversion: Double = 1.0,
    ): Double? = nutrimentNumber(nutriments, offKey)?.let { round(it * conversion * 100) / 100 }

    fun close() {
        client.close()
    }

    companion object {
        private const val API_BASE = "https://world.openfoodfacts.org/api/v2/product"
        private const val SEARCH_BASE = "https://world.openfoodfacts.org/cgi/search.pl"
        private const val USER_AGENT = "Bissbilanz/1.0 (https://bissbilanz.orellbuehler.ch)"
        private const val FIELDS =
            "product_name,brands,nutriscore_grade,nova_group,additives_tags," +
                "ingredients_text,image_front_url,nutriments"
        private const val G_TO_MG = 1_000.0
        private const val G_TO_UG = 1_000_000.0
    }
}
