package com.bissbilanz.android.ui.theme

import androidx.compose.animation.core.spring

val DefaultSpring = spring<Float>(dampingRatio = 0.85f, stiffness = 400f)
val GentleSpring = spring<Float>(dampingRatio = 0.9f, stiffness = 200f)
val SnapSpring = spring<Float>(dampingRatio = 1.0f, stiffness = 800f)
