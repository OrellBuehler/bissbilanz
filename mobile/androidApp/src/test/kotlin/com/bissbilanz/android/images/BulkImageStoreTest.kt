package com.bissbilanz.android.images

import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [31], application = BulkImageStoreTest.TestApp::class)
class BulkImageStoreTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private val store get() = AndroidPackageImageStore(context)

    /** A lossy webp header of a 400 x 400 image: all the importer needs to trust the file. */
    private val webp400 =
        "RIFF".encodeToByteArray() + byteArrayOf(0x20, 0, 0, 0) + "WEBPVP8 ".encodeToByteArray() +
            byteArrayOf(0x10, 0, 0, 0, 0, 0, 0, 0x9D.toByte(), 0x01, 0x2A, 0x90.toByte(), 0x01, 0x90.toByte(), 0x01)

    private fun png(
        width: Int,
        height: Int,
    ) = ByteArrayOutputStream()
        .also { Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.PNG, 100, it) }
        .toByteArray()

    @Test
    fun keepsASmallWebpAsItIsInAShardedFolder() =
        runTest {
            val url = assertNotNull(store.saveImportedBulk(webp400))

            val file = assertNotNull(LocalImageStore.fileFor(context, url))
            assertContentEquals(webp400, file.readBytes())
            assertEquals(LocalImageStore.directory(context).canonicalFile, file.parentFile!!.parentFile)
            assertEquals(2, file.parentFile!!.name.length)
            assertTrue(file.name.startsWith(file.parentFile!!.name))
            assertTrue(file.name.endsWith(".webp"))
        }

    @Test
    fun spreadsManyPhotosOverShardsWithoutCollisions() =
        runTest {
            val urls = (1..40).map { assertNotNull(store.saveImportedBulk(webp400)) }

            assertEquals(40, urls.toSet().size)
            assertTrue(urls.all { LocalImageStore.fileFor(context, it)?.isFile == true })
        }

    @Test
    fun otherImagesGoThroughTheUsualChecks() =
        runTest {
            assertNotNull(store.saveImportedBulk(png(64, 64)))
            assertNull(store.saveImportedBulk(byteArrayOf(1, 2, 3)))
            // A webp-looking file that is not an image: the header is not enough once it is not a small webp.
            assertNull(store.saveImportedBulk("RIFF".encodeToByteArray() + byteArrayOf(0x20, 0, 0, 0) + "WEBPVP8 junk".encodeToByteArray()))
        }

    @Test
    fun readsAPhotoForUploadAsItIsWhenItFits() =
        runTest {
            val url = assertNotNull(store.saveImportedBulk(webp400))

            assertContentEquals(webp400, store.readForUpload(url, 200 * 1024))
        }

    @Test
    fun shrinksAPhotoThatIsTooBigForTheBulkEndpoint() =
        runTest {
            val big = png(900, 900)
            val url = assertNotNull(store.saveImportedBulk(big))

            val bytes = assertNotNull(store.readForUpload(url, big.size / 2))

            assertTrue(bytes.size <= big.size / 2)
            val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            assertTrue(decoded.width <= 450)
        }

    @Test
    fun hasNothingToReadForAUrlOutsideTheStore() =
        runTest {
            assertNull(store.readForUpload("file:///etc/passwd", 1024))
            assertNull(store.readForUpload("/uploads/aaaaaaaa-1111.webp", 1024))
        }

    @Test
    fun anUploadedPhotoBecomesTheCacheEntryOfTheHostedOne() =
        runTest {
            val url = assertNotNull(store.saveImportedBulk(webp400))
            val local = assertNotNull(LocalImageStore.fileFor(context, url))

            store.adoptUploaded(url, "/uploads/abcdef01-0000.webp")

            assertFalse(local.exists())
            val cached = assertNotNull(LocalImageStore.cachedFile(context, "/uploads/abcdef01-0000.webp"))
            assertContentEquals(webp400, cached.readBytes())
        }

    @Test
    fun anUploadedPhotoWithoutAHostedCopyIsDropped() =
        runTest {
            val url = assertNotNull(store.saveImportedBulk(webp400))
            val local = assertNotNull(LocalImageStore.fileFor(context, url))

            store.adoptUploaded(url, "https://example.com/not-ours.webp")

            assertFalse(local.exists())
        }

    @Test
    fun clearingTheStoreAlsoRemovesTheShards() =
        runTest {
            val url = assertNotNull(store.saveImportedBulk(webp400))
            val file = assertNotNull(LocalImageStore.fileFor(context, url))

            LocalImageStore.clear(context)

            assertFalse(file.exists())
            assertFalse(file.parentFile!!.exists())
        }

    @Test
    fun theSweeperReachesIntoShards() =
        runTest {
            val url = assertNotNull(store.saveImportedBulk(webp400))
            val kept = assertNotNull(store.saveImportedBulk(webp400))
            val old = System.currentTimeMillis() - 3 * 24 * 60 * 60 * 1000L
            listOf(url, kept).forEach { assertNotNull(LocalImageStore.fileFor(context, it)).setLastModified(old) }

            sweepUnreferenced(context, referenced = setOf(kept))

            assertFalse(File(requireNotNull(LocalImageStore.fileFor(context, url)).path).exists())
            assertTrue(requireNotNull(LocalImageStore.fileFor(context, kept)).exists())
        }
}
