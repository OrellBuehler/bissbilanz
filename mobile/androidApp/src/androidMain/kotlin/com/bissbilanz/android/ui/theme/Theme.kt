package com.bissbilanz.android.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

// Macro colors matching web app. These are the *graphic* tones: rings, chart
// series, progress fills — surfaces large enough that saturation reads well.
// For text and small labels use LocalMacroPalette, whose light-mode tones are
// darkened to stay legible on a white card (#EAB308 on white is 2:1).
val CaloriesBlue = Color(0xFF3B82F6)
val ProteinRed = Color(0xFFEF4444)
val CarbsOrange = Color(0xFFF97316)
val FatYellow = Color(0xFFEAB308)
val FiberGreen = Color(0xFF22C55E)
val WeightBlue = Color(0xFF2563EB)
val TrendGreen = Color(0xFF059669)
val ProjectionPurple = Color(0xFF8B5CF6)

// Not a macro, but part of the same fixed colour language: fasting surfaces.
val FastingIndigo = Color(0xFF6366F1)

/**
 * Text-safe equivalents of the macro colours, resolved per theme.
 *
 * The graphic tones above are tuned for filled shapes and fail WCAG AA as text
 * on a light surface, which is where the app renders most of them (macro chips,
 * ring counters, kcal totals). Every tone here clears 4.5:1 against the card
 * colour of its own scheme.
 */
@Immutable
data class MacroPalette(
    val calories: Color,
    val protein: Color,
    val carbs: Color,
    val fat: Color,
    val fiber: Color,
    val fasting: Color,
)

private val LightMacroPalette =
    MacroPalette(
        calories = Color(0xFF2563EB),
        protein = Color(0xFFDC2626),
        carbs = Color(0xFFC2410C),
        fat = Color(0xFFA16207),
        fiber = Color(0xFF15803D),
        fasting = Color(0xFF4F46E5),
    )

private val DarkMacroPalette =
    MacroPalette(
        calories = Color(0xFF93C5FD),
        protein = Color(0xFFFCA5A5),
        carbs = Color(0xFFFDBA74),
        fat = Color(0xFFFDE047),
        fiber = Color(0xFF86EFAC),
        fasting = Color(0xFFA5B4FC),
    )

val LocalMacroPalette = staticCompositionLocalOf { LightMacroPalette }

/** True when the app is rendering its dark scheme, for call sites that must branch. */
val LocalIsDarkTheme = staticCompositionLocalOf { false }

/**
 * The readable counterpart of a macro tone, for use as text or icon colour.
 *
 * The graphic constants are tuned for filled arcs and chart series. As small text
 * on a light card several of them fail badly — [FatYellow] lands near 2:1 — so text
 * call sites map through here and get the palette tone for the active theme. Any
 * colour that isn't part of the macro language is returned unchanged.
 */
@Composable
@ReadOnlyComposable
fun Color.macroTextTone(): Color {
    val palette = LocalMacroPalette.current
    return when (this) {
        CaloriesBlue, WeightBlue -> palette.calories
        ProteinRed -> palette.protein
        CarbsOrange -> palette.carbs
        FatYellow -> palette.fat
        FiberGreen, TrendGreen -> palette.fiber
        FastingIndigo -> palette.fasting
        else -> this
    }
}

object MacroColors {
    val current: MacroPalette
        @Composable
        @ReadOnlyComposable
        get() = LocalMacroPalette.current
}

private val DarkColorScheme =
    darkColorScheme(
        primary = Color(0xFF93C5FD),
        onPrimary = Color(0xFF0B2545),
        primaryContainer = Color(0xFF1D4ED8),
        onPrimaryContainer = Color(0xFFDBEAFE),
        inversePrimary = Color(0xFF2563EB),
        secondary = Color(0xFFB4C5DA),
        onSecondary = Color(0xFF1E2E3F),
        secondaryContainer = Color(0xFF35455A),
        onSecondaryContainer = Color(0xFFD3E1F2),
        tertiary = Color(0xFF86EFAC),
        onTertiary = Color(0xFF04371A),
        tertiaryContainer = Color(0xFF15803D),
        onTertiaryContainer = Color(0xFFDCFCE7),
        error = Color(0xFFFCA5A5),
        onError = Color(0xFF5C1010),
        errorContainer = Color(0xFFB91C1C),
        onErrorContainer = Color(0xFFFEE2E2),
        background = Color(0xFF0B0E11),
        onBackground = Color(0xFFE4E9ED),
        surface = Color(0xFF0B0E11),
        onSurface = Color(0xFFE4E9ED),
        surfaceVariant = Color(0xFF3F484F),
        onSurfaceVariant = Color(0xFFBEC8D2),
        surfaceTint = Color(0xFF93C5FD),
        inverseSurface = Color(0xFFE4E9ED),
        inverseOnSurface = Color(0xFF1B2329),
        outline = Color(0xFF8A939D),
        outlineVariant = Color(0xFF3F484F),
        scrim = Color(0xFF000000),
        surfaceBright = Color(0xFF313941),
        surfaceDim = Color(0xFF0B0E11),
        surfaceContainerLowest = Color(0xFF05070A),
        surfaceContainerLow = Color(0xFF161A1E),
        surfaceContainer = Color(0xFF1A1F24),
        surfaceContainerHigh = Color(0xFF242A30),
        surfaceContainerHighest = Color(0xFF2F363D),
    )

private val LightColorScheme =
    lightColorScheme(
        primary = Color(0xFF2563EB),
        onPrimary = Color(0xFFFFFFFF),
        primaryContainer = Color(0xFFDBEAFE),
        onPrimaryContainer = Color(0xFF1E3A8A),
        inversePrimary = Color(0xFF93C5FD),
        secondary = Color(0xFF4A5D72),
        onSecondary = Color(0xFFFFFFFF),
        secondaryContainer = Color(0xFFDAE4F0),
        onSecondaryContainer = Color(0xFF0E1B29),
        tertiary = Color(0xFF15803D),
        onTertiary = Color(0xFFFFFFFF),
        tertiaryContainer = Color(0xFFDCFCE7),
        onTertiaryContainer = Color(0xFF052E16),
        error = Color(0xFFDC2626),
        onError = Color(0xFFFFFFFF),
        errorContainer = Color(0xFFFEE2E2),
        onErrorContainer = Color(0xFF7F1D1D),
        background = Color(0xFFF7F9FB),
        onBackground = Color(0xFF1B2329),
        surface = Color(0xFFF7F9FB),
        onSurface = Color(0xFF1B2329),
        surfaceVariant = Color(0xFFE2E8EF),
        onSurfaceVariant = Color(0xFF4A5560),
        surfaceTint = Color(0xFF2563EB),
        inverseSurface = Color(0xFF2C343B),
        inverseOnSurface = Color(0xFFF0F3F6),
        outline = Color(0xFF79838D),
        outlineVariant = Color(0xFFC9D1D9),
        scrim = Color(0xFF000000),
        surfaceBright = Color(0xFFF9FBFC),
        surfaceDim = Color(0xFFD9DFE4),
        surfaceContainerLowest = Color(0xFFFFFFFF),
        surfaceContainerLow = Color(0xFFFFFFFF),
        surfaceContainer = Color(0xFFF1F4F7),
        surfaceContainerHigh = Color(0xFFEAEEF2),
        surfaceContainerHighest = Color(0xFFE4E9EE),
    )

// Corner language shared with the web app (--radius: 1rem), which reads more
// considered than the M3 default 12dp on the card-heavy screens.
private val BissbilanzShapes =
    Shapes(
        extraSmall =
            androidx.compose.foundation.shape
                .RoundedCornerShape(6.dp),
        small =
            androidx.compose.foundation.shape
                .RoundedCornerShape(10.dp),
        medium =
            androidx.compose.foundation.shape
                .RoundedCornerShape(16.dp),
        large =
            androidx.compose.foundation.shape
                .RoundedCornerShape(20.dp),
        extraLarge =
            androidx.compose.foundation.shape
                .RoundedCornerShape(28.dp),
    )

@Composable
fun BissbilanzTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colorScheme =
        when {
            dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
                val context = LocalContext.current
                if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
            }

            darkTheme -> {
                DarkColorScheme
            }

            else -> {
                LightColorScheme
            }
        }

    CompositionLocalProvider(
        LocalIsDarkTheme provides darkTheme,
        LocalMacroPalette provides if (darkTheme) DarkMacroPalette else LightMacroPalette,
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            shapes = BissbilanzShapes,
            content = content,
        )
    }
}
