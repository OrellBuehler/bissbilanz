package com.bissbilanz.android.ui.components

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoFixHigh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.util.cutOutSubject
import com.bissbilanz.android.util.isSubjectCutoutSupported
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

enum class CutoutPhase { Idle, Downloading, Segmenting }

/**
 * The "Remove background" state of one photo: keeps the original and, once asked for, the
 * cut-out, and says which of the two is shown. Flipping back restores the original without
 * running the segmentation again.
 */
@Stable
class CutoutState(
    private val context: Context,
    private val scope: CoroutineScope,
    private val errorReporter: ErrorReporter,
    private val source: Bitmap,
) {
    private var cutout by mutableStateOf<Bitmap?>(null)

    var active by mutableStateOf(false)
        private set
    var phase by mutableStateOf(CutoutPhase.Idle)
        private set
    var noSubject by mutableStateOf(false)
        private set
    var failed by mutableStateOf(false)
        private set

    val shown: Bitmap get() = if (active) cutout ?: source else source
    val transparent: Boolean get() = active && cutout != null
    val busy: Boolean get() = phase != CutoutPhase.Idle

    fun toggle() {
        if (busy) return
        noSubject = false
        failed = false
        if (active) {
            active = false
            return
        }
        if (cutout != null) {
            active = true
            return
        }
        scope.launch {
            phase = CutoutPhase.Segmenting
            try {
                val result = cutOutSubject(context, source) { phase = CutoutPhase.Downloading }
                if (result == null) {
                    noSubject = true
                } else {
                    cutout = result
                    active = true
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                errorReporter.captureException(e)
                failed = true
            } finally {
                phase = CutoutPhase.Idle
            }
        }
    }
}

@Composable
fun rememberCutoutState(source: Bitmap): CutoutState {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val errorReporter: ErrorReporter = koinInject()
    return remember(source) { CutoutState(context, scope, errorReporter, source) }
}

/** The toggle chip and its status line; renders nothing where Play services is missing. */
@Composable
fun CutoutToggle(
    state: CutoutState,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    if (!remember { isSubjectCutoutSupported(context) }) return

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        FilterChip(
            selected = state.active,
            onClick = state::toggle,
            enabled = !state.busy,
            label = { Text(stringResource(R.string.cutout_remove_background), maxLines = 1) },
            leadingIcon = {
                if (state.busy) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Outlined.AutoFixHigh, contentDescription = null, modifier = Modifier.size(18.dp))
                }
            },
        )
        val status =
            when {
                state.phase == CutoutPhase.Downloading -> stringResource(R.string.cutout_downloading) to Color.White
                state.noSubject -> stringResource(R.string.cutout_no_subject) to Color.White
                state.failed -> stringResource(R.string.cutout_failed) to MaterialTheme.colorScheme.error
                else -> null
            }
        status?.let { (text, color) ->
            Text(text, style = MaterialTheme.typography.bodySmall, color = color, textAlign = TextAlign.Center)
        }
    }
}

private val CheckerLight = Color(0xFFE6E6E6)
private val CheckerDark = Color(0xFFC4C4C4)

/** A neutral checkerboard, so the transparent parts of a cut-out read as transparent. */
@Composable
fun Checkerboard(modifier: Modifier = Modifier) {
    Canvas(modifier.clipToBounds()) {
        val cell = 10.dp.toPx()
        drawRect(CheckerLight)
        var row = 0
        var y = 0f
        while (y < size.height) {
            var col = row % 2
            var x = col * cell
            while (x < size.width) {
                drawRect(CheckerDark, Offset(x, y), Size(cell, cell))
                col += 2
                x = col * cell
            }
            y += cell
            row++
        }
    }
}
