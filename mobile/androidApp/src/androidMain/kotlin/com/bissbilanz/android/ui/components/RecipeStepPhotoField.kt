package com.bissbilanz.android.ui.components

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
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
import com.bissbilanz.android.util.rememberCameraCaptureLauncher
import com.bissbilanz.android.util.toJpegBytes
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.koin.compose.koinInject

/** The server keeps a step photo's aspect ratio up to this size (`RECIPE_STEP_MAX_DIM`). */
private const val STEP_MAX_DIMENSION = 1280
private const val STEP_UPLOAD_QUALITY = 85

/** `purpose` field of `POST /api/images/upload` that skips the square thumbnail crop. */
const val RECIPE_STEP_PURPOSE = "recipe_step"

/**
 * The photo row of one recipe step: thumbnail, camera, library and removal. Unlike
 * [FoodImageField] there is no square crop, because a step photo is shown in full
 * while cooking; [onImageUrlChange] receives the stored URL (null on removal).
 */
@Composable
fun RecipeStepPhotoField(
    stepNumber: Int,
    imageUrl: String?,
    onImageUrlChange: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val uploader: FoodImageUploader = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()

    // The upload outlives the composition that started it; the newest callback sees the
    // steps as they are now, so text typed meanwhile is not overwritten.
    val currentOnImageUrlChange by rememberUpdatedState(onImageUrlChange)
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    var isUploading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val uploadFailed = stringResource(R.string.recipe_edit_step_photo_failed)

    fun upload(uri: Uri) {
        isUploading = true
        errorMessage = null
        scope.launch {
            try {
                val bytes =
                    withContext(Dispatchers.IO) {
                        decodeUprightBitmap(context, uri)
                            ?.toJpegBytes(maxDimension = STEP_MAX_DIMENSION, quality = STEP_UPLOAD_QUALITY)
                    }
                if (bytes == null) {
                    errorMessage = uploadFailed
                } else {
                    currentOnImageUrlChange(uploader.store(bytes, purpose = RECIPE_STEP_PURPOSE))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                errorReporter.captureException(e)
                errorMessage = uploadFailed
            }
            isUploading = false
        }
    }

    val pickMedia =
        rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
            if (uri != null) upload(uri)
        }
    val takePicture =
        rememberCameraCaptureLauncher { success ->
            cameraUri?.takeIf { success }?.let { upload(it) }
        }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (isUploading) {
                Box(modifier = Modifier.size(64.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(modifier = Modifier.size(28.dp))
                }
            } else if (imageUrl != null) {
                Box(modifier = Modifier.size(64.dp)) {
                    FoodImage(
                        imageUrl = imageUrl,
                        contentDescription = stringResource(R.string.recipe_detail_step_photo, stepNumber),
                        modifier = Modifier.size(64.dp).clip(RoundedCornerShape(8.dp)),
                    )
                }
                IconButton(onClick = { onImageUrlChange(null) }) {
                    Icon(Icons.Default.Close, stringResource(R.string.recipe_edit_step_photo_remove))
                }
            }
            OutlinedIconButton(
                onClick = {
                    val uri = createImageUri(context, "step-photo")
                    cameraUri = uri
                    takePicture.launch(uri)
                },
                enabled = !isUploading,
            ) {
                Icon(Icons.Outlined.PhotoCamera, stringResource(R.string.recipe_edit_step_photo_camera, stepNumber))
            }
            OutlinedIconButton(
                onClick = {
                    pickMedia.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                },
                enabled = !isUploading,
            ) {
                Icon(Icons.Outlined.PhotoLibrary, stringResource(R.string.recipe_edit_step_photo_library, stepNumber))
            }
        }
        errorMessage?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
    }
}
