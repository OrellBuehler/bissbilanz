package com.bissbilanz.wear

import android.content.Context
import android.content.res.Configuration
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import java.util.Locale

/**
 * The watch renders in the phone app's language, not in the watch's own system
 * locale: the pair is one product, and a watch set to English next to a phone
 * the user has in German reads as a bug. The phone puts its language in every
 * state push ([WearState.localeCode]); a payload without one (an older phone
 * build) leaves the watch on its system locale.
 *
 * Returns a context whose resources resolve in [localeCode], or this one when
 * there is nothing to override.
 */
fun Context.forAppLocale(localeCode: String?): Context {
    val tag = localeCode?.takeIf { it.isNotBlank() } ?: return this
    val locale = Locale.forLanguageTag(tag)
    if (locale.language.isEmpty()) return this
    val configuration = Configuration(resources.configuration).apply { setLocale(locale) }
    return createConfigurationContext(configuration)
}

/** Puts the phone's language in front of every [wearString] below this point. */
@Composable
fun ProvideAppLocale(
    localeCode: String?,
    content: @Composable () -> Unit,
) {
    val base = LocalContext.current
    val localized = remember(base, localeCode) { base.forAppLocale(localeCode) }
    CompositionLocalProvider(LocalContext provides localized, content = content)
}

/**
 * Like `stringResource`, but resolved through [LocalContext] so it follows the
 * locale [ProvideAppLocale] installed. Compose's own `stringResource` reads the
 * activity's resources directly, which would keep the watch's system language.
 */
@Composable
@ReadOnlyComposable
fun wearString(
    @StringRes id: Int,
): String = LocalContext.current.resources.getString(id)

/** [wearString] with format arguments, e.g. a kcal value. */
@Composable
@ReadOnlyComposable
fun wearString(
    @StringRes id: Int,
    vararg formatArgs: Any,
): String = LocalContext.current.resources.getString(id, *formatArgs)
