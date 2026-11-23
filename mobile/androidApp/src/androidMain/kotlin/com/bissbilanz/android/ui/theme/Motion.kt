package com.bissbilanz.android.ui.theme

import android.provider.Settings
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

object Motion {
    const val DEFAULT_DAMPING = 0.85f
    const val DEFAULT_STIFFNESS = 400f
    const val GENTLE_DAMPING = 0.9f
    const val GENTLE_STIFFNESS = 200f
    const val SNAP_DAMPING = 1.0f
    const val SNAP_STIFFNESS = 800f
}

val GentleSpring = spring<Float>(dampingRatio = Motion.GENTLE_DAMPING, stiffness = Motion.GENTLE_STIFFNESS)

@Composable
fun rememberReduceMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    return remember { Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
}
