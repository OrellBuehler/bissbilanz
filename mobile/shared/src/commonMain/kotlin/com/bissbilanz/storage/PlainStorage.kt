package com.bissbilanz.storage

/**
 * Unencrypted persistent key-value storage for non-secret app state (e.g. the app
 * mode). Deliberately NOT encrypted so values survive Android Auto Backup / device
 * restores. Never store secrets here — use [com.bissbilanz.auth.SecureStorage].
 */
expect class PlainStorage : KeyValueStore {
    override fun save(
        key: String,
        value: String,
    )

    override fun load(key: String): String?

    override fun delete(key: String)
}
