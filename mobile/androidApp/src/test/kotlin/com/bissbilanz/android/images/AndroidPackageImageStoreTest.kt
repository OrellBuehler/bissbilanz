package com.bissbilanz.android.images

import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.util.Base64
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.ByteArrayOutputStream
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [31], application = AndroidPackageImageStoreTest.TestApp::class)
class AndroidPackageImageStoreTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun `thumbnail of a transparent png is flattened onto white, not black`() =
        runTest {
            val png =
                ByteArrayOutputStream()
                    .also { Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.PNG, 100, it) }
                    .toByteArray()

            val dataUrl = assertNotNull(AndroidPackageImageStore(context).thumbnail(png))

            assertTrue(dataUrl.startsWith("data:image/jpeg;base64,"))
            val jpeg = Base64.decode(dataUrl.substringAfter("base64,"), Base64.DEFAULT)
            val pixel = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size).getPixel(16, 16)
            assertTrue(Color.red(pixel) > 240 && Color.green(pixel) > 240 && Color.blue(pixel) > 240)
        }
}
