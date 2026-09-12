package com.bissbilanz.android.util

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

fun Context.hasPermission(permission: String): Boolean =
    ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

/**
 * True when a permission request just came back denied and the system will no
 * longer show the dialog (the user picked "don't ask again", or Android
 * auto-denied after repeated refusals). Only meaningful right after a denial:
 * before the first request the rationale flag is false as well.
 */
fun Activity?.isPermanentlyDenied(permission: String): Boolean =
    this != null && !ActivityCompat.shouldShowRequestPermissionRationale(this, permission)

fun Context.openAppSettings() {
    val intent =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    startActivity(intent)
}
