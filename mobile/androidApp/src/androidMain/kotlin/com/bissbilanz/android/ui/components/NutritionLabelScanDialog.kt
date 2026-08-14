package com.bissbilanz.android.ui.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.ocr.NutritionLabelScanner
import com.bissbilanz.android.util.createImageUri
import com.bissbilanz.android.util.decodeUprightBitmap
import com.bissbilanz.label.ParsedNutrition
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.koin.compose.koinInject
import java.io.File

/**
 * Lets the user fill in a new food's nutrition by photographing or picking an
 * image of its nutrition-facts panel. Runs fully on-device (ML Kit + the shared
 * [com.bissbilanz.label.NutritionLabelParser]); the Android counterpart of the
 * iOS `NutritionLabelScanView`. On success, [onParsed] receives the per-100 g
 * values for confirmation in the food edit form.
 */
@Composable
fun NutritionLabelScanDialog(
    onDismiss: () -> Unit,
    onParsed: (ParsedNutrition) -> Unit,
) {
    val context = LocalContext.current
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()
    val scanner = remember { NutritionLabelScanner() }

    var isProcessing by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }

    val failedMessage = stringResource(R.string.scan_label_failed)
    val noDataMessage = stringResource(R.string.scan_label_no_data)

    fun process(load: suspend () -> Bitmap?) {
        isProcessing = true
        errorMessage = null
        scope.launch {
            try {
                val bitmap = withContext(Dispatchers.IO) { load() }
                if (bitmap == null) {
                    errorMessage = failedMessage
                    isProcessing = false
                    return@launch
                }
                val parsed = scanner.scan(bitmap)
                if (parsed.isEmpty) {
                    errorMessage = noDataMessage
                    isProcessing = false
                } else {
                    onParsed(parsed)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                errorReporter.captureException(e)
                errorMessage = failedMessage
                isProcessing = false
            }
        }
    }

    val pickMedia =
        rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
            if (uri != null) process { decodeUprightBitmap(context, uri) }
        }

    val takePicture =
        rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
            val uri = cameraUri
            if (success && uri != null) process { decodeUprightBitmap(context, uri) }
        }

    AlertDialog(
        onDismissRequest = { if (!isProcessing) onDismiss() },
        icon = { Icon(Icons.Default.DocumentScanner, contentDescription = null) },
        title = { Text(stringResource(R.string.scan_label_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    stringResource(R.string.scan_label_hint),
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (isProcessing) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(32.dp))
                        Text(
                            stringResource(R.string.scan_label_scanning),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                } else {
                    Button(
                        onClick = {
                            val uri = createImageUri(context, "label_")
                            cameraUri = uri
                            takePicture.launch(uri)
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Outlined.PhotoCamera, contentDescription = null)
                        Text(
                            stringResource(R.string.scan_label_take_photo),
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                    OutlinedButton(
                        onClick = {
                            pickMedia.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Outlined.PhotoLibrary, contentDescription = null)
                        Text(
                            stringResource(R.string.scan_label_choose_photo),
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
                errorMessage?.let {
                    Text(
                        it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isProcessing) {
                Text(stringResource(R.string.scan_label_cancel))
            }
        },
    )
}
