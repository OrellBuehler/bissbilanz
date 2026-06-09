package com.bissbilanz.api

import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import io.ktor.client.engine.mock.*
import io.ktor.http.*
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OpenFoodFactsClientTest {
    // Realistic OFF v2 response shape: mixed number/string nutriments, per-100g keys.
    private val fixture =
        """
        {
          "code": "7622210449283",
          "status": 1,
          "status_verbose": "product found",
          "product": {
            "product_name": "Prince Chocolat",
            "brands": "LU,Mondelez",
            "nutriscore_grade": "d",
            "nova_group": 4,
            "additives_tags": ["en:e322", "en:e500"],
            "ingredients_text": "Getreide 50,7 % (Weizenmehl, Vollkornweizenmehl 14,5 %), Zucker",
            "image_front_url": "https://images.openfoodfacts.org/images/products/762/221/044/9283/front_de.jpg",
            "nutriments": {
              "energy-kcal_100g": 467,
              "proteins_100g": 6.3,
              "carbohydrates_100g": 69,
              "fat_100g": 17,
              "fiber_100g": 4,
              "saturated-fat_100g": 5.6,
              "sugars_100g": "32.5",
              "salt_100g": 0.58,
              "sodium_100g": 0.232,
              "calcium_100g": 0.12,
              "iron_100g": "0.0042",
              "vitamin-b1_100g": 0.00026,
              "vitamin-b12_100g": 0.0000009,
              "caffeine_100g": 0.011,
              "alcohol_100g": 0
            }
          }
        }
        """.trimIndent()

    private fun clientRespondingWith(
        body: String,
        status: HttpStatusCode = HttpStatusCode.OK,
        onRequest: (io.ktor.client.request.HttpRequestData) -> Unit = {},
    ): OpenFoodFactsClient {
        val engine =
            MockEngine { request ->
                onRequest(request)
                respond(
                    content = body,
                    status = status,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()),
                )
            }
        return OpenFoodFactsClient(engine)
    }

    @Test
    fun fetchProductMapsOffFieldsLikeTheServerProxy() =
        runTest {
            val client = clientRespondingWith(fixture)

            val product = client.fetchProduct("7622210449283")

            checkNotNull(product)
            assertEquals("7622210449283", product.id)
            assertEquals("7622210449283", product.barcode)
            assertEquals("Prince Chocolat", product.name)
            assertEquals("LU,Mondelez", product.brand)
            assertEquals(OpenFoodFactsProduct.NutriScore.d, product.nutriScore)
            assertEquals(4.0, product.novaGroup)
            assertEquals(listOf("en:e322", "en:e500"), product.additives)
            assertEquals(
                "https://images.openfoodfacts.org/images/products/762/221/044/9283/front_de.jpg",
                product.imageUrl,
            )
            assertTrue(product.ingredientsText!!.startsWith("Getreide"))

            // Core macros: per 100 g, no conversion.
            assertEquals(100.0, product.servingSize)
            assertEquals("g", product.servingUnit)
            assertEquals(467.0, product.calories)
            assertEquals(6.3, product.protein)
            assertEquals(69.0, product.carbs)
            assertEquals(17.0, product.fat)
            assertEquals(4.0, product.fiber)

            // Extended nutrients: unit conversion + 2-decimal rounding, strings parsed.
            assertEquals(5.6, product.saturatedFat)
            assertEquals(32.5, product.sugar)
            assertEquals(0.58, product.salt)
            assertEquals(232.0, product.sodium) // g -> mg
            assertEquals(120.0, product.calcium) // g -> mg
            assertEquals(4.2, product.iron) // string g -> mg
            assertEquals(0.26, product.vitaminB1) // g -> mg, rounded
            assertEquals(0.9, product.vitaminB12) // g -> µg
            assertEquals(11.0, product.caffeine) // g -> mg
            assertEquals(0.0, product.alcohol)
            // Missing nutriments stay null.
            assertNull(product.transFat)
            assertNull(product.vitaminC)
        }

    @Test
    fun fetchProductSendsUserAgentAndFieldsToOffApi() =
        runTest {
            var requestedUrl = ""
            var userAgent: String? = null
            val client =
                clientRespondingWith(fixture) { request ->
                    requestedUrl = request.url.toString()
                    userAgent = request.headers[HttpHeaders.UserAgent]
                }

            client.fetchProduct("7622210449283")

            assertTrue(requestedUrl.startsWith("https://world.openfoodfacts.org/api/v2/product/7622210449283.json"))
            assertTrue(requestedUrl.contains("fields="))
            assertEquals("Bissbilanz/1.0 (https://bissbilanz.orellbuehler.ch)", userAgent)
        }

    @Test
    fun fetchProductReturnsNullWhenProductNotFound() =
        runTest {
            val client = clientRespondingWith("""{"code":"0000","status":0,"status_verbose":"product not found"}""")

            assertNull(client.fetchProduct("0000"))
        }

    @Test
    fun fetchProductReturnsNullOnHttpError() =
        runTest {
            val client = clientRespondingWith("not found", status = HttpStatusCode.NotFound)

            assertNull(client.fetchProduct("0000"))
        }

    @Test
    fun fetchProductDefaultsMissingNameAndMacrosLikeTheProxy() =
        runTest {
            val sparse = """{"status":1,"product":{"nutriments":{}}}"""
            val client = clientRespondingWith(sparse)

            val product = client.fetchProduct("123")

            checkNotNull(product)
            assertEquals("", product.name)
            assertEquals("", product.brand)
            assertEquals(0.0, product.calories)
            assertEquals(emptyList(), product.additives)
            assertNull(product.nutriScore)
            assertNull(product.ingredientsText)
        }
}
