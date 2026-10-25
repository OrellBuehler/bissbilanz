package com.bissbilanz.android.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.koin.compose.koinInject

/**
 * Saves a serializable model as JSON, so `rememberSaveable(stateSaver = …)` can keep a
 * selected food or recipe across rotation and process death. An unreadable value
 * restores as null.
 */
@Composable
inline fun <reified T : Any> rememberJsonStateSaver(): Saver<T?, String> {
    val json: Json = koinInject()
    return remember(json) {
        Saver(
            save = { value -> value?.let { json.encodeToString(it) } },
            restore = { raw -> runCatching { json.decodeFromString<T>(raw) }.getOrNull() },
        )
    }
}

/** [rememberJsonStateSaver] for a value that is never null, such as a list of form rows. */
@Composable
inline fun <reified T : Any> rememberJsonValueSaver(): Saver<T, String> {
    val json: Json = koinInject()
    return remember(json) {
        Saver(
            save = { value -> json.encodeToString(value) },
            restore = { raw -> runCatching { json.decodeFromString<T>(raw) }.getOrNull() },
        )
    }
}
