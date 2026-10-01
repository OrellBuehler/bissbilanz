package com.bissbilanz.android.ui.components

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.ExperimentalGetImage
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.screens.CameraPreview
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.android.util.isPermanentlyDenied
import com.bissbilanz.android.util.openAppSettings
import org.koin.compose.koinInject

/**
 * Scan-only counterpart of `BarcodeScannerScreen`: hands the first detected
 * code to [onScanned] with no lookup or navigation. The food form uses it to
 * fill its barcode field.
 */
@OptIn(ExperimentalMaterial3Api::class)
@androidx.annotation.OptIn(ExperimentalGetImage::class)
@Composable
fun BarcodeCaptureDialog(
    onDismiss: () -> Unit,
    onScanned: (String) -> Unit,
) {
    val context = LocalContext.current
    val activity = LocalActivity.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val errorReporter: ErrorReporter = koinInject()
    val haptic = rememberHaptic()
    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED,
        )
    }
    var permanentlyDenied by remember { mutableStateOf(false) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var cameraError by remember { mutableStateOf(false) }
    var torchOn by remember { mutableStateOf(false) }
    var delivered by remember { mutableStateOf(false) }
    val hasFlash = camera?.cameraInfo?.hasFlashUnit() == true

    LaunchedEffect(camera, torchOn) {
        camera?.cameraControl?.enableTorch(torchOn)
    }

    val permissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            hasPermission = granted
            if (!granted) permanentlyDenied = activity.isPermanentlyDenied(Manifest.permission.CAMERA)
        }

    LaunchedEffect(Unit) {
        if (!hasPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(stringResource(R.string.scan_barcode_title)) },
                    navigationIcon = {
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Close, stringResource(R.string.scan_barcode_close))
                        }
                    },
                    actions = {
                        if (hasFlash) {
                            IconButton(onClick = { torchOn = !torchOn }) {
                                Icon(
                                    if (torchOn) Icons.Default.FlashOn else Icons.Default.FlashOff,
                                    contentDescription =
                                        stringResource(
                                            if (torchOn) R.string.scan_barcode_flash_off else R.string.scan_barcode_flash_on,
                                        ),
                                )
                            }
                        }
                    },
                    colors =
                        TopAppBarDefaults.topAppBarColors(
                            containerColor = Color.Black.copy(alpha = 0.6f),
                            titleContentColor = Color.White,
                            navigationIconContentColor = Color.White,
                            actionIconContentColor = Color.White,
                        ),
                )
            },
        ) { padding ->
            Box(modifier = Modifier.fillMaxSize()) {
                if (hasPermission && !cameraError) {
                    CameraPreview(
                        lifecycleOwner = lifecycleOwner,
                        isScanning = { !delivered },
                        onCameraReady = { camera = it },
                        onCameraError = { e ->
                            errorReporter.captureException(e)
                            cameraError = true
                        },
                        onScanFailure = { e -> errorReporter.captureException(e) },
                        onScannerUnavailable = { e -> errorReporter.captureException(e) },
                        onBarcodeScanned = { barcode ->
                            if (!delivered) {
                                delivered = true
                                haptic(HapticFeedbackType.LongPress)
                                onScanned(barcode)
                                onDismiss()
                            }
                        },
                    )
                    Text(
                        stringResource(R.string.scan_barcode_hint),
                        color = Color.White,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 80.dp),
                    )
                } else {
                    Box(
                        modifier = Modifier.fillMaxSize().padding(padding),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Text(
                                stringResource(
                                    if (cameraError) {
                                        R.string.scan_barcode_camera_error
                                    } else {
                                        R.string.scan_barcode_permission_required
                                    },
                                ),
                                style = MaterialTheme.typography.bodyLarge,
                                textAlign = TextAlign.Center,
                            )
                            if (!cameraError) {
                                Spacer(modifier = Modifier.height(16.dp))
                                if (permanentlyDenied) {
                                    Button(onClick = { context.openAppSettings() }) {
                                        Text(stringResource(R.string.scan_barcode_open_settings))
                                    }
                                } else {
                                    Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }) {
                                        Text(stringResource(R.string.scan_barcode_grant_permission))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
