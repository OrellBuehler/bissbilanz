package com.bissbilanz.util

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

inline fun <reified T> Json.decodeOrNull(jsonString: String): T? =
    try {
        decodeFromString<T>(jsonString)
    } catch (_: SerializationException) {
        null
    }
