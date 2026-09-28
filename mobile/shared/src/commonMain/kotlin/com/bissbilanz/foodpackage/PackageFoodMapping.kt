package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodPackageFoodRole
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject

/**
 * The 43 extended nutrients ride through the generated [Food] model by serial name, so a
 * nutrient the API gains only needs adding to [EXTENDED_NUTRIENT_KEYS]; a test checks the
 * list against the model.
 */
private val modelJson =
    Json {
        encodeDefaults = true
        ignoreUnknownKeys = true
    }

internal fun Food.nutrientValues(): Map<String, Double> {
    val obj = modelJson.encodeToJsonElement(Food.serializer(), this).jsonObject
    val values = LinkedHashMap<String, Double>()
    for (key in EXTENDED_NUTRIENT_KEYS) {
        (obj[key] as? JsonPrimitive)?.doubleOrNull?.let { values[key] = it }
    }
    return values
}

/** Replaces every extended nutrient: keys missing from [values] become unknown (null). */
internal fun Food.withNutrientValues(values: Map<String, Double>): Food {
    val obj = modelJson.encodeToJsonElement(Food.serializer(), this).jsonObject
    val merged =
        buildJsonObject {
            for ((key, value) in obj) if (key !in EXTENDED_NUTRIENT_KEYS) put(key, value)
            for (key in EXTENDED_NUTRIENT_KEYS) put(key, values[key]?.let { JsonPrimitive(it) } ?: JsonNull)
        }
    return modelJson.decodeFromJsonElement(Food.serializer(), merged)
}

internal fun Food.toPackageFood(
    ref: String,
    role: FoodPackageFoodRole,
    image: String?,
    imageUrl: String?,
): PackageFood =
    PackageFood(
        ref = ref,
        role = role,
        name = name,
        brand = brand,
        servingSize = servingSize,
        servingUnit = servingUnit.value,
        calories = calories,
        protein = protein,
        carbs = carbs,
        fat = fat,
        fiber = fiber,
        nutrients = nutrientValues(),
        barcode = barcode,
        nutriScore = nutriScore,
        novaGroup = novaGroup,
        additives = additives,
        ingredientsText = ingredientsText,
        labels = labels.orEmpty(),
        image = image,
        imageUrl = imageUrl,
    )

private fun servingUnitOf(value: String): Food.ServingUnit = Food.ServingUnit.entries.first { it.value == value }

/** A brand-new local food from a package food. */
internal fun PackageFood.toNewFood(
    id: String,
    barcode: String?,
    imageUrl: String?,
    labels: List<String>,
    now: String,
): Food =
    Food(
        id = id,
        userId = "",
        name = name,
        brand = brand?.trim()?.ifEmpty { null },
        servingSize = servingSize,
        servingUnit = servingUnitOf(servingUnit),
        calories = calories,
        protein = protein,
        carbs = carbs,
        fat = fat,
        fiber = fiber,
        barcode = barcode,
        isFavorite = false,
        nutriScore = nutriScore,
        novaGroup = novaGroup,
        additives = additives,
        ingredientsText = ingredientsText,
        imageUrl = imageUrl,
        labels = labels,
        createdAt = now,
        updatedAt = now,
    ).withNutrientValues(nutrients)

/**
 * What a replace writes over an existing food: everything the package carries, while the id,
 * favorite flag and creation time stay. Like the server, the barcode and image only change when
 * the package brings one, and labels are added next to the ones already there.
 */
internal fun PackageFood.replaceInto(
    existing: Food,
    barcode: String?,
    imageUrl: String?,
    labels: List<String>,
    now: String,
): Food =
    existing
        .copy(
            name = name,
            brand = brand?.trim()?.ifEmpty { null },
            servingSize = servingSize,
            servingUnit = servingUnitOf(servingUnit),
            calories = calories,
            protein = protein,
            carbs = carbs,
            fat = fat,
            fiber = fiber,
            barcode = barcode ?: existing.barcode,
            nutriScore = nutriScore,
            novaGroup = novaGroup,
            additives = additives,
            ingredientsText = ingredientsText,
            imageUrl = imageUrl ?: existing.imageUrl,
            labels = labels,
            updatedAt = now,
        ).withNutrientValues(nutrients)
