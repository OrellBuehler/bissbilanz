package com.bissbilanz.android.navigation

import android.app.Application
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.foodpackage.BULK_MAX_BYTES
import com.bissbilanz.foodpackage.MAX_PACKAGE_BYTES
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.io.FileNotFoundException
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** A sender's provider: reports a display name and size, and hands out a file. */
class SharedFileProvider : ContentProvider() {
    override fun onCreate() = true

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor {
        val cursor = MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE))
        if (uri.lastPathSegment != "nameless") cursor.addRow(arrayOf<Any?>(name, size ?: file?.length()))
        return cursor
    }

    override fun openFile(
        uri: Uri,
        mode: String,
    ): ParcelFileDescriptor {
        val source = file ?: throw FileNotFoundException("gone")
        return ParcelFileDescriptor.open(source, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun getType(uri: Uri): String? = null

    override fun insert(
        uri: Uri,
        values: ContentValues?,
    ): Uri? = null

    override fun delete(
        uri: Uri,
        selection: String?,
        selectionArgs: Array<out String>?,
    ) = 0

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ) = 0

    companion object {
        var name: String? = "Käsespätzle.bissbilanz"
        var size: Long? = null
        var file: File? = null
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = IncomingPackageFilesTest.TestApp::class)
class IncomingPackageFilesTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private val uri = Uri.parse("content://shared.test/item/1")

    @Before
    fun setUp() {
        Robolectric.setupContentProvider(SharedFileProvider::class.java, "shared.test")
        SharedFileProvider.name = "Käsespätzle.bissbilanz"
        SharedFileProvider.size = null
        SharedFileProvider.file = File.createTempFile("shared", ".bin").apply { writeBytes(byteArrayOf(1, 2, 3, 4)) }
    }

    @After
    fun tearDown() {
        SharedFileProvider.file?.delete()
    }

    @Test
    fun copiesTheStreamIntoTheCacheUnderTheSendersName() {
        val request = IncomingPackageFiles.copyToCache(context, uri)

        assertEquals("Käsespätzle.bissbilanz", request.fileName)
        assertNull(request.problem)
        val copy = File(assertNotNull(request.path))
        assertTrue(copy.absolutePath.startsWith(context.cacheDir.absolutePath))
        assertEquals(listOf<Byte>(1, 2, 3, 4), copy.readBytes().toList())
    }

    @Test
    fun theCopyOutlivesTheSendersFile() {
        val request = IncomingPackageFiles.copyToCache(context, uri)
        SharedFileProvider.file!!.delete()

        assertTrue(File(assertNotNull(request.path)).isFile)
        IncomingPackageFiles.delete(request.path)
        assertEquals(false, File(request.path!!).exists())
    }

    @Test
    fun fallsBackToTheLastPathSegmentWhenThereIsNoDisplayName() {
        val nameless = Uri.parse("content://shared.test/item/nameless")
        assertEquals("nameless", IncomingPackageFiles.displayName(context, nameless))
    }

    @Test
    fun copiesAFileBeyondTheNormalLimitForTheBulkImport() {
        SharedFileProvider.size = MAX_PACKAGE_BYTES + 1

        val request = IncomingPackageFiles.copyToCache(context, uri)

        assertNull(request.problem)
        assertNotNull(request.path)
    }

    @Test
    fun checksThereIsRoomForTheCopyAndTheStoredPhotos() {
        val dir = context.cacheDir

        assertTrue(IncomingPackageFiles.hasRoomFor(dir, 0))
        assertTrue(IncomingPackageFiles.hasRoomFor(dir, 10))
        assertEquals(false, IncomingPackageFiles.hasRoomFor(dir, Long.MAX_VALUE / 4))
    }

    @Test
    fun refusesAFileDeclaredTooLargeWithoutCopyingIt() {
        SharedFileProvider.size = BULK_MAX_BYTES + 1

        val request = IncomingPackageFiles.copyToCache(context, uri)

        assertEquals(PendingPackageImport.Problem.TOO_LARGE, request.problem)
        assertNull(request.path)
    }

    @Test
    fun reportsAStreamThatCannotBeOpened() {
        SharedFileProvider.file = null

        val request = IncomingPackageFiles.copyToCache(context, uri)

        assertEquals(PendingPackageImport.Problem.UNREADABLE, request.problem)
        assertNull(request.path)
        // The name is still known, so the message can say which file it was.
        assertEquals("Käsespätzle.bissbilanz", request.fileName)
    }
}
