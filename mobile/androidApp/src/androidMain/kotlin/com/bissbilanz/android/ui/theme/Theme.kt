package com.bissbilanz.android.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Macro colors matching web app
val CaloriesBlue = Color(0xFF3B82F6)
val ProteinRed = Color(0xFFEF4444)
val CarbsOrange = Color(0xFFF97316)
val FatYellow = Color(0xFFEAB308)
val FiberGreen = Color(0xFF22C55E)

private val DarkColorScheme =
    darkColorScheme(
        primary = CaloriesBlue,
        secondary = ProteinRed,
        tertiary = FiberGreen,
        background = Color(0xFF0A0A0A),
        surface = Color(0xFF1A1A1A),
        onPrimary = Color.White,
        onSecondary = Color.White,
        onBackground = Color.White,
        onSurface = Color.White,
    )

private val LightColorScheme =
    lightColorScheme(
        primary = CaloriesBlue,
        secondary = ProteinRed,
        tertiary = FiberGreen,
        background = Color.White,
        surface = Color(0xFFF5F5F5),
        onPrimary = Color.White,
        onSecondary = Color.White,
        onBackground = Color.Black,
        onSurface = Color.Black,
    )

@Composable
fun BissbilanzTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        content = content,
    )
}
