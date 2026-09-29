package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodPackageAction
import com.bissbilanz.api.generated.model.FoodPackageConflictReason
import com.bissbilanz.api.generated.model.FoodPackageFoodRole
import com.bissbilanz.api.generated.model.FoodPackageIncludeRecipes
import com.bissbilanz.api.generated.model.FoodPackageMapping
import com.bissbilanz.api.generated.model.FoodPackageResolution
import com.bissbilanz.api.generated.model.FoodPackageResolutions
import com.bissbilanz.api.generated.model.FoodPackageSelection
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeIngredient
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.util.computeRecipePerServingMacros
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** In-memory stand-in for the on-device photo store. */
private class FakeImageStore : PackageImageStore {
    val files = mutableMapOf<String, ByteArray>()
    val discarded = mutableListOf<String>()
    private var counter = 0

    override suspend fun read(imageUrl: String) = files[imageUrl]

    override suspend fun size(imageUrl: String) = files[imageUrl]?.size?.toLong()

    override suspend fun thumbnail(bytes: ByteArray) = "data:image/test;size=${bytes.size}"

    override suspend fun saveImported(bytes: ByteArray): String? {
        if (bytes.isEmpty()) return null
        val url = "file:///images/imported-${++counter}"
        files[url] = bytes
        return url
    }

    override suspend fun discard(imageUrl: String) {
        discarded.add(imageUrl)
        files.remove(imageUrl)
    }
}

class LocalFoodPackageServiceTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val db = inMemoryUserDataDatabase()
    private val images = FakeImageStore()
    private val archive = AndroidFoodPackageArchive()
    private val service = LocalFoodPackageService(db, json, archive, images, now = { "2026-09-28T10:00:00Z" }, today = { "2026-09-28" })
    private val files = mutableListOf<File>()

    @AfterTest
    fun cleanUp() = files.forEach { it.delete() }

    private val webp = "RIFF....WEBPVP8 ".encodeToByteArray()

    private fun food(
        id: String,
        name: String,
        brand: String? = null,
        unit: Food.ServingUnit = Food.ServingUnit.g,
        size: Double = 100.0,
        calories: Double = 200.0,
        barcode: String? = null,
        labels: List<String>? = null,
        imageUrl: String? = null,
    ) = TestFixtures.food(id = id, name = name).copy(
        brand = brand,
        servingUnit = unit,
        servingSize = size,
        calories = calories,
        barcode = barcode,
        labels = labels,
        imageUrl = imageUrl,
        updatedAt = "2026-01-01T00:00:00Z",
    )

    private fun put(food: Food): Food {
        db.userDataDatabaseQueries.deleteFoodLabels(food.id)
        food.labels?.forEach { db.userDataDatabaseQueries.insertFoodLabel(food.id, it) }
        db.userDataDatabaseQueries.insertFood(
            id = food.id,
            name = food.name,
            brand = food.brand,
            calories = food.calories,
            protein = food.protein,
            carbs = food.carbs,
            fat = food.fat,
            fiber = food.fiber,
            isFavorite = if (food.isFavorite) 1L else 0L,
            barcode = food.barcode,
            jsonData = json.encodeToString(food),
        )
        return food
    }

    private fun putRecipe(
        id: String,
        name: String,
        vararg ingredients: Triple<String, Double, RecipeIngredient.ServingUnit>,
        servings: Double = 2.0,
        imageUrl: String? = null,
    ): RecipeDetail {
        val rows = ingredients.mapIndexed { index, (foodId, quantity, unit) -> RecipeIngredient(foodId, quantity, unit, index) }
        val macros =
            computeRecipePerServingMacros(rows, servings) { foodId ->
                db.userDataDatabaseQueries
                    .selectFoodById(foodId)
                    .executeAsOneOrNull()
                    ?.let { json.decodeFromString<Food>(it.jsonData) }
            }
        val recipe =
            RecipeDetail(
                id = id,
                userId = "",
                name = name,
                totalServings = servings,
                isFavorite = false,
                imageUrl = imageUrl,
                calories = macros?.calories ?: 0.0,
                protein = macros?.protein ?: 0.0,
                carbs = macros?.carbs ?: 0.0,
                fat = macros?.fat ?: 0.0,
                fiber = macros?.fiber ?: 0.0,
                ingredients = rows,
                cookedWeight = 450.0,
                updatedAt = "2026-01-01T00:00:00Z",
            )
        db.userDataDatabaseQueries.insertRecipe(
            id = id,
            name = name,
            totalServings = servings,
            isFavorite = 0L,
            calories = recipe.calories,
            protein = recipe.protein,
            carbs = recipe.carbs,
            fat = recipe.fat,
            fiber = recipe.fiber,
            jsonData = json.encodeToString(recipe),
        )
        return recipe
    }

    private fun foods() =
        db.userDataDatabaseQueries
            .selectAllFoods()
            .executeAsList()
            .map { json.decodeFromString<Food>(it.jsonData) }

    private fun recipes() =
        db.userDataDatabaseQueries
            .selectAllRecipes()
            .executeAsList()
            .map { json.decodeFromString<RecipeDetail>(it.jsonData) }

    private fun fileOf(bytes: ByteArray): String =
        File
            .createTempFile("package", ".bissbilanz")
            .also {
                it.writeBytes(bytes)
                files.add(it)
            }.path

    private fun serverFixture() = File("../../tests/fixtures/food-package/server-export.bissbilanz").path

    private fun ing(
        foodId: String,
        quantity: Double,
        unit: RecipeIngredient.ServingUnit = RecipeIngredient.ServingUnit.g,
    ) = Triple(foodId, quantity, unit)

    private fun resolutions(
        hash: String,
        foods: List<FoodPackageResolution> = emptyList(),
        recipes: List<FoodPackageResolution> = emptyList(),
        mappings: List<FoodPackageMapping> = emptyList(),
    ) = FoodPackageResolutions(hash, foods, recipes, mappings)

    private fun manifestOf(bytes: ByteArray) = archive.read(fileOf(bytes)).manifest

    // ── Export ────────────────────────────────────────────────────────────

    @Test
    fun exportsASingleRecipeWithItsIngredientFoodsAndPhotos() =
        runTest {
            val oats =
                put(
                    food(
                        "temp_1",
                        "Haferflocken",
                        brand = "Migros",
                        barcode = "7610",
                        labels = listOf("oat"),
                        imageUrl = "file:///images/oats.webp",
                    ),
                )
            val milk = put(food("temp_2", "Vollmilch", unit = Food.ServingUnit.ml, size = 250.0))
            images.files["file:///images/oats.webp"] = webp
            images.files["file:///images/porridge.jpg"] = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 1)
            putRecipe(
                "temp_r1",
                "Käse-Porridge",
                ing(oats.id, 80.0),
                ing(milk.id, 300.0, RecipeIngredient.ServingUnit.ml),
                imageUrl = "file:///images/porridge.jpg",
            )
            put(food("temp_3", "Unrelated"))

            val exported = service.export(FoodPackageSelection(recipeIds = listOf("temp_r1")), exportedAt = "2026-09-28T10:00:00Z")

            assertEquals("Käse-Porridge.bissbilanz", exported.fileName)
            assertEquals(2, exported.foods)
            assertEquals(1, exported.recipes)
            val manifest = manifestOf(exported.bytes)
            assertEquals(listOf("Haferflocken", "Vollmilch"), manifest.foods.map { it.name })
            assertEquals(listOf("f1", "f2"), manifest.foods.map { it.ref })
            assertTrue(manifest.foods.all { it.role == FoodPackageFoodRole.ingredient })
            assertEquals("Migros", manifest.foods[0].brand)
            assertEquals("7610", manifest.foods[0].barcode)
            assertEquals("images/f1.webp", manifest.foods[0].image)
            assertNull(manifest.foods[1].image)
            val recipe = manifest.recipes.single()
            assertEquals("images/r1.jpg", recipe.image)
            assertEquals(listOf("f1", "f2"), recipe.ingredients.map { it.food })
            assertEquals(listOf(80.0, 300.0), recipe.ingredients.map { it.quantity })
            assertEquals(450.0, recipe.cookedWeight)
            val opened = archive.read(fileOf(exported.bytes))
            assertEquals(setOf("images/f1.webp", "images/r1.jpg"), opened.readImages(listOf("images/f1.webp", "images/r1.jpg")).keys)
        }

    @Test
    fun namesASingleFoodAfterItAndUsesTheGenericNameOtherwise() =
        runTest {
            put(food("temp_1", "Vollmilch"))
            put(food("temp_2", "Honig"))
            assertEquals("Honig.bissbilanz", service.export(FoodPackageSelection(foodIds = listOf("temp_2"))).fileName)
            assertEquals("bissbilanz-foods-2026-09-28.bissbilanz", service.export(FoodPackageSelection(all = true)).fileName)
        }

    @Test
    fun exportsEveryFoodAndRecipeForAll() =
        runTest {
            val a = put(food("temp_1", "Zucker"))
            put(food("temp_2", "Apfel"))
            putRecipe("temp_r1", "Kuchen", ing(a.id, 50.0))
            val manifest =
                manifestOf(service.export(FoodPackageSelection(all = true, includeRecipes = FoodPackageIncludeRecipes.all)).bytes)
            assertEquals(listOf("Apfel", "Zucker"), manifest.foods.map { it.name })
            assertEquals(listOf("Kuchen"), manifest.recipes.map { it.name })
            assertTrue(manifest.foods.all { it.role == FoodPackageFoodRole.selected })
        }

    @Test
    fun filtersByBrandAndLabelAndPullsRelatedRecipes() =
        runTest {
            val migros = put(food("temp_1", "Reis", brand = "Migros"))
            put(food("temp_2", "Nudeln", brand = "Coop"))
            put(food("temp_3", "Tee", labels = listOf("tea")))
            put(food("temp_4", "Salz"))
            putRecipe("temp_r1", "Reispfanne", ing(migros.id, 100.0))
            putRecipe("temp_r2", "Salat", ing("temp_4", 5.0))

            val selection =
                FoodPackageSelection(
                    brands = listOf(" migros "),
                    labels = listOf("Teas"),
                    includeRecipes = FoodPackageIncludeRecipes.related,
                )
            val manifest = manifestOf(service.export(selection).bytes)
            assertEquals(listOf("Reis", "Tee"), manifest.foods.map { it.name })
            assertEquals(listOf("Reispfanne"), manifest.recipes.map { it.name })
        }

    @Test
    fun summarizesWithoutBuilding() =
        runTest {
            val a = put(food("temp_1", "Zucker", imageUrl = "file:///images/z.webp"))
            images.files["file:///images/z.webp"] = webp
            putRecipe("temp_r1", "Kuchen", ing(a.id, 50.0), ing("temp_2", 5.0))
            put(food("temp_2", "Mehl"))
            val summary = service.summarize(FoodPackageSelection(recipeIds = listOf("temp_r1")))
            assertEquals(0, summary.foods)
            assertEquals(1, summary.recipes)
            assertEquals(2, summary.ingredientFoods)
            assertEquals(1, summary.images)
            assertEquals(webp.size + 3 * 1500, summary.estimatedBytes)
            assertEquals(false, summary.overLimit)
        }

    @Test
    fun refusesToExportNothing() =
        runTest {
            val error = assertFailsWith<FoodPackageException> { service.export(FoodPackageSelection(foodIds = listOf("temp_none"))) }
            assertEquals(FoodPackageException.Kind.NOTHING_TO_EXPORT, error.kind)
        }

    // ── Round trip ────────────────────────────────────────────────────────

    @Test
    fun aPackageMadeHereImportsIntoAnEmptyDatabaseUnchanged() =
        runTest {
            val oats =
                put(
                    food(
                        "temp_1",
                        "Haferflocken",
                        brand = "Migros",
                        barcode = "7610",
                        labels = listOf("oat", "cereal"),
                        imageUrl = "file:///images/oats.webp",
                    ),
                ).let {
                    it.copy(
                        sodium = 2.0,
                        vitaminB12 = 0.0,
                        iron = 1.8,
                        nutriScore = "a",
                        novaGroup = 1,
                        additives = listOf("e330"),
                        ingredientsText = "Hafer",
                    )
                }.also { put(it) }
            val milk = put(food("temp_2", "Vollmilch", unit = Food.ServingUnit.ml, size = 250.0, calories = 165.0))
            images.files["file:///images/oats.webp"] = webp
            val recipe = putRecipe("temp_r1", "Porridge", ing(oats.id, 80.0), ing(milk.id, 300.0, RecipeIngredient.ServingUnit.ml))
            val exported = service.export(FoodPackageSelection(all = true, includeRecipes = FoodPackageIncludeRecipes.all))

            // A second device: fresh database, same package.
            val otherDb = inMemoryUserDataDatabase()
            val otherImages = FakeImageStore()
            val other = LocalFoodPackageService(otherDb, json, archive, otherImages, now = { "2026-10-01T08:00:00Z" })
            val path = fileOf(exported.bytes)
            val preview = other.preview(path)
            assertEquals(2, preview.newFoods.count)
            assertEquals(1, preview.newRecipes.count)
            assertTrue(preview.conflicts.foods.isEmpty())
            assertEquals(1, preview.totals.images)

            val result = other.commit(path, FoodPackageMappingState.toResolutions(preview, emptyMap(), emptyMap(), emptyMap()))
            assertEquals(2, result.created.foods)
            assertEquals(1, result.created.recipes)
            assertEquals(1, result.images)

            val imported =
                otherDb.userDataDatabaseQueries
                    .selectAllFoods()
                    .executeAsList()
                    .map { json.decodeFromString<Food>(it.jsonData) }
            val importedOats = imported.single { it.name == "Haferflocken" }
            assertTrue(importedOats.id.startsWith("temp_"), "local rows keep temp ids so a later sign-in uploads them")
            assertEquals("Migros", importedOats.brand)
            assertEquals("7610", importedOats.barcode)
            assertEquals(2.0, importedOats.sodium)
            assertEquals(0.0, importedOats.vitaminB12)
            assertEquals(1.8, importedOats.iron)
            assertNull(importedOats.calcium)
            assertEquals("a", importedOats.nutriScore)
            assertEquals(1, importedOats.novaGroup)
            assertEquals(listOf("e330"), importedOats.additives)
            assertEquals("Hafer", importedOats.ingredientsText)
            assertEquals(listOf("oat", "cereal"), importedOats.labels)
            assertEquals(false, importedOats.isFavorite)
            assertEquals(webp.toList(), otherImages.files.getValue(importedOats.imageUrl!!).toList())
            val labelCount =
                otherDb.userDataDatabaseQueries
                    .searchFoods(pattern = "%zzzz%", label = "oat", limit = 10)
                    .executeAsList()
                    .size
            assertEquals(1, labelCount)

            val importedRecipe =
                otherDb.userDataDatabaseQueries
                    .selectAllRecipes()
                    .executeAsList()
                    .map {
                        json.decodeFromString<RecipeDetail>(it.jsonData)
                    }.single()
            assertEquals("Porridge", importedRecipe.name)
            assertEquals(450.0, importedRecipe.cookedWeight)
            assertEquals(recipe.calories, importedRecipe.calories, 1e-9)
            assertEquals(recipe.protein, importedRecipe.protein, 1e-9)
            assertEquals(listOf(80.0, 300.0), importedRecipe.ingredients.map { it.quantity })
            assertEquals(imported.map { it.id }.toSet(), importedRecipe.ingredients.map { it.foodId }.toSet())
        }

    @Test
    fun importsThePackageTheServerExporterWrites() =
        runTest {
            val path = serverFixture()
            val preview = service.preview(path)
            assertEquals(4, preview.newFoods.count)
            assertEquals(1, preview.newFoods.ingredientOnly)
            assertEquals(2, preview.totals.images)
            val honey = preview.newFoods.items.single { it.name == "Honig" }
            assertEquals(FoodPackageFoodRole.ingredient, honey.role)
            assertEquals(listOf("Porridge"), honey.recipes.map { it.name })

            val result = service.commit(path, FoodPackageMappingState.toResolutions(preview, emptyMap(), emptyMap(), emptyMap()))
            assertEquals(4, result.created.foods)
            assertEquals(1, result.created.recipes)
            assertEquals(2, result.images)
            val cheese = foods().single { it.name == "Bündner Käse" }
            assertEquals(listOf("cheese"), cheese.labels)
            val oats = foods().single { it.name == "Bio Haferflocken" }
            assertEquals(0.5, oats.saturatedFat)
            assertNotNull(oats.imageUrl)
            assertEquals("https://images.openfoodfacts.org/images/products/honey.jpg", foods().single { it.name == "Honig" }.imageUrl)
            assertEquals(3, recipes().single().ingredients.size)
            assertTrue(recipes().single().calories > 0)
        }

    // ── Conflicts and mappings ────────────────────────────────────────────

    @Test
    fun previewsConflictsWithTheUsersOwnFoodsAndCounts() =
        runTest {
            val mine = put(food("temp_1", "bio haferflocken", brand = "MIGROS", barcode = null, calories = 999.0))
            put(food("temp_9", "Something", barcode = "7610200000001"))
            db.userDataDatabaseQueries.insertEntry(
                id = "temp_e1",
                date = "2026-09-01",
                mealType = "Breakfast",
                servings = 1.0,
                foodId = mine.id,
                recipeId = null,
                foodName = null,
                calories = 0.0,
                protein = 0.0,
                carbs = 0.0,
                fat = 0.0,
                fiber = 0.0,
                jsonData = "{}",
            )
            putRecipe("temp_r1", "porridge", ing(mine.id, 10.0))

            val preview = service.preview(serverFixture())
            val conflict = preview.conflicts.foods.single()
            // The barcode belongs to another food of the user: it wins over the name match.
            assertEquals(FoodPackageConflictReason.barcode, conflict.reason)
            assertEquals("temp_9", conflict.existing.id)
            assertEquals(listOf(mine.id), conflict.alsoMatches.map { it.id })
            assertEquals(3, preview.newFoods.items.size)
            val recipeConflict = preview.conflicts.recipes.single()
            assertEquals("temp_r1", recipeConflict.existing.id)
            assertEquals(listOf("bio haferflocken"), recipeConflict.existing.ingredients)
            assertEquals(0, recipeConflict.existing.entryCount)
        }

    @Test
    fun appliesReplaceSkipAndKeepBothAndMapsANewFoodOntoTheUsersOwn() =
        runTest {
            val mine =
                put(
                    food(
                        "temp_1",
                        "Bio Haferflocken",
                        brand = "Migros",
                        calories = 999.0,
                        labels = listOf("mine"),
                        imageUrl = "file:///images/old.webp",
                    ),
                )
            images.files["file:///images/old.webp"] = byteArrayOf(1)
            val honey = put(food("temp_2", "Blütenhonig", calories = 300.0, size = 100.0))
            val other = putRecipe("temp_r1", "Mein Müsli", ing(mine.id, 50.0))
            val path = serverFixture()
            val preview = service.preview(path)
            val conflict = preview.conflicts.foods.single()
            assertEquals(setOf(FoodPackageAction.skip, FoodPackageAction.replace, FoodPackageAction.keep_both), conflict.allowed.toSet())

            val result =
                service.commit(
                    path,
                    resolutions(
                        preview.packageHash,
                        foods = listOf(FoodPackageResolution(conflict.ref, FoodPackageAction.replace, conflict.existing.id)),
                        // Honig is not created: the user's own Blütenhonig stands in for it in the recipe.
                        mappings =
                            listOf(
                                FoodPackageMapping(
                                    preview.newFoods.items
                                        .single { it.name == "Honig" }
                                        .ref,
                                    honey.id,
                                ),
                            ),
                    ),
                )
            assertEquals(1, result.replaced.foods)
            assertEquals(2, result.created.foods)
            assertEquals(1, result.skipped.foods)
            assertEquals(1, result.created.recipes)
            assertTrue(foods().none { it.name == "Honig" })

            val replaced = foods().single { it.id == mine.id }
            assertEquals(152.0, replaced.calories)
            assertEquals("Migros", replaced.brand)
            assertEquals("7610200000001", replaced.barcode)
            assertEquals(listOf("mine", "oat", "cereal"), replaced.labels)
            assertNotNull(replaced.imageUrl)
            assertTrue(replaced.imageUrl != "file:///images/old.webp")
            // The old photo has no owner any more.
            assertEquals(listOf("file:///images/old.webp"), images.discarded)

            val porridge = recipes().single { it.name == "Porridge" }
            assertTrue(honey.id in porridge.ingredients.map { it.foodId })
            assertTrue(mine.id in porridge.ingredients.map { it.foodId })
            // The user's other recipe uses the replaced food, so its totals follow it.
            val muesli = recipes().single { it.id == other.id }
            assertEquals(152.0 * 50.0 / 40.0 / 2.0, muesli.calories, 1e-9)
        }

    @Test
    fun keepBothImportsACopyWithoutTheBarcode() =
        runTest {
            put(food("temp_1", "Bio Haferflocken", brand = "Migros"))
            val path = serverFixture()
            val preview = service.preview(path)
            val conflict = preview.conflicts.foods.single()
            val result =
                service.commit(
                    path,
                    resolutions(
                        preview.packageHash,
                        foods = listOf(FoodPackageResolution(conflict.ref, FoodPackageAction.keep_both, conflict.existing.id)),
                    ),
                )
            assertEquals(1, result.keptBoth.foods)
            assertEquals(3, result.created.foods)
            assertEquals(2, foods().count { it.name == "Bio Haferflocken" })
            // Same name and brand: the copy keeps the barcode, like the server.
            assertEquals("7610200000001", foods().single { it.id != "temp_1" && it.name == "Bio Haferflocken" }.barcode)
        }

    @Test
    fun aChangeSinceThePreviewIsReportedAndWritesNothing() =
        runTest {
            val mine = put(food("temp_1", "Bio Haferflocken", brand = "Migros"))
            val path = serverFixture()
            val preview = service.preview(path)
            val conflict = preview.conflicts.foods.single()
            // Deleted elsewhere before the user confirmed.
            db.userDataDatabaseQueries.deleteFood(mine.id)

            val error =
                assertFailsWith<FoodPackageException> {
                    service.commit(
                        path,
                        resolutions(
                            preview.packageHash,
                            foods = listOf(FoodPackageResolution(conflict.ref, FoodPackageAction.replace, conflict.existing.id)),
                        ),
                    )
                }
            assertEquals(FoodPackageException.Kind.STALE_PREVIEW, error.kind)
            assertTrue(foods().isEmpty())
            assertTrue(recipes().isEmpty())
            assertTrue(images.files.isEmpty())
        }

    @Test
    fun aDifferentFileThanThePreviewIsRefused() =
        runTest {
            val preview = service.preview(serverFixture())
            val other = archive.write(FoodPackageManifestCodec.encode(PackageManifest(1, null, emptyList(), emptyList())), emptyMap())
            val error = assertFailsWith<FoodPackageException> { service.commit(fileOf(other), resolutions(preview.packageHash)) }
            assertEquals(FoodPackageException.Kind.PACKAGE_CHANGED, error.kind)
        }

    @Test
    fun aNotAPackageFileIsRejectedByThePreview() =
        runTest {
            val error = assertFailsWith<FoodPackageException> { service.preview(fileOf("hello".encodeToByteArray())) }
            assertEquals(FoodPackageException.Kind.NOT_A_PACKAGE, error.kind)
        }

    // ── Cross-platform fixture ────────────────────────────────────────────

    /**
     * The package this exporter writes for a fixed database, committed under tests/fixtures so the
     * server's bun tests prove the web accepts it and the iOS tests read it. Regenerate with
     * `UPDATE_FIXTURES=1 ./gradlew :shared:testDebugUnitTest --tests '*LocalFoodPackageServiceTest*'`.
     */
    @Test
    fun androidExportMatchesTheCommittedFixture() =
        runTest {
            val oats =
                put(
                    food(
                        "temp_1",
                        "Bio Haferflocken",
                        brand = "Migros",
                        size = 40.0,
                        calories = 152.0,
                        barcode = "7610200000001",
                        labels = listOf("oat", "cereal"),
                        imageUrl = "file:///images/oats.webp",
                    ),
                ).let {
                    it.copy(
                        saturatedFat = 0.5,
                        sugar = 0.4,
                        sodium = 2.0,
                        iron = 1.8,
                        vitaminB12 = 0.0,
                        nutriScore = "a",
                        novaGroup = 1,
                        ingredientsText = "Haferflocken",
                    )
                }.also { put(it) }
            put(food("temp_2", "Bündner Käse", size = 30.0, calories = 118.0, labels = listOf("cheese")))
            val milk =
                put(
                    food(
                        "temp_3",
                        "Vollmilch",
                        brand = "Emmi",
                        unit = Food.ServingUnit.ml,
                        size = 250.0,
                        calories = 165.0,
                        labels = listOf("milk"),
                    ),
                )
            val honey =
                put(
                    food(
                        "temp_4",
                        "Honig",
                        size = 20.0,
                        calories = 61.0,
                        imageUrl = "https://images.openfoodfacts.org/images/products/honey.jpg",
                    ),
                )
            images.files["file:///images/oats.webp"] =
                File("../../tests/fixtures/food-package/server-export.bissbilanz").let {
                    archive.read(it.path).readImages(listOf("images/f1.webp")).getValue("images/f1.webp")
                }
            images.files["file:///images/porridge.webp"] =
                File("../../tests/fixtures/food-package/server-export.bissbilanz").let {
                    archive.read(it.path).readImages(listOf("images/r1.webp")).getValue("images/r1.webp")
                }
            putRecipe(
                "temp_r1",
                "Porridge",
                ing(oats.id, 80.0),
                ing(milk.id, 300.0, RecipeIngredient.ServingUnit.ml),
                ing(honey.id, 20.0),
                imageUrl = "file:///images/porridge.webp",
            )

            val exported =
                service.export(
                    FoodPackageSelection(foodIds = listOf(oats.id, "temp_2", milk.id), recipeIds = listOf("temp_r1")),
                    exportedAt = "2026-09-28T10:00:00.000Z",
                )
            val fixture = File("../../tests/fixtures/food-package/android-export.bissbilanz")
            if (System.getenv("UPDATE_FIXTURES") == "1") fixture.writeBytes(exported.bytes)
            assertTrue(fixture.isFile, "missing ${fixture.path}; regenerate with UPDATE_FIXTURES=1")

            // Zip bytes carry local timestamps; what has to stay identical is what the package says.
            val committed = archive.read(fixture.path)
            val fresh = archive.read(fileOf(exported.bytes))
            assertEquals(FoodPackageManifestCodec.encode(fresh.manifest), FoodPackageManifestCodec.encode(committed.manifest))
            val paths = fresh.manifest.foods.mapNotNull { it.image } + fresh.manifest.recipes.mapNotNull { it.image }
            assertEquals(paths.sorted(), committed.readImages(paths).keys.sorted())
            assertEquals("bissbilanz-foods-2026-09-28.bissbilanz", exported.fileName)
        }
}
