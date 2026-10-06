package com.bissbilanz.android.images

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class WebpHeaderTest {
    private fun riff(
        chunk: String,
        body: ByteArray,
    ) = "RIFF".encodeToByteArray() + byteArrayOf(0x20, 0, 0, 0) + "WEBP".encodeToByteArray() + chunk.encodeToByteArray() + body

    @Test
    fun readsALossyHeader() {
        val body = byteArrayOf(0x10, 0, 0, 0, 0, 0, 0, 0x9D.toByte(), 0x01, 0x2A, 0x90.toByte(), 0x01, 0x20, 0x01)

        assertEquals(400 to 288, webpDimensions(riff("VP8 ", body)))
    }

    @Test
    fun readsALosslessHeader() {
        // 400 x 300: width - 1 = 399, height - 1 = 299, packed into 14 bits each after the 0x2F signature.
        val bits = 399 or (299 shl 14)
        val body =
            byteArrayOf(
                0x10,
                0,
                0,
                0,
                0x2F,
                (bits and 0xFF).toByte(),
                ((bits shr 8) and 0xFF).toByte(),
                ((bits shr 16) and 0xFF).toByte(),
                ((bits shr 24) and 0xFF).toByte(),
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
            )

        assertEquals(400 to 300, webpDimensions(riff("VP8L", body)))
    }

    @Test
    fun readsAnExtendedHeader() {
        val width = 511
        val height = 99
        val body =
            byteArrayOf(
                0x0A,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                (width and 0xFF).toByte(),
                ((width shr 8) and 0xFF).toByte(),
                0,
                (height and 0xFF).toByte(),
                ((height shr 8) and 0xFF).toByte(),
                0,
            )

        assertEquals(512 to 100, webpDimensions(riff("VP8X", body)))
    }

    @Test
    fun isNullForAnythingElse() {
        assertNull(webpDimensions(ByteArray(10)))
        assertNull(webpDimensions(riff("ABCD", ByteArray(20))))
        assertNull(webpDimensions(riff("VP8 ", ByteArray(20))))
        assertNull(webpDimensions(riff("VP8L", ByteArray(20))))
    }
}
