package com.bissbilanz.android.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.res.Configuration
import android.os.Build
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import java.util.Locale

/**
 * The in-app language override, matching the English/Deutsch picker iOS carries in
 * `Utilities/Localization.swift`.
 *
 * [SYSTEM] (an empty tag) follows the device locale. A concrete tag is handed to
 * [AppCompatDelegate.setApplicationLocales], which on API 33+ is the platform's own
 * per-app language — the choice then also shows up in Android's app settings and
 * survives reinstalls of the process. `minSdk` is 26, so the pre-33 half of the range
 * has no platform support at all: the tag is mirrored into SharedPreferences and
 * applied to each activity's resources through [wrap].
 */
object AppLanguage {
    /** Follow the device locale. */
    const val SYSTEM = ""

    /** The tags listed in `res/xml/locales_config.xml`; the app ships en and de only. */
    val SUPPORTED_TAGS = listOf(SYSTEM, "en", "de")

    private const val PREFS_NAME = "app_language"
    private const val KEY_TAG = "language_tag"

    /**
     * The device locale as it was before the app ever overrode [Locale.getDefault].
     *
     * [wrap] has to set the process default so number and date parsing/formatting follow
     * the picked language on 26..32. Switching back to [SYSTEM] then has to put the
     * original back: leaving the last override in place made the UI flip to the device
     * language while `toLocalizedDoubleOrNull` and friends kept parsing in the old one,
     * until the next cold start. Captured on first use, which is the first activity's
     * `attachBaseContext` — before any override has been applied.
     */
    private val deviceDefaultLocale: Locale by lazy { Locale.getDefault() }

    fun stored(context: Context): String {
        val tag =
            context
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_TAG, SYSTEM)
                ?: SYSTEM
        return if (tag in SUPPORTED_TAGS) tag else SYSTEM
    }

    fun apply(
        context: Context,
        tag: String,
    ) {
        context
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_TAG, tag)
            .apply()
        AppCompatDelegate.setApplicationLocales(
            if (tag == SYSTEM) {
                LocaleListCompat.getEmptyLocaleList()
            } else {
                LocaleListCompat.forLanguageTags(tag)
            },
        )
    }

    /**
     * Wraps an activity's base context in the stored locale. API 33+ already applied it
     * before the context was created, so this only covers 26..32.
     */
    fun wrap(base: Context): Context {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return base
        // Read before the first override so the lazy records the real device locale and
        // not one this method installed on an earlier activity.
        val deviceDefault = deviceDefaultLocale
        val tag = stored(base)
        val locale = if (tag == SYSTEM) deviceDefault else Locale.forLanguageTag(tag)
        Locale.setDefault(locale)
        if (tag == SYSTEM) return base
        val config = Configuration(base.resources.configuration)
        config.setLocale(locale)
        return base.createConfigurationContext(config)
    }

    /**
     * Stores [tag] and makes it take effect now. API 33+ rebuilds the activity itself;
     * below that nothing would pick up the new resources until the next cold start, so
     * the hosting activity is recreated by hand.
     */
    fun applyAndRefresh(
        context: Context,
        tag: String,
    ) {
        apply(context, tag)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
        var current: Context? = context
        while (current is ContextWrapper) {
            if (current is Activity) {
                current.recreate()
                return
            }
            current = current.baseContext
        }
    }
}
