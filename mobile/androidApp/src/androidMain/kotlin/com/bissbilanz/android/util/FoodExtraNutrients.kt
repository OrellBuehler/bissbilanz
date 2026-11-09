package com.bissbilanz.android.util

import com.bissbilanz.model.Food
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.math.BigDecimal
import java.math.MathContext
import java.text.DecimalFormatSymbols
import java.util.Locale

/**
 * Nutrient keys the edit sheet already renders as their own fields; the
 * add-nutrient catalog offers everything else so nothing appears twice.
 */
val NAMED_NUTRIENT_KEYS =
    setOf(
        "calories",
        "protein",
        "carbs",
        "fat",
        "fiber",
        "saturatedFat",
        "sugar",
        "sodium",
        "salt",
        "potassium",
        "calcium",
        "iron",
        "vitaminC",
        "vitaminD",
    )

/** Non-nutrient fields that share the Food model but must never show up as nutrients. */
private val NON_NUTRIENT_KEYS =
    setOf(
        "id",
        "userId",
        "name",
        "brand",
        "barcode",
        "servingSize",
        "servingUnit",
        "isFavorite",
        "imageUrl",
        "createdAt",
        "updatedAt",
        "novaGroup",
        "nutriScore",
        "ecoScore",
        "source",
        "additives",
        "allergens",
        "categories",
        "ingredients",
        "labels",
        "isDeleted",
        "deletedAt",
    )

/**
 * The food's populated nutrients that the sheet has no dedicated field for, as
 * display strings. Read generically from the serialized model so a nutrient
 * added to the API surfaces without touching this code.
 */
fun Food.extraNutrientValues(json: Json): Map<String, String> =
    json
        .encodeToJsonElement(this)
        .jsonObject
        .mapNotNull { (key, element) ->
            if (key in NAMED_NUTRIENT_KEYS || key in NON_NUTRIENT_KEYS) return@mapNotNull null
            val value = runCatching { element.jsonPrimitive.doubleOrNull }.getOrNull() ?: return@mapNotNull null
            key to value.toEditableString()
        }.toMap()

/**
 * A stored value as an editable field's text: full precision rather than the one
 * decimal of a display, so saving an untouched form keeps 0.04 µg as 0.04 instead of
 * truncating it to 0. Float noise past ten significant digits is dropped, trailing
 * zeros are stripped, and the decimal separator follows [locale].
 */
fun Double.toEditableString(locale: Locale = Locale.getDefault()): String {
    if (isNaN() || isInfinite()) return ""
    val plain =
        BigDecimal
            .valueOf(this)
            .round(MathContext(10))
            .stripTrailingZeros()
            .toPlainString()
    val separator = DecimalFormatSymbols.getInstance(locale).decimalSeparator
    return if (separator == '.') plain else plain.replace('.', separator)
}
