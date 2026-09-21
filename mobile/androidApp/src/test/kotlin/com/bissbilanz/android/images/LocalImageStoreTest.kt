package com.bissbilanz.android.images

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * A stored `imageUrl` is data, not a path the app may follow anywhere: a row that
 * came back from a server (or survived an import) must never be able to point the
 * image loaders at a file outside the store.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = LocalImageStoreTest.TestApp::class)
class LocalImageStoreTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun `resolves a cached upload inside the store`() {
        val file = LocalImageStore.write(context, "aaaaaaaa-1111.webp", byteArrayOf(1))

        val resolved = LocalImageStore.fileFor(context, "/uploads/aaaaaaaa-1111.webp")

        assertEquals(file.canonicalFile, resolved)
    }

    @Test
    fun `resolves a locally attached photo by its file URI`() {
        val file = LocalImageStore.write(context, "local-1.jpg", byteArrayOf(1))

        val resolved = LocalImageStore.fileFor(context, LocalImageStore.fileUri(file))

        assertEquals(file.canonicalFile, resolved)
    }

    @Test
    fun `refuses a file URI that escapes the store`() {
        val outside = File(context.filesDir, "secret.txt").also { it.writeText("private") }

        assertNull(LocalImageStore.fileFor(context, "file://${outside.absolutePath}"))
        assertNull(LocalImageStore.fileFor(context, "file://${LocalImageStore.directory(context)}/../secret.txt"))
        assertTrue(outside.exists())
    }

    @Test
    fun `refuses an upload path that is not a plain uuid filename`() {
        assertNull(LocalImageStore.fileFor(context, "/uploads/../../secret.txt"))
        assertNull(LocalImageStore.fileFor(context, "/uploads/evil.sh"))
        assertNull(LocalImageStore.fileFor(context, "https://images.openfoodfacts.org/x.jpg"))
        assertNull(LocalImageStore.fileFor(context, null))
    }

    @Test
    fun `evict removes only the referenced file`() {
        val kept = LocalImageStore.write(context, "bbbbbbbb-2222.webp", byteArrayOf(1))
        val dropped = LocalImageStore.write(context, "cccccccc-3333.webp", byteArrayOf(1))

        LocalImageStore.evict(context, "/uploads/cccccccc-3333.webp")

        assertTrue(kept.exists())
        assertTrue(!dropped.exists())
    }
}
