package com.bissbilanz.test

import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.storage.KeyValueStore

class FakeKeyValueStore : KeyValueStore {
    val values = mutableMapOf<String, String>()

    override fun save(
        key: String,
        value: String,
    ) {
        values[key] = value
    }

    override fun load(key: String): String? = values[key]

    override fun delete(key: String) {
        values.remove(key)
    }
}

/** AppModeManager backed by an in-memory store. `null` mode = not chosen (sync allowed). */
fun appModeManager(mode: AppMode? = null): AppModeManager = AppModeManager(FakeKeyValueStore()).apply { mode?.let { setMode(it) } }
