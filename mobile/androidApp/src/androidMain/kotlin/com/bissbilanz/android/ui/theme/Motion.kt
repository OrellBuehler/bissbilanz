package com.bissbilanz.android.ui.theme

import androidx.compose.animation.core.spring

object Motion {
    const val DEFAULT_DAMPING = 0.85f
    const val DEFAULT_STIFFNESS = 400f
    const val GENTLE_DAMPING = 0.9f
    const val GENTLE_STIFFNESS = 200f
    const val SNAP_DAMPING = 1.0f
    const val SNAP_STIFFNESS = 800f
}

val GentleSpring = spring<Float>(dampingRatio = Motion.GENTLE_DAMPING, stiffness = Motion.GENTLE_STIFFNESS)
val SnapSpring = spring<Float>(dampingRatio = Motion.SNAP_DAMPING, stiffness = Motion.SNAP_STIFFNESS)
