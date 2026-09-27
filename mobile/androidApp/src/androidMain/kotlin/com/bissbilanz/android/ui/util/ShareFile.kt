package com.bissbilanz.android.ui.util

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

/**
 * Hand a file from the app cache to the system share sheet (messengers, mail,
 * Files). The FileProvider in AndroidManifest.xml grants the receiving app read
 * access for this one share only.
 */
fun shareFile(
    context: Context,
    file: File,
    mimeType: String,
) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent =
        Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    context.startActivity(Intent.createChooser(intent, null))
}
