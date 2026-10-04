package com.bissbilanz.android.util

import com.google.zxing.BinaryBitmap
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class QrCodeTest {
    private fun decode(matrix: QrMatrix): String {
        val scale = 4
        val quiet = 4
        val side = (matrix.size + 2 * quiet) * scale
        val pixels =
            IntArray(side * side) { index ->
                val x = index % side / scale - quiet
                val y = index / side / scale - quiet
                val dark = x in 0 until matrix.size && y in 0 until matrix.size && matrix[x, y]
                if (dark) 0xFF000000.toInt() else 0xFFFFFFFF.toInt()
            }
        val bitmap = BinaryBitmap(HybridBinarizer(RGBLuminanceSource(side, side, pixels)))
        return QRCodeReader().decode(bitmap).text
    }

    @Test
    fun theMatrixIsSquareAndNonTrivial() {
        val matrix = encodeQr("https://example.com")

        assertTrue(matrix.size >= 21)
        assertTrue((0 until matrix.size).any { x -> matrix[x, 0] })
    }

    @Test
    fun theInstallLinkSurvivesARoundTripThroughAScanner() {
        val link = AssistantLinks.claudeInstallLink("https://app.example.com", directoryListingUrl = null)

        assertEquals(link, decode(encodeQr(link)))
    }
}
