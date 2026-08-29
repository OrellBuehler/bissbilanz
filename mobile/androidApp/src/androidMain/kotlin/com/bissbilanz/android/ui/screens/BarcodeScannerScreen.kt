package com.bissbilanz.android.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Size
import android.view.MotionEvent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.NavController
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.navigation.NAV_KEY_CREATE_FOOD_BARCODE
import com.bissbilanz.android.ui.theme.CaloriesBlue
import com.bissbilanz.android.ui.theme.ProteinRed
import com.bissbilanz.android.ui.theme.rememberHaptic
import com.bissbilanz.repository.FoodRepository
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.launch
import org.koin.compose.koinInject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import androidx.compose.ui.geometry.Size as ComposeSize

enum class ScanState { SCANNING, SEARCHING, NOT_FOUND }

@OptIn(ExperimentalMaterial3Api::class)
@androidx.annotation.OptIn(ExperimentalGetImage::class)
@Composable
fun BarcodeScannerScreen(navController: NavController) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val foodRepo: FoodRepository = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()
    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED,
        )
    }
    var scanState by remember { mutableStateOf(ScanState.SCANNING) }
    var scannedBarcode by remember { mutableStateOf<String?>(null) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var torchOn by remember { mutableStateOf(false) }
    val haptic = rememberHaptic()

    LaunchedEffect(camera, torchOn) {
        camera?.cameraControl?.enableTorch(torchOn)
    }

    val permissionLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.RequestPermission(),
        ) { granted -> hasPermission = granted }

    LaunchedEffect(Unit) {
        if (!hasPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.scan_barcode_title)) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.Close, stringResource(R.string.scan_barcode_close))
                    }
                },
                actions = {
                    if (hasPermission) {
                        IconButton(onClick = { torchOn = !torchOn }) {
                            Icon(
                                if (torchOn) Icons.Default.FlashOn else Icons.Default.FlashOff,
                                contentDescription =
                                    if (torchOn) {
                                        stringResource(R.string.scan_barcode_flash_off)
                                    } else {
                                        stringResource(R.string.scan_barcode_flash_on)
                                    },
                            )
                        }
                    }
                },
                colors =
                    TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        titleContentColor = Color.White,
                        navigationIconContentColor = Color.White,
                        actionIconContentColor = Color.White,
                    ),
            )
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (hasPermission) {
                CameraPreview(
                    lifecycleOwner = lifecycleOwner,
                    isScanning = { scanState == ScanState.SCANNING },
                    onCameraReady = { camera = it },
                    onBarcodeScanned = { barcode ->
                        if (scanState == ScanState.SCANNING) {
                            haptic(HapticFeedbackType.LongPress)
                            scannedBarcode = barcode
                            scanState = ScanState.SEARCHING
                            scope.launch {
                                try {
                                    val food = foodRepo.findOrCreateByBarcode(barcode)
                                    if (food != null) {
                                        navController.navigate("food/${food.id}") {
                                            popUpTo("scanner") { inclusive = true }
                                        }
                                    } else {
                                        scanState = ScanState.NOT_FOUND
                                    }
                                } catch (e: Exception) {
                                    if (e is kotlinx.coroutines.CancellationException) throw e
                                    errorReporter.captureException(e)
                                    // Recover the UI instead of leaving it stuck on SEARCHING.
                                    scanState = ScanState.NOT_FOUND
                                }
                            }
                        }
                    },
                )

                // Viewfinder overlay
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val rectWidth = size.width * 0.7f
                    val rectHeight = rectWidth * 0.6f
                    val left = (size.width - rectWidth) / 2
                    val top = (size.height - rectHeight) / 2

                    // Dim outside viewfinder
                    drawRect(color = Color.Black.copy(alpha = 0.5f))
                    drawRoundRect(
                        color = Color.Transparent,
                        topLeft = Offset(left, top),
                        size = ComposeSize(rectWidth, rectHeight),
                        cornerRadius = CornerRadius(16f, 16f),
                        blendMode = BlendMode.Clear,
                    )

                    // Viewfinder border
                    val borderColor =
                        when (scanState) {
                            ScanState.SCANNING -> Color.White
                            ScanState.SEARCHING -> CaloriesBlue
                            ScanState.NOT_FOUND -> ProteinRed
                        }
                    drawRoundRect(
                        color = borderColor,
                        topLeft = Offset(left, top),
                        size = ComposeSize(rectWidth, rectHeight),
                        cornerRadius = CornerRadius(16f, 16f),
                        style = Stroke(width = 3f),
                    )
                }

                // Status text
                Column(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 80.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    when (scanState) {
                        ScanState.SCANNING -> {
                            Text(
                                stringResource(R.string.scan_barcode_hint),
                                color = Color.White,
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Medium,
                            )
                            Text(
                                stringResource(R.string.scan_barcode_focus_hint),
                                color = Color.White.copy(alpha = 0.7f),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }

                        ScanState.SEARCHING -> {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(32.dp))
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                stringResource(R.string.scan_barcode_searching),
                                color = Color.White,
                                style = MaterialTheme.typography.bodyLarge,
                            )
                        }

                        ScanState.NOT_FOUND -> {
                            Text(
                                stringResource(R.string.scan_barcode_not_found),
                                color = Color.White,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                stringResource(R.string.scan_barcode_value, scannedBarcode ?: ""),
                                color = Color.White.copy(alpha = 0.7f),
                                style = MaterialTheme.typography.bodySmall,
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                OutlinedButton(
                                    onClick = {
                                        scanState = ScanState.SCANNING
                                        scannedBarcode = null
                                    },
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                                ) {
                                    Text(stringResource(R.string.scan_barcode_scan_again))
                                }
                                Button(
                                    onClick = {
                                        navController.previousBackStackEntry
                                            ?.savedStateHandle
                                            ?.set(NAV_KEY_CREATE_FOOD_BARCODE, scannedBarcode)
                                        navController.popBackStack()
                                    },
                                ) {
                                    Text(stringResource(R.string.scan_barcode_create_food))
                                }
                            }
                        }
                    }
                }
            } else {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            stringResource(R.string.scan_barcode_permission_required),
                            style = MaterialTheme.typography.bodyLarge,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }) {
                            Text(stringResource(R.string.scan_barcode_grant_permission))
                        }
                    }
                }
            }
        }
    }
}

@SuppressLint("ClickableViewAccessibility")
@ExperimentalGetImage
@Composable
private fun CameraPreview(
    lifecycleOwner: androidx.lifecycle.LifecycleOwner,
    isScanning: () -> Boolean,
    onCameraReady: (Camera) -> Unit,
    onBarcodeScanned: (String) -> Unit,
) {
    val analyzerExecutor: ExecutorService = remember { Executors.newSingleThreadExecutor() }
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    val scanner =
        remember {
            // ML Kit's unbundled scanner resolves through Google Play services; on
            // devices without a working GMS it can throw from getClient() itself.
            try {
                BarcodeScanning.getClient(
                    BarcodeScannerOptions
                        .Builder()
                        .setBarcodeFormats(
                            Barcode.FORMAT_EAN_13,
                            Barcode.FORMAT_EAN_8,
                            Barcode.FORMAT_UPC_A,
                            Barcode.FORMAT_UPC_E,
                        ).build(),
                )
            } catch (_: Exception) {
                null
            }
        }
    if (scanner == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                stringResource(R.string.scan_barcode_unavailable),
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
            )
        }
        return
    }
    val disposed = remember { AtomicBoolean(false) }
    val cameraProviderRef = remember { arrayOfNulls<ProcessCameraProvider>(1) }
    val imageAnalysisRef = remember { arrayOfNulls<ImageAnalysis>(1) }

    DisposableEffect(Unit) {
        onDispose {
            disposed.set(true)
            imageAnalysisRef[0]?.clearAnalyzer()
            cameraProviderRef[0]?.unbindAll()
            analyzerExecutor.shutdown()
            scanner.close()
        }
    }

    AndroidView(
        factory = { ctx ->
            val previewView = PreviewView(ctx)
            val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)

            cameraProviderFuture.addListener({
                if (disposed.get() || lifecycleOwner.lifecycle.currentState == Lifecycle.State.DESTROYED) {
                    return@addListener
                }
                val cameraProvider = cameraProviderFuture.get()
                cameraProviderRef[0] = cameraProvider

                val preview =
                    Preview.Builder().build().also {
                        it.surfaceProvider = previewView.surfaceProvider
                    }

                val resolutionSelector =
                    ResolutionSelector
                        .Builder()
                        .setResolutionStrategy(
                            ResolutionStrategy(
                                Size(1280, 720),
                                ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
                            ),
                        ).build()

                val imageAnalysis =
                    ImageAnalysis
                        .Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .setResolutionSelector(resolutionSelector)
                        .build()
                imageAnalysisRef[0] = imageAnalysis

                imageAnalysis.setAnalyzer(analyzerExecutor) { imageProxy ->
                    if (disposed.get() || !isScanning()) {
                        imageProxy.close()
                        return@setAnalyzer
                    }
                    val mediaImage = imageProxy.image
                    if (mediaImage == null) {
                        imageProxy.close()
                        return@setAnalyzer
                    }
                    val image =
                        InputImage.fromMediaImage(
                            mediaImage,
                            imageProxy.imageInfo.rotationDegrees,
                        )
                    try {
                        scanner
                            .process(image)
                            .addOnSuccessListener(analyzerExecutor) { barcodes ->
                                if (!disposed.get()) {
                                    barcodes.firstOrNull()?.rawValue?.let { value ->
                                        mainHandler.post { onBarcodeScanned(value) }
                                    }
                                }
                            }.addOnCompleteListener(analyzerExecutor) { imageProxy.close() }
                    } catch (_: Exception) {
                        imageProxy.close()
                    }
                }

                cameraProvider.unbindAll()
                val cam =
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        imageAnalysis,
                    )
                onCameraReady(cam)

                previewView.setOnTouchListener { view, event ->
                    if (event.action == MotionEvent.ACTION_UP) {
                        val point = previewView.meteringPointFactory.createPoint(event.x, event.y)
                        val action =
                            FocusMeteringAction
                                .Builder(point)
                                .setAutoCancelDuration(3, TimeUnit.SECONDS)
                                .build()
                        cam.cameraControl.startFocusAndMetering(action)
                        view.performClick()
                        true
                    } else {
                        false
                    }
                }
            }, ContextCompat.getMainExecutor(ctx))

            previewView
        },
        modifier = Modifier.fillMaxSize(),
    )
}
