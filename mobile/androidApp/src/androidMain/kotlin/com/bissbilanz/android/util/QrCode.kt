package com.bissbilanz.android.util

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

/** A square QR code as dark/light modules, without a quiet zone. */
class QrMatrix(
    val size: Int,
    private val modules: BooleanArray,
) {
    operator fun get(
        x: Int,
        y: Int,
    ): Boolean = modules[y * size + x]
}

fun encodeQr(content: String): QrMatrix {
    val hints =
        mapOf(
            EncodeHintType.MARGIN to 0,
            EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
            EncodeHintType.CHARACTER_SET to "UTF-8",
        )
    val bits = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, 0, 0, hints)
    val size = bits.width
    return QrMatrix(size, BooleanArray(size * size) { bits[it % size, it / size] })
}

/**
 * Always dark on white with a quiet zone, whatever the app theme: scanners expect that
 * contrast. [description] is what TalkBack reads for the otherwise unlabelled canvas.
 */
@Composable
fun QrCodeImage(
    content: String,
    description: String,
    modifier: Modifier = Modifier,
    size: Dp = 200.dp,
) {
    val matrix = remember(content) { encodeQr(content) }
    Canvas(
        modifier =
            modifier
                .size(size)
                .background(Color.White)
                .padding(8.dp)
                .semantics { contentDescription = description },
    ) {
        val module = this.size.width / matrix.size
        for (y in 0 until matrix.size) {
            for (x in 0 until matrix.size) {
                if (matrix[x, y]) {
                    drawRect(
                        color = Color.Black,
                        topLeft = Offset(x * module, y * module),
                        size = Size(module + 0.5f, module + 0.5f),
                    )
                }
            }
        }
    }
}
