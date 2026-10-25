package com.bissbilanz.android.ui.components

import android.Manifest
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.bissbilanz.android.util.hasPermission
import com.bissbilanz.android.util.isPermanentlyDenied

@Stable
class CameraPermissionState internal constructor(
    private val grantedState: State<Boolean>,
    private val permanentlyDeniedState: State<Boolean>,
    private val launch: () -> Unit,
) {
    val granted: Boolean get() = grantedState.value

    /** The system no longer shows the dialog; only the app's settings page can grant it. */
    val permanentlyDenied: Boolean get() = permanentlyDeniedState.value

    fun request() = launch()
}

/**
 * The camera permission, asked for once when first shown. Re-checked on every resume:
 * it can be granted (or revoked) in the system settings while the screen is in the
 * background, and the "Open settings" path depends on it.
 */
@Composable
fun rememberCameraPermission(): CameraPermissionState {
    val context = LocalContext.current
    val activity = LocalActivity.current
    val granted = remember { mutableStateOf(context.hasPermission(Manifest.permission.CAMERA)) }
    val permanentlyDenied = remember { mutableStateOf(false) }
    val launcher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { result ->
            granted.value = result
            // Once the system stops showing the dialog, re-requesting is a silent
            // no-op; the only way back in is the app's settings page.
            if (!result) permanentlyDenied.value = activity.isPermanentlyDenied(Manifest.permission.CAMERA)
        }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        granted.value = context.hasPermission(Manifest.permission.CAMERA)
        if (granted.value) permanentlyDenied.value = false
    }
    LaunchedEffect(Unit) {
        if (!granted.value) launcher.launch(Manifest.permission.CAMERA)
    }
    return remember(launcher) {
        CameraPermissionState(granted, permanentlyDenied) { launcher.launch(Manifest.permission.CAMERA) }
    }
}
