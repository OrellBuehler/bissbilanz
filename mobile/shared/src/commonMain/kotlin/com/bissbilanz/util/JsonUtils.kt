package com.bissbilanz.util

import com.bissbilanz.api.generated.model.Preferences
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

inline fun <reified T> Json.decodeOrNull(jsonString: String): T? =
    try {
        decodeFromString<T>(jsonString)
    } catch (e: SerializationException) {
        Failures.report(e)
        null
    }

private val splitWidgetKeys = listOf("showWaterWidget", "showActivityWidget", "showNotesWidget")

fun Json.decodePreferencesOrNull(jsonString: String): Preferences? =
    try {
        val obj = parseToJsonElement(jsonString).jsonObject
        val legacy = obj["showDayPropertiesWidget"]?.jsonPrimitive?.booleanOrNull ?: true
        val filled = JsonObject(obj + splitWidgetKeys.filter { it !in obj }.associateWith { JsonPrimitive(legacy) })
        decodeFromJsonElement<Preferences>(filled)
    } catch (e: SerializationException) {
        Failures.report(e)
        null
    } catch (e: IllegalArgumentException) {
        Failures.report(e)
        null
    }
