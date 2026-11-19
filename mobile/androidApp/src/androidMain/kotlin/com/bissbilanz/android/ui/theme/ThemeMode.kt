package com.bissbilanz.android.ui.theme

import android.app.UiModeManager
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.LocalActivity
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.bissbilanz.android.ui.util.rememberPreference

/** The device-local appearance override; [SYSTEM] follows the device's dark mode. */
enum class ThemeMode(
    val key: String,
) {
    SYSTEM("system"),
    LIGHT("light"),
    DARK("dark"),
    ;

    companion object {
        private const val PREFS_NAME = "appearance"
        private const val KEY_THEME = "theme"

        fun fromKey(key: String?): ThemeMode = entries.firstOrNull { it.key == key } ?: SYSTEM

        fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        fun read(prefs: SharedPreferences): ThemeMode = fromKey(prefs.getString(KEY_THEME, null))

        /**
         * Stores [mode] and, on API 31+, hands it to the platform as the app's own night
         * mode, so what Compose cannot reach follows it too: the platform time picker
         * dialogs and the window background of a cold start. Below 31 the Compose theme
         * ([isAppInDarkTheme]) is the only place the override applies.
         */
        fun save(
            context: Context,
            mode: ThemeMode,
        ) {
            prefs(context).edit().putString(KEY_THEME, mode.key).apply()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(UiModeManager::class.java)?.setApplicationNightMode(
                    when (mode) {
                        SYSTEM -> UiModeManager.MODE_NIGHT_AUTO
                        LIGHT -> UiModeManager.MODE_NIGHT_NO
                        DARK -> UiModeManager.MODE_NIGHT_YES
                    },
                )
            }
        }
    }
}

/** Whether the app draws its dark scheme: the stored [ThemeMode], or the system's choice. */
@Composable
fun isAppInDarkTheme(): Boolean {
    val context = LocalContext.current
    val prefs = remember(context) { ThemeMode.prefs(context) }
    val mode by rememberPreference(prefs) { ThemeMode.read(prefs) }
    val systemDark = isSystemInDarkTheme()
    return when (mode) {
        ThemeMode.SYSTEM -> systemDark
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
}

/**
 * Re-applies edge-to-edge with bar icons for [darkTheme]. The plain call reads the system's
 * dark mode, which leaves dark icons on a dark app (or the reverse) once the user overrides it.
 */
@Composable
fun SystemBarsForTheme(darkTheme: Boolean) {
    val activity = LocalActivity.current as? ComponentActivity ?: return
    DisposableEffect(activity, darkTheme) {
        activity.enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { darkTheme },
            navigationBarStyle = SystemBarStyle.auto(LIGHT_SCRIM, DARK_SCRIM) { darkTheme },
        )
        onDispose {}
    }
}

// androidx.activity's own defaults for the three-button navigation bar scrim.
private val LIGHT_SCRIM = Color.argb(0xe6, 0xFF, 0xFF, 0xFF)
private val DARK_SCRIM = Color.argb(0x80, 0x1b, 0x1b, 0x1b)
