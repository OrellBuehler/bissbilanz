package com.bissbilanz.android.images

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import kotlin.test.assertTrue

/**
 * Local mode's stand-in for the server's orphan cleanup: a photo whose row is gone
 * has to be deleted, and one attached moments ago — its form not saved yet — must
 * survive the sweep.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = LocalImageSweeperTest.TestApp::class)
class LocalImageSweeperTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private val now = 1_800_000_000_000L
    private val dayMs = 24 * 60 * 60 * 1000L

    private fun photo(
        name: String,
        ageMs: Long,
    ): File = LocalImageStore.write(context, name, byteArrayOf(1)).also { it.setLastModified(now - ageMs) }

    @Test
    fun `deletes an old photo nothing references`() =
        runTest {
            val orphan = photo("local-orphan.jpg", ageMs = 2 * dayMs)

            sweepUnreferenced(context, referenced = emptySet(), now = now)

            assertTrue(!orphan.exists())
        }

    @Test
    fun `keeps a photo a food or recipe still points at`() =
        runTest {
            val local = photo("local-kept.jpg", ageMs = 2 * dayMs)
            val upload = photo("aaaaaaaa-1111.webp", ageMs = 2 * dayMs)

            sweepUnreferenced(
                context,
                referenced = setOf(LocalImageStore.fileUri(local), "/uploads/aaaaaaaa-1111.webp"),
                now = now,
            )

            assertTrue(local.exists())
            assertTrue(upload.exists())
        }

    @Test
    fun `keeps a just-attached photo inside the grace period`() =
        runTest {
            val fresh = photo("local-fresh.jpg", ageMs = dayMs / 2)

            sweepUnreferenced(context, referenced = emptySet(), now = now)

            assertTrue(fresh.exists())
        }
}
