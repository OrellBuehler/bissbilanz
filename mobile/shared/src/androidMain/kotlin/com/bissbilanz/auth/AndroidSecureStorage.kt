package com.bissbilanz.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

actual class SecureStorage(
    context: Context,
) {
    private val masterKey =
        MasterKey
            .Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

    private val prefs =
        EncryptedSharedPreferences.create(
            context,
            "bissbilanz_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )

    actual fun save(
        key: String,
        value: String,
    ) {
        prefs.edit().putString(key, value).apply()
    }

    actual fun load(key: String): String? = prefs.getString(key, null)

    actual fun delete(key: String) {
        prefs.edit().remove(key).apply()
    }
}
