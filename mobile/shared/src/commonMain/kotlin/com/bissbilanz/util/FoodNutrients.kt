package com.bissbilanz.util

import com.bissbilanz.api.generated.model.FoodCreate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

/**
 * Merges arbitrary nutrient values into a [FoodCreate] by serial name.
 *
 * Going through JSON rather than a 40-branch `when` means any nutrient the API
 * gains is supported the moment the generated model has it — the alternative
 * silently drops unknown keys until someone remembers to extend the mapping.
 *
 * Keys the model does not declare are ignored; a null value clears the field.
 */
fun FoodCreate.withNutrients(
    values: Map<String, Double?>,
    json: Json,
): FoodCreate {
    if (values.isEmpty()) return this
    val base = json.encodeToJsonElement(this).jsonObject
    val known =
        FoodCreate.serializer().descriptor.let { descriptor ->
            (0 until descriptor.elementsCount).map { descriptor.getElementName(it) }.toSet()
        }
    val merged =
        buildMap {
            putAll(base)
            values.forEach { (key, value) ->
                if (key !in known) return@forEach
                put(key, if (value == null) JsonNull else JsonPrimitive(value))
            }
        }
    return json.decodeFromJsonElement(FoodCreate.serializer(), JsonObject(merged))
}
