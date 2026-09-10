package com.bissbilanz.android.aitasks

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The disk-backed queue behind AiTasksScreen's Retry/Discard: enqueue must keep
 * photos on disk (not cacheDir, so the OS can't purge them), a failed upload must
 * survive until the user acts on it, and the whole thing must round-trip through
 * a fresh instance the way it would across an app relaunch.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = AiTaskUploadQueueTest.TestApp::class)
class AiTaskUploadQueueTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun newQueue() = AiTaskUploadQueue(context)

    @Test
    fun `enqueue writes the photos to filesDir and records their paths`() {
        val queue = newQueue()

        val item = queue.enqueue("2026-09-10", "porridge", "Breakfast", null, listOf(byteArrayOf(1, 2, 3)))

        assertEquals(1, item.photoPaths.size)
        val photo = java.io.File(item.photoPaths.single())
        assertTrue(photo.exists())
        assertTrue(photo.path.contains(context.filesDir.path), "photo must live under filesDir, not cacheDir")
        assertEquals(listOf<Byte>(1, 2, 3), photo.readBytes().toList())
    }

    @Test
    fun `enqueue starts an item as pending with a fresh idempotency key`() {
        val queue = newQueue()

        val a = queue.enqueue("2026-09-10", "a", null, null, emptyList())
        val b = queue.enqueue("2026-09-10", "b", null, null, emptyList())

        assertEquals(AiTaskUploadStatus.PENDING, a.status)
        assertEquals(0, a.attempts)
        assertNull(a.lastError)
        assertTrue(a.retryable)
        assertTrue(a.idempotencyKey.isNotBlank())
        assertTrue(a.idempotencyKey != b.idempotencyKey)
    }

    @Test
    fun `markUploading flips status and counts the attempt`() {
        val queue = newQueue()
        val item = queue.enqueue("2026-09-10", "porridge", null, null, emptyList())

        queue.markUploading(item.id)

        val updated = checkNotNull(queue.get(item.id))
        assertEquals(AiTaskUploadStatus.UPLOADING, updated.status)
        assertEquals(1, updated.attempts)
    }

    @Test
    fun `markFailed keeps the item and its photos instead of deleting them`() {
        val queue = newQueue()
        val item = queue.enqueue("2026-09-10", "porridge", null, null, listOf(byteArrayOf(9)))

        queue.markFailed(item.id, "HTTP 400", retryable = false)

        val updated = checkNotNull(queue.get(item.id))
        assertEquals(AiTaskUploadStatus.FAILED, updated.status)
        assertEquals("HTTP 400", updated.lastError)
        assertFalse(updated.retryable)
        assertTrue(java.io.File(item.photoPaths.single()).exists(), "a failed upload's photo must not be deleted")
    }

    @Test
    fun `retry resets status, error and attempt count`() {
        val queue = newQueue()
        val item = queue.enqueue("2026-09-10", "porridge", null, null, emptyList())
        queue.markUploading(item.id)
        queue.markFailed(item.id, "network error", retryable = false)

        queue.retry(item.id)

        val updated = checkNotNull(queue.get(item.id))
        assertEquals(AiTaskUploadStatus.PENDING, updated.status)
        assertNull(updated.lastError)
        assertTrue(updated.retryable)
        assertEquals(0, updated.attempts)
    }

    @Test
    fun `remove deletes the photos and drops the item`() {
        val queue = newQueue()
        val item = queue.enqueue("2026-09-10", "porridge", null, null, listOf(byteArrayOf(1)))
        val photo = java.io.File(item.photoPaths.single())
        assertTrue(photo.exists())

        queue.remove(item.id)

        assertNull(queue.get(item.id))
        assertFalse(photo.exists())
    }

    @Test
    fun `remove is a no-op for an id that is already gone`() {
        val queue = newQueue()

        queue.remove("does-not-exist")

        assertTrue(queue.items.value.isEmpty())
    }

    @Test
    fun `items reflects insertion order, oldest first`() {
        val queue = newQueue()
        val first = queue.enqueue("2026-09-10", "first", null, null, emptyList())
        val second = queue.enqueue("2026-09-10", "second", null, null, emptyList())

        assertEquals(listOf(first.id, second.id), queue.items.value.map { it.id })
    }

    @Test
    fun `a second instance sees what an earlier one persisted, across a simulated relaunch`() {
        val first = newQueue()
        val item = first.enqueue("2026-09-10", "porridge", "Breakfast", "2026-09-10T08:00:00+02:00", listOf(byteArrayOf(5, 6)))
        first.markFailed(item.id, "boom", retryable = true)

        val second = newQueue()

        val restored = second.get(item.id)
        assertEquals(item.copy(status = AiTaskUploadStatus.FAILED, lastError = "boom", retryable = true), restored)
    }

    @Test
    fun `a corrupt index file is treated as an empty queue rather than crashing`() {
        val queue = newQueue()
        queue.enqueue("2026-09-10", "porridge", null, null, emptyList())
        val indexFile = java.io.File(java.io.File(context.filesDir, "ai_task_uploads"), "queue.json")
        indexFile.writeText("not json")

        val reloaded = newQueue()

        assertTrue(reloaded.items.value.isEmpty())
    }
}
