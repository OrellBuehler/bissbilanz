package com.bissbilanz.android.images

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.android.util.ImageFormat
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.mode.AppModeManager
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = FoodImageUploaderTest.TestApp::class)
class FoodImageUploaderTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private val api = mockk<BissbilanzApi>()
    private val appMode = mockk<AppModeManager>()
    private val bytes = byteArrayOf(1, 2, 3)

    private fun uploader(local: Boolean): FoodImageUploader {
        every { appMode.isLocal } returns local
        return FoodImageUploader(context, api, appMode)
    }

    @Test
    fun `uploads a png with its filename and content type and seeds the cache with the same bytes`() =
        runTest {
            coEvery { api.uploadImage(any(), any(), any(), any()) } returns "/uploads/aaaa-1111.webp"

            val url = uploader(local = false).store(bytes, format = ImageFormat.Png)

            assertEquals("/uploads/aaaa-1111.webp", url)
            coVerify { api.uploadImage("food.png", bytes, "image/png", null) }
            assertContentEquals(bytes, File(LocalImageStore.directory(context), "aaaa-1111.webp").readBytes())
        }

    @Test
    fun `uploads a jpeg by default`() =
        runTest {
            coEvery { api.uploadImage(any(), any(), any(), any()) } returns "/uploads/bbbb-2222.webp"

            uploader(local = false).store(bytes, purpose = "recipe_step")

            coVerify { api.uploadImage("food.jpg", bytes, "image/jpeg", "recipe_step") }
        }

    @Test
    fun `local mode writes a png under a png file name`() =
        runTest {
            val url = uploader(local = true).store(bytes, format = ImageFormat.Png)

            assertTrue(url.startsWith("file://"))
            assertTrue(url.endsWith(".png"))
            val file = LocalImageStore.fileFor(context, url)!!
            assertTrue(file.name.startsWith("local-"))
            assertContentEquals(bytes, file.readBytes())
        }

    @Test
    fun `local mode writes a jpeg under a jpg file name by default`() =
        runTest {
            val url = uploader(local = true).store(bytes)

            assertTrue(url.endsWith(".jpg"))
        }
}
