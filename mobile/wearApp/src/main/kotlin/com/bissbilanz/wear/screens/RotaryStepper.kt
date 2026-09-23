package com.bissbilanz.wear.screens

import android.view.HapticFeedbackConstants
import android.view.ViewConfiguration
import androidx.compose.foundation.focusable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalView
import androidx.wear.compose.foundation.requestFocusOnHierarchyActive

/**
 * Makes this element the target of the crown or rotating bezel, turning each
 * detent into one [onStep] (+1 clockwise, −1 back) — the way the Apple Watch app
 * drives every value with the Digital Crown, so a weight twenty kilos off the
 * seed is a turn of the crown rather than two hundred taps.
 *
 * It takes the crown only while its `hierarchicalFocusGroup` is active: the
 * pager keeps neighbouring pages composed, and a stepper off screen must not
 * keep turning while the user looks at another page. A list on the same screen
 * has to leave the crown alone (`rotaryScrollableBehavior = null`), or the two
 * compete for it.
 */
@Composable
fun Modifier.rotaryStepper(onStep: (Int) -> Unit): Modifier {
    val view = LocalView.current
    val stepPixels = remember(view) { ViewConfiguration.get(view.context).scaledVerticalScrollFactor }
    val currentOnStep by rememberUpdatedState(onStep)
    val accumulated = remember { mutableFloatStateOf(0f) }
    return this
        .requestFocusOnHierarchyActive()
        .onRotaryScrollEvent { event ->
            accumulated.floatValue += event.verticalScrollPixels
            val steps = rotarySteps(accumulated.floatValue, stepPixels)
            if (steps != 0) {
                accumulated.floatValue -= steps * stepPixels
                currentOnStep(steps)
                view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
            }
            true
        }.focusable()
}

/** Whole steps in [pixels] of rotation, truncated toward zero so a partial turn carries over. */
internal fun rotarySteps(
    pixels: Float,
    stepPixels: Float,
): Int = if (stepPixels <= 0f) 0 else (pixels / stepPixels).toInt()
