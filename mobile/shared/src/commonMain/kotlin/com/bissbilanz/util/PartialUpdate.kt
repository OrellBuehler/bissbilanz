package com.bissbilanz.util

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

/**
 * A field of a partial-update body the caller can deliberately clear.
 *
 * The shared [Json] runs with `encodeDefaults = false`, so a `null` property of a
 * generated `*Update` model is simply omitted from the PATCH body — on the wire that is
 * indistinguishable from "leave this field alone", and the server only writes a column
 * when the key is present. Clearing therefore has to travel as an explicit JSON `null`,
 * which the generated models cannot express (they are regenerated from the OpenAPI spec
 * and must not be hand-edited). The intent rides alongside the body as a set of keys
 * instead; [encodePartialUpdate] turns those into the explicit nulls just before the
 * request, and the sync queue carries them so an offline clear still clears on upload.
 */
interface ClearableField {
    val jsonKey: String
}

/**
 * Clearable fields of `EntryUpdate`. Only the columns the server accepts an explicit
 * null for are listed: `mealType`, `servings`, `date`, `foodId`, `recipeId` and
 * `eatenAt` are optional-but-not-nullable in `entryUpdateSchema` (and a null `eatenAt`
 * would mean "now", not "clear").
 */
enum class EntryField(
    override val jsonKey: String,
) : ClearableField {
    NOTES("notes"),
    QUICK_NAME("quickName"),
    QUICK_CALORIES("quickCalories"),
    QUICK_PROTEIN("quickProtein"),
    QUICK_CARBS("quickCarbs"),
    QUICK_FAT("quickFat"),
    QUICK_FIBER("quickFiber"),
    QUICK_NUTRIENTS("quickNutrients"),
}

/** Clearable fields of `PreferencesUpdate`. */
enum class PreferencesField(
    override val jsonKey: String,
) : ClearableField {
    BIOLOGICAL_SEX("biologicalSex"),
}

/** Clearable fields of the `SupplementCreate` body a supplement PATCH sends. */
enum class SupplementField(
    override val jsonKey: String,
) : ClearableField {
    SCHEDULE_DAYS("scheduleDays"),
}

/** Wire keys for a set of clearable fields, sorted so the queued payload is stable. */
fun Collection<ClearableField>.jsonKeys(): List<String> = map { it.jsonKey }.sorted().distinct()

/**
 * Encodes [value] and adds an explicit JSON `null` for every key in [clearedKeys], so a
 * field the user emptied reaches the server as a clear instead of being omitted.
 */
inline fun <reified T> Json.encodePartialUpdate(
    value: T,
    clearedKeys: Collection<String>,
): JsonObject {
    val encoded = encodeToJsonElement(value).jsonObject
    if (clearedKeys.isEmpty()) return encoded
    val merged = encoded.toMutableMap()
    for (key in clearedKeys) merged[key] = JsonNull
    return JsonObject(merged)
}
