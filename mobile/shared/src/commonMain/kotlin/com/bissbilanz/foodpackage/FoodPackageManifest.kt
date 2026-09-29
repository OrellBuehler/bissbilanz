package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.FoodPackageFoodRole
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlin.math.abs
import kotlin.math.floor

/** Why a package could not be read, written or applied — lets the UI pick a friendly message. */
class FoodPackageException(
    val kind: Kind,
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause) {
    enum class Kind {
        /** Not a Bissbilanz food package at all. */
        NOT_A_PACKAGE,

        /** A full account export, which belongs under Settings, not here. */
        ACCOUNT_EXPORT,

        /** Made by a newer app version. */
        NEWER_VERSION,

        /** A food package whose content is malformed. */
        INVALID,
        EMPTY,
        TOO_LARGE,
        TOO_MANY_FILES,
        DAMAGED,

        /** The archive has no `bissbilanz-foods.json`. */
        NO_MANIFEST,

        /** The selection matches no foods or recipes. */
        NOTHING_TO_EXPORT,

        /** The database changed since the preview; run the preview again. */
        STALE_PREVIEW,

        /** The file is not the one the preview was made from. */
        PACKAGE_CHANGED,

        /** The submitted resolutions are not allowed. */
        BAD_RESOLUTION,
    }
}

const val WRONG_FILE_ACCOUNT_EXPORT =
    "This is a full account export — import it under Settings → Import data instead"

/** The 43 extended nutrients, in the order of `src/lib/nutrients.ts` (`ALL_NUTRIENT_KEYS`). */
val EXTENDED_NUTRIENT_KEYS: List<String> =
    listOf(
        "saturatedFat",
        "monounsaturatedFat",
        "polyunsaturatedFat",
        "transFat",
        "cholesterol",
        "omega3",
        "omega6",
        "sugar",
        "addedSugars",
        "sugarAlcohols",
        "starch",
        "sodium",
        "potassium",
        "calcium",
        "iron",
        "magnesium",
        "phosphorus",
        "zinc",
        "copper",
        "manganese",
        "selenium",
        "iodine",
        "fluoride",
        "chromium",
        "molybdenum",
        "chloride",
        "vitaminA",
        "vitaminC",
        "vitaminD",
        "vitaminE",
        "vitaminK",
        "vitaminB1",
        "vitaminB2",
        "vitaminB3",
        "vitaminB5",
        "vitaminB6",
        "vitaminB7",
        "vitaminB9",
        "vitaminB12",
        "caffeine",
        "alcohol",
        "water",
        "salt",
    )

data class PackageFood(
    val ref: String,
    val role: FoodPackageFoodRole,
    val name: String,
    val brand: String?,
    val servingSize: Double,
    val servingUnit: String,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
    /** Only the nutrients that have a value; a missing key means "unknown". */
    val nutrients: Map<String, Double>,
    val barcode: String?,
    val nutriScore: String?,
    val novaGroup: Int?,
    val additives: List<String>?,
    val ingredientsText: String?,
    val labels: List<String>,
    val image: String?,
    val imageUrl: String?,
)

data class PackageIngredient(
    val food: String,
    val quantity: Double,
    val servingUnit: String,
)

data class PackageRecipe(
    val ref: String,
    val name: String,
    val totalServings: Double,
    val cookedWeight: Double?,
    val image: String?,
    val ingredients: List<PackageIngredient>,
)

data class PackageManifest(
    val formatVersion: Int,
    val exportedAt: String?,
    val foods: List<PackageFood>,
    val recipes: List<PackageRecipe>,
)

/**
 * Reads and writes `bissbilanz-foods.json`, enforcing what the server's
 * `foodPackageManifestSchema` (`src/lib/server/validation/food-package.ts`) enforces so a
 * package one platform accepts is accepted by all of them.
 */
object FoodPackageManifestCodec {
    private const val BYTE_ORDER_MARK = "\uFEFF"
    private val foodRef = Regex("^f[0-9]{1,6}$")
    private val recipeRef = Regex("^r[0-9]{1,6}$")
    private val servingUnits = setOf("g", "kg", "ml", "cl", "l", "oz", "lb", "fl_oz", "cup", "tbsp", "tsp")
    private val nutriScores = setOf("a", "b", "c", "d", "e")

    private val parser = Json { isLenient = false }
    private val writer =
        Json {
            prettyPrint = true
            prettyPrintIndent = "\t"
        }

    private fun invalid(
        path: String,
        message: String,
    ): Nothing = throw FoodPackageException(FoodPackageException.Kind.INVALID, "Invalid food package: $path — $message")

    private fun notAPackage(cause: Throwable? = null): Nothing =
        throw FoodPackageException(
            FoodPackageException.Kind.NOT_A_PACKAGE,
            "Unrecognized file: expected a Bissbilanz food package",
            cause,
        )

    fun parse(text: String): PackageManifest {
        val root =
            try {
                parser.parseToJsonElement(text.removePrefix(BYTE_ORDER_MARK))
            } catch (e: SerializationException) {
                notAPackage(e)
            }
        val header = root as? JsonObject
        if (header != null) {
            val format = (header["format"] as? JsonPrimitive)?.takeIf { it.isString }?.content
            if (format != FOOD_PACKAGE_FORMAT) {
                if ("foods" in header && "formatVersion" in header && "format" !in header) {
                    throw FoodPackageException(FoodPackageException.Kind.ACCOUNT_EXPORT, WRONG_FILE_ACCOUNT_EXPORT)
                }
                notAPackage()
            }
            val version = (header["formatVersion"] as? JsonPrimitive)?.doubleOrNull
            if (version != null && version > FOOD_PACKAGE_VERSION) {
                throw FoodPackageException(
                    FoodPackageException.Kind.NEWER_VERSION,
                    "This package was made by a newer version of Bissbilanz — update first",
                )
            }
        } else {
            notAPackage()
        }

        val formatVersion = int(header["formatVersion"], "formatVersion", min = 1)
        val exportedAt = optString(header["exportedAt"], "exportedAt", 64)
        val foodsJson = array(header["foods"], "foods", MAX_PACKAGE_FOODS)
        val recipesJson =
            if (header["recipes"] == null || header["recipes"] is JsonNull) {
                JsonArray(emptyList())
            } else {
                array(header["recipes"], "recipes", MAX_PACKAGE_RECIPES)
            }

        val foods = foodsJson.mapIndexed { index, element -> parseFood(element, "foods.$index") }
        val seenFoods = HashSet<String>()
        foods.forEachIndexed { index, food ->
            if (!seenFoods.add(food.ref)) invalid("foods.$index.ref", "Duplicate ref")
        }
        val recipes = recipesJson.mapIndexed { index, element -> parseRecipe(element, "recipes.$index") }
        val seenRecipes = HashSet<String>()
        recipes.forEachIndexed { index, recipe ->
            if (!seenRecipes.add(recipe.ref)) invalid("recipes.$index.ref", "Duplicate ref")
        }
        return PackageManifest(formatVersion, exportedAt, foods, recipes)
    }

    // ── Field readers ─────────────────────────────────────────────────────

    private fun isAbsent(element: JsonElement?) = element == null || element is JsonNull

    private fun obj(
        element: JsonElement?,
        path: String,
    ): JsonObject = element as? JsonObject ?: invalid(path, "Expected object")

    private fun array(
        element: JsonElement?,
        path: String,
        max: Int,
    ): JsonArray {
        val array = element as? JsonArray ?: invalid(path, "Expected array")
        if (array.size > max) invalid(path, "Too many items (at most $max)")
        return array
    }

    private fun string(
        element: JsonElement?,
        path: String,
        max: Int,
    ): String {
        val primitive = element as? JsonPrimitive
        if (primitive == null || element is JsonNull || !primitive.isString) invalid(path, "Expected string")
        if (primitive.content.length > max) invalid(path, "Too long (at most $max characters)")
        return primitive.content
    }

    private fun optString(
        element: JsonElement?,
        path: String,
        max: Int,
    ): String? = if (isAbsent(element)) null else string(element, path, max)

    private fun number(
        element: JsonElement?,
        path: String,
    ): Double {
        val primitive = element as? JsonPrimitive
        if (primitive == null || element is JsonNull || primitive.isString) invalid(path, "Expected number")
        val value = primitive.doubleOrNull ?: invalid(path, "Expected number")
        if (value.isNaN() || value.isInfinite()) invalid(path, "Expected number")
        return value
    }

    private fun nonNegative(
        element: JsonElement?,
        path: String,
    ): Double = number(element, path).also { if (it < 0) invalid(path, "Must be at least 0") }

    private fun positive(
        element: JsonElement?,
        path: String,
    ): Double = number(element, path).also { if (it <= 0) invalid(path, "Must be greater than 0") }

    private fun int(
        element: JsonElement?,
        path: String,
        min: Int,
        max: Int = Int.MAX_VALUE,
    ): Int {
        val value = number(element, path)
        if (value != floor(value)) invalid(path, "Expected integer")
        if (value < min || value > max) invalid(path, "Out of range")
        return value.toInt()
    }

    private fun unit(
        element: JsonElement?,
        path: String,
    ): String {
        val value = string(element, path, 16)
        if (value !in servingUnits) invalid(path, "Invalid serving unit")
        return value
    }

    private fun imagePath(
        element: JsonElement?,
        path: String,
    ): String? {
        if (isAbsent(element)) return null
        val value = string(element, path, 512)
        if (!IMAGE_PATH_REGEX.matches(value)) invalid(path, "Invalid image path")
        return value
    }

    private fun parseFood(
        element: JsonElement,
        path: String,
    ): PackageFood {
        val json = obj(element, path)
        val ref = string(json["ref"], "$path.ref", 16)
        if (!foodRef.matches(ref)) invalid("$path.ref", "Invalid ref")
        val role =
            if (isAbsent(json["role"])) {
                FoodPackageFoodRole.selected
            } else {
                when (string(json["role"], "$path.role", 16)) {
                    "selected" -> FoodPackageFoodRole.selected
                    "ingredient" -> FoodPackageFoodRole.ingredient
                    else -> invalid("$path.role", "Invalid role")
                }
            }
        val name = string(json["name"], "$path.name", Int.MAX_VALUE).trim()
        if (name.isEmpty() || name.length > 200) invalid("$path.name", "Must be 1 to 200 characters")
        val nutrients = LinkedHashMap<String, Double>()
        for (key in EXTENDED_NUTRIENT_KEYS) {
            val value = json[key]
            if (!isAbsent(value)) nutrients[key] = nonNegative(value, "$path.$key")
        }
        val nutriScore = optString(json["nutriScore"], "$path.nutriScore", 1)
        if (nutriScore != null && nutriScore !in nutriScores) invalid("$path.nutriScore", "Invalid Nutri-Score")
        val additives =
            if (isAbsent(json["additives"])) {
                null
            } else {
                array(json["additives"], "$path.additives", 100).mapIndexed { i, item -> string(item, "$path.additives.$i", 100) }
            }
        val labels =
            if (isAbsent(json["labels"])) {
                emptyList()
            } else {
                array(json["labels"], "$path.labels", MAX_LABELS_IN_PACKAGE)
                    .mapIndexed { i, item -> string(item, "$path.labels.$i", 120) }
            }
        return PackageFood(
            ref = ref,
            role = role,
            name = name,
            brand = optString(json["brand"], "$path.brand", 200),
            servingSize = positive(json["servingSize"], "$path.servingSize"),
            servingUnit = unit(json["servingUnit"], "$path.servingUnit"),
            calories = nonNegative(json["calories"], "$path.calories"),
            protein = nonNegative(json["protein"], "$path.protein"),
            carbs = nonNegative(json["carbs"], "$path.carbs"),
            fat = nonNegative(json["fat"], "$path.fat"),
            fiber = nonNegative(json["fiber"], "$path.fiber"),
            nutrients = nutrients,
            barcode = optString(json["barcode"], "$path.barcode", 64),
            nutriScore = nutriScore,
            novaGroup = if (isAbsent(json["novaGroup"])) null else int(json["novaGroup"], "$path.novaGroup", 1, 4),
            additives = additives,
            ingredientsText = optString(json["ingredientsText"], "$path.ingredientsText", 10000),
            labels = labels,
            image = imagePath(json["image"], "$path.image"),
            imageUrl = optString(json["imageUrl"], "$path.imageUrl", 2048),
        )
    }

    private fun parseRecipe(
        element: JsonElement,
        path: String,
    ): PackageRecipe {
        val json = obj(element, path)
        val ref = string(json["ref"], "$path.ref", 16)
        if (!recipeRef.matches(ref)) invalid("$path.ref", "Invalid ref")
        val name = string(json["name"], "$path.name", Int.MAX_VALUE).trim()
        if (name.isEmpty() || name.length > 200) invalid("$path.name", "Must be 1 to 200 characters")
        val ingredients =
            array(json["ingredients"], "$path.ingredients", MAX_RECIPE_INGREDIENTS).mapIndexed { i, item ->
                val ingredient = obj(item, "$path.ingredients.$i")
                val food = string(ingredient["food"], "$path.ingredients.$i.food", 16)
                if (!foodRef.matches(food)) invalid("$path.ingredients.$i.food", "Invalid ref")
                PackageIngredient(
                    food = food,
                    quantity = positive(ingredient["quantity"], "$path.ingredients.$i.quantity"),
                    servingUnit = unit(ingredient["servingUnit"], "$path.ingredients.$i.servingUnit"),
                )
            }
        return PackageRecipe(
            ref = ref,
            name = name,
            totalServings = positive(json["totalServings"], "$path.totalServings"),
            cookedWeight = if (isAbsent(json["cookedWeight"])) null else positive(json["cookedWeight"], "$path.cookedWeight"),
            image = imagePath(json["image"], "$path.image"),
            ingredients = ingredients,
        )
    }

    // ── Writer ────────────────────────────────────────────────────────────

    private fun num(value: Double): JsonPrimitive =
        if (value == floor(value) && abs(value) < 1e15) JsonPrimitive(value.toLong()) else JsonPrimitive(value)

    private fun str(value: String?): JsonElement = if (value == null) JsonNull else JsonPrimitive(value)

    private fun foodJson(food: PackageFood): JsonObject =
        buildJsonObject {
            put("ref", JsonPrimitive(food.ref))
            put("role", JsonPrimitive(food.role.value))
            put("name", JsonPrimitive(food.name))
            put("brand", str(food.brand))
            put("servingSize", num(food.servingSize))
            put("servingUnit", JsonPrimitive(food.servingUnit))
            put("calories", num(food.calories))
            put("protein", num(food.protein))
            put("carbs", num(food.carbs))
            put("fat", num(food.fat))
            put("fiber", num(food.fiber))
            // Every nutrient is written, null when unknown — like the web exporter.
            for (key in EXTENDED_NUTRIENT_KEYS) put(key, food.nutrients[key]?.let { num(it) } ?: JsonNull)
            put("barcode", str(food.barcode))
            put("nutriScore", str(food.nutriScore))
            put("novaGroup", food.novaGroup?.let { JsonPrimitive(it) } ?: JsonNull)
            put("additives", food.additives?.let { list -> buildJsonArray { list.forEach { add(JsonPrimitive(it)) } } } ?: JsonNull)
            put("ingredientsText", str(food.ingredientsText))
            put("labels", buildJsonArray { food.labels.forEach { add(JsonPrimitive(it)) } })
            put("image", str(food.image))
            put("imageUrl", str(food.imageUrl))
        }

    private fun recipeJson(recipe: PackageRecipe): JsonObject =
        buildJsonObject {
            put("ref", JsonPrimitive(recipe.ref))
            put("name", JsonPrimitive(recipe.name))
            put("totalServings", num(recipe.totalServings))
            put("cookedWeight", recipe.cookedWeight?.let { num(it) } ?: JsonNull)
            put("image", str(recipe.image))
            put(
                "ingredients",
                buildJsonArray {
                    recipe.ingredients.forEach {
                        add(
                            buildJsonObject {
                                put("food", JsonPrimitive(it.food))
                                put("quantity", num(it.quantity))
                                put("servingUnit", JsonPrimitive(it.servingUnit))
                            },
                        )
                    }
                },
            )
        }

    fun encode(manifest: PackageManifest): String {
        val root =
            buildJsonObject {
                put("format", JsonPrimitive(FOOD_PACKAGE_FORMAT))
                put("formatVersion", JsonPrimitive(manifest.formatVersion))
                put("exportedAt", str(manifest.exportedAt))
                put("foods", buildJsonArray { manifest.foods.forEach { add(foodJson(it)) } })
                put("recipes", buildJsonArray { manifest.recipes.forEach { add(recipeJson(it)) } })
            }
        return writer.encodeToString(JsonElement.serializer(), root)
    }

    /** Labels a package food may carry; the server allows twice what one food can keep. */
    const val MAX_LABELS_IN_PACKAGE = 40
}
