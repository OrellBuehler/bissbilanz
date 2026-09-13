package com.bissbilanz.util

import com.bissbilanz.ErrorReporter
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

/**
 * Where [decodeOrNull] sends decode failures. Set once at app start (Koin
 * init); a corrupt cache row is otherwise silently dropped and invisible.
 */
object JsonDecodeFailures {
    var reporter: ErrorReporter? = null
}

inline fun <reified T> Json.decodeOrNull(jsonString: String): T? =
    try {
        decodeFromString<T>(jsonString)
    } catch (e: SerializationException) {
        JsonDecodeFailures.reporter?.captureException(e)
        null
    }
