package com.bissbilanz.android.ui.components

import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PhotoLibrary
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.images.FoodImageUploader
import com.bissbilanz.android.util.createImageUri
import com.bissbilanz.android.util.decodeUprightBitmap
import com.bissbilanz.android.util.toJpegBytes
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.koin.compose.koinInject

/**
 * The server thumbnails to 400×400, so 800 px leaves headroom for a future
 * retina bump while roughly quartering the upload against the AI-task path
 * (which needs 1600 px only because a model has to read a label).
 */
private const val MAX_UPLOAD_DIMENSION = 800
private const val UPLOAD_QUALITY = 85

/**
 * The image row of the food form: shows the current photo, and offers camera,
 * library and removal. Everything from capture through square crop, downscale
 * and upload happens here; [onImageUrlChange] receives the URL to store on the
 * food (null when the user removes the image).
 */
@Composable
fun FoodImageField(
    imageUrl: String?,
    onImageUrlChange: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val uploader: FoodImageUploader = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()

    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    var cropCandidate by remember { mutableStateOf<Bitmap?>(null) }
    var isUploading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val uploadFailed = stringResource(R.string.food_image_upload_failed)

    fun load(uri: Uri) {
        scope.launch {
            val bitmap = withContext(Dispatchers.IO) { decodeUprightBitmap(context, uri) }
            if (bitmap == null) errorMessage = uploadFailed else cropCandidate = bitmap
        }
    }

    val pickMedia =
        rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
            if (uri != null) load(uri)
        }
    val takePicture =
        rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
            cameraUri?.takeIf { success }?.let { load(it) }
        }

    fun upload(cropped: Bitmap) {
        cropCandidate = null
        isUploading = true
        errorMessage = null
        scope.launch {
            try {
                val bytes =
                    withContext(Dispatchers.IO) {
                        cropped.toJpegBytes(maxDimension = MAX_UPLOAD_DIMENSION, quality = UPLOAD_QUALITY)
                    }
                onImageUrlChange(uploader.store(bytes))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                errorReporter.captureException(e)
                errorMessage = uploadFailed
            }
            isUploading = false
        }
    }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Box(
                modifier = Modifier.size(72.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (isUploading) {
                    CircularProgressIndicator()
                } else {
                    FoodImage(
                        imageUrl = imageUrl,
                        contentDescription = stringResource(R.string.food_image_label),
                        modifier =
                            Modifier
                                .size(72.dp)
                                .clip(RoundedCornerShape(12.dp)),
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = {
                            val uri = createImageUri(context, "food-photo")
                            cameraUri = uri
                            takePicture.launch(uri)
                        },
                        enabled = !isUploading,
                    ) {
                        Icon(Icons.Outlined.PhotoCamera, contentDescription = null)
                    }
                    OutlinedButton(
                        onClick = {
                            pickMedia.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                            )
                        },
                        enabled = !isUploading,
                    ) {
                        Icon(Icons.Outlined.PhotoLibrary, contentDescription = null)
                    }
                }
                if (imageUrl != null && !isUploading) {
                    TextButton(onClick = { onImageUrlChange(null) }) {
                        Text(stringResource(R.string.food_image_remove))
                    }
                }
            }
        }

        errorMessage?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
    }

    cropCandidate?.let { bitmap ->
        ImageCropDialog(
            bitmap = bitmap,
            onCancel = { cropCandidate = null },
            onCropped = { upload(it) },
        )
    }
}
