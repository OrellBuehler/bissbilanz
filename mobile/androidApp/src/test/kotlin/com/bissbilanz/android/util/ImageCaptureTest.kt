package com.bissbilanz.android.util

import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Native graphics, because the default shadow `BitmapFactory` hands back a bitmap even for
 * `inJustDecodeBounds` — which real Android never does — and so hid that the bounds pass
 * made every decode fail.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [31], application = ImageCaptureTest.TestApp::class)
class ImageCaptureTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun jpegFile(
        width: Int,
        height: Int,
        orientation: Int? = null,
    ): Uri {
        val file = File.createTempFile("capture", ".jpg", context.cacheDir)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 80, it) }
        if (orientation != null) {
            ExifInterface(file.absolutePath).apply {
                setAttribute(ExifInterface.TAG_ORIENTATION, orientation.toString())
                saveAttributes()
            }
        }
        return Uri.fromFile(file)
    }

    @Test
    fun `decodes a camera photo instead of failing the bounds pass`() {
        val bitmap = decodeUprightBitmap(context, jpegFile(400, 300))

        assertNotNull(bitmap)
        assertEquals(400, bitmap.width)
        assertEquals(300, bitmap.height)
    }

    @Test
    fun `downscales a photo larger than the cap`() {
        val bitmap = decodeUprightBitmap(context, jpegFile(5000, 3000))

        assertNotNull(bitmap)
        assertEquals(1250, bitmap.width)
        assertEquals(750, bitmap.height)
    }

    @Test
    fun `applies the exif rotation`() {
        val bitmap = decodeUprightBitmap(context, jpegFile(400, 300, ExifInterface.ORIENTATION_ROTATE_90))

        assertNotNull(bitmap)
        assertEquals(300, bitmap.width)
        assertEquals(400, bitmap.height)
    }

    @Test
    fun `an empty capture file is not a photo`() {
        val file = File.createTempFile("capture", ".jpg", context.cacheDir)

        assertNull(decodeUprightBitmap(context, Uri.fromFile(file)))
    }

    @Test
    fun `requireUprightBitmap explains an empty capture file`() {
        val file = File.createTempFile("capture", ".jpg", context.cacheDir)

        val failure = assertFailsWith<ImageDecodeException> { requireUprightBitmap(context, Uri.fromFile(file)) }

        assertTrue("0 bytes" in failure.message.orEmpty())
    }

    @Test
    fun `a missing capture file surfaces as an image decode failure, not an IOException`() {
        val missing = Uri.fromFile(File(context.cacheDir, "never-written.jpg"))

        val failure = assertFailsWith<ImageDecodeException> { requireUprightBitmap(context, missing) }

        assertTrue("FileNotFoundException" in failure.message.orEmpty())
        assertNull(failure.cause)
    }
}
