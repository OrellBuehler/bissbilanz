package com.bissbilanz.android.navigation

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.android.MainActivity
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Tapping a `.bissbilanz` file in a messenger, the Files app or a mail client has to offer
 * Bissbilanz, whatever the sender reports: a content:// URI rarely carries the extension, and
 * the type is a generic zip or binary. These check the manifest's intent filters against the
 * shapes real senders produce.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = FoodPackageIntentFiltersTest.TestApp::class)
class FoodPackageIntentFiltersTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun opensInBissbilanz(intent: Intent): Boolean =
        context.packageManager
            .queryIntentActivities(intent, 0)
            .any { it.activityInfo.name == MainActivity::class.java.name }

    private fun view(
        uri: String,
        type: String?,
    ) = Intent(Intent.ACTION_VIEW).apply {
        if (type == null) data = Uri.parse(uri) else setDataAndType(Uri.parse(uri), type)
        addCategory(Intent.CATEGORY_DEFAULT)
    }

    private fun send(type: String) =
        Intent(Intent.ACTION_SEND).apply {
            this.type = type
            addCategory(Intent.CATEGORY_DEFAULT)
        }

    @Test
    fun aContentUriWithAGenericTypeOpensTheApp() {
        val uri = "content://com.whatsapp.provider.media/item/12345"
        assertTrue(opensInBissbilanz(view(uri, "application/zip")))
        assertTrue(opensInBissbilanz(view(uri, "application/x-zip-compressed")))
        assertTrue(opensInBissbilanz(view(uri, "application/octet-stream")))
        assertTrue(opensInBissbilanz(view(uri, "application/vnd.bissbilanz.food-package")))
    }

    @Test
    fun aFileKeepingItsExtensionOpensTheAppWhateverItsType() {
        assertTrue(opensInBissbilanz(view("content://media/external/file/Lasagne.bissbilanz", "*/*")))
        assertTrue(opensInBissbilanz(view("content://provider/downloads/Lasagne.bissbilanz", "text/plain")))
        assertTrue(opensInBissbilanz(view("content://provider/downloads/Lasagne.bissbilanz", null)))
        assertTrue(opensInBissbilanz(view("file:///storage/emulated/0/Download/Lasagne.bissbilanz", null)))
        // Extra dots in the name ("Käse.v2.final.bissbilanz") need their own path patterns.
        assertTrue(opensInBissbilanz(view("content://provider/downloads/Lasagne.v2.final.bissbilanz", null)))
    }

    @Test
    fun sharingAZipToTheAppOpensIt() {
        assertTrue(opensInBissbilanz(send("application/zip")))
        assertTrue(opensInBissbilanz(send("application/octet-stream")))
    }

    @Test
    fun unrelatedFilesDoNotOpenTheApp() {
        assertEquals(false, opensInBissbilanz(view("content://provider/downloads/photo.jpg", "image/jpeg")))
        assertEquals(false, opensInBissbilanz(view("content://provider/downloads/notes.txt", "text/plain")))
        assertEquals(false, opensInBissbilanz(send("text/plain")))
        assertEquals(false, opensInBissbilanz(send("image/png")))
    }
}
