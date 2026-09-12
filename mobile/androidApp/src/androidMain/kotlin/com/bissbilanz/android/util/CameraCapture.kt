package com.bissbilanz.android.util

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.pm.PackageManager
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.content.ContextCompat
import com.bissbilanz.android.R

/** Hands a capture URI to the camera app; see [rememberCameraCaptureLauncher]. */
class CameraCaptureLauncher internal constructor(
    private val launchInternal: (Uri) -> Unit,
) {
    fun launch(uri: Uri) = launchInternal(uri)
}

/**
 * `ActivityResultContracts.TakePicture` that asks for the camera permission
 * first. The manifest declares `CAMERA` (the barcode scanner needs it), and
 * once an app declares it Android refuses to hand the IMAGE_CAPTURE intent to
 * the camera app while it is not granted — a `SecurityException` at launch
 * rather than a cancelled result, which crashed every photo button on a
 * device where the user had denied or revoked camera access (Sentry
 * BISSBILANZ-3A). A denied request or a missing camera app reports
 * `onResult(false)`, the same as the user backing out of the camera.
 */
@Composable
fun rememberCameraCaptureLauncher(onResult: (Boolean) -> Unit): CameraCaptureLauncher {
    val context = LocalContext.current
    val currentOnResult by rememberUpdatedState(onResult)
    var pendingUri by remember { mutableStateOf<Uri?>(null) }
    val permissionRequired = stringResource(R.string.scan_barcode_permission_required)

    val takePicture =
        rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
            currentOnResult(success)
        }

    fun capture(uri: Uri) {
        try {
            takePicture.launch(uri)
        } catch (_: ActivityNotFoundException) {
            currentOnResult(false)
        }
    }

    val requestPermission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val uri = pendingUri
            pendingUri = null
            if (granted && uri != null) {
                capture(uri)
            } else {
                Toast.makeText(context, permissionRequired, Toast.LENGTH_SHORT).show()
                currentOnResult(false)
            }
        }

    return remember(takePicture, requestPermission) {
        CameraCaptureLauncher { uri ->
            val granted =
                ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                    PackageManager.PERMISSION_GRANTED
            if (granted) {
                capture(uri)
            } else {
                pendingUri = uri
                requestPermission.launch(Manifest.permission.CAMERA)
            }
        }
    }
}
