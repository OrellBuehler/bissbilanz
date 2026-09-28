package com.bissbilanz.android.ui.util

import android.content.ClipData
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import com.bissbilanz.android.MainActivity
import java.io.File

/**
 * Hand a file from the app cache to the system share sheet (messengers, mail,
 * Files). The FileProvider in AndroidManifest.xml grants the receiving app read
 * access for this one share only.
 *
 * The receiver sees the file's own name (a share of a document keeps it), which is why a
 * food package is written to the cache under its final `.bissbilanz` name first. With
 * [excludeOwnApp], Bissbilanz itself is left out of the list of apps to share to.
 */
fun shareFile(
    context: Context,
    file: File,
    mimeType: String,
    excludeOwnApp: Boolean = false,
) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent =
        Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            // Apps that read the shared item from the clip (rather than EXTRA_STREAM) get the grant too.
            clipData = ClipData.newRawUri(file.name, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    val chooser =
        Intent.createChooser(intent, null).apply {
            if (excludeOwnApp) {
                putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, arrayOf(ComponentName(context, MainActivity::class.java)))
            }
        }
    context.startActivity(chooser)
}
