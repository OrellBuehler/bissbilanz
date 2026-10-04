package com.bissbilanz.android.util

import android.app.Application
import android.graphics.Bitmap
import android.graphics.Color
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [31], application = SubjectCutoutTest.TestApp::class)
class SubjectCutoutTest {
    class TestApp : Application()

    private fun transparentBitmap(
        width: Int,
        height: Int,
    ): Bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

    @Test
    fun `placement centres the subject with a margin on its longest side`() {
        val placement = squarePlacement(contentWidth = 100, contentHeight = 50, marginFraction = 0.1f)

        assertEquals(120, placement.side)
        assertEquals(10, placement.left)
        assertEquals(35, placement.top)
    }

    @Test
    fun `placement of a tall subject centres horizontally`() {
        val placement = squarePlacement(contentWidth = 40, contentHeight = 100, marginFraction = 0f)

        assertEquals(100, placement.side)
        assertEquals(30, placement.left)
        assertEquals(0, placement.top)
    }

    @Test
    fun `opaque bounds ignore transparent pixels`() {
        val width = 6
        val height = 5
        val pixels = IntArray(width * height)
        pixels[1 * width + 2] = Color.RED
        pixels[3 * width + 4] = Color.BLUE

        val bounds = assertNotNull(opaqueBounds(pixels, width, height))

        assertEquals(PixelBounds(left = 2, top = 1, right = 5, bottom = 4), bounds)
    }

    @Test
    fun `opaque bounds are null for a fully transparent image`() {
        assertNull(opaqueBounds(IntArray(12), 4, 3))
    }

    @Test
    fun `paddedToSquare crops to the subject and centres it on a transparent square`() {
        val source = transparentBitmap(40, 30)
        for (x in 10 until 30) for (y in 10 until 20) source.setPixel(x, y, Color.RED)

        val square = assertNotNull(source.paddedToSquare(marginFraction = 0.1f))

        assertEquals(24, square.width)
        assertEquals(24, square.height)
        assertEquals(Color.TRANSPARENT, square.getPixel(0, 0))
        assertEquals(Color.RED, square.getPixel(12, 12))
        assertEquals(Color.TRANSPARENT, square.getPixel(12, 3))
        assertEquals(Color.RED, square.getPixel(2, 7))
        assertEquals(Color.TRANSPARENT, square.getPixel(1, 7))
    }

    @Test
    fun `paddedToSquare is null when nothing is visible`() {
        assertNull(transparentBitmap(10, 10).paddedToSquare())
    }

    @Test
    fun `upload bytes are a png when the background was removed`() {
        val bitmap = transparentBitmap(20, 10)

        val encoded = bitmap.toUploadBytes(maxDimension = 10, quality = 85, transparent = true)

        assertEquals(ImageFormat.Png, encoded.format)
        assertEquals("image/png", encoded.format.mimeType)
        assertEquals("png", encoded.format.extension)
        assertEquals(0x89.toByte(), encoded.bytes[0])
        assertEquals('P'.code.toByte(), encoded.bytes[1])
    }

    @Test
    fun `upload bytes stay jpeg for an ordinary photo even though the bitmap reports alpha`() {
        val bitmap = transparentBitmap(20, 10)
        assertTrue(bitmap.hasAlpha())

        val encoded = bitmap.toUploadBytes(maxDimension = 10, quality = 85, transparent = false)

        assertEquals(ImageFormat.Jpeg, encoded.format)
        assertEquals("image/jpeg", encoded.format.mimeType)
        assertEquals("jpg", encoded.format.extension)
        assertEquals(0xFF.toByte(), encoded.bytes[0])
        assertEquals(0xD8.toByte(), encoded.bytes[1])
    }

    @Test
    fun `png bytes cap the longest side`() {
        val bytes = transparentBitmap(400, 200).toPngBytes(maxDimension = 100)

        val decoded = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        assertEquals(100, decoded.width)
        assertEquals(50, decoded.height)
    }
}
