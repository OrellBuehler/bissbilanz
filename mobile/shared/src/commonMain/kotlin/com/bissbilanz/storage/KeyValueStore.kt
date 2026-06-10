package com.bissbilanz.storage

/**
 * Minimal string key-value store abstraction. [PlainStorage] is the platform-backed
 * implementation; tests can supply an in-memory fake.
 */
interface KeyValueStore {
    fun save(
        key: String,
        value: String,
    )

    fun load(key: String): String?

    fun delete(key: String)
}
