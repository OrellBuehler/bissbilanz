package com.bissbilanz.android.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.EaseOutCubic
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue

/**
 * Draws a chart in once per visit. Later data changes are drawn immediately instead of
 * replaying the reveal, and coming back to the screen does not replay it either.
 */
@Composable
fun rememberRevealFraction(durationMillis: Int): Animatable<Float, AnimationVector1D> {
    var revealed by rememberSaveable { mutableStateOf(false) }
    val fraction = remember { Animatable(if (revealed) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (!revealed) {
            fraction.animateTo(1f, animationSpec = tween(durationMillis, easing = EaseOutCubic))
            revealed = true
        }
    }
    return fraction
}
