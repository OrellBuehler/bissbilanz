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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.util.createImageUri
import com.bissbilanz.android.util.rememberCameraCaptureLauncher
import com.bissbilanz.android.util.requireUprightBitmap
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
 * [FoodImageField] there is no square crop (a [PhotoReviewDialog] stands in, because a
 * step photo is shown in full while cooking); [onImageUrlChange] receives the stored URL (null on removal).
 */
@Composable
fun RecipeStepPhotoField(
    stepNumber: Int,
    imageUrl: String?,
    onImageUrlChange: (String?) -> Unit,
    modifier: Modifier = Modifier,
    onUploadingChange: (Boolean) -> Unit = {},
) {
    val context = LocalContext.current
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()

    // The upload outlives the composition that started it; the newest callback sees the
    // steps as they are now, so text typed meanwhile is not overwritten.
    val currentOnImageUrlChange by rememberUpdatedState(onImageUrlChange)
    val currentOnUploadingChange by rememberUpdatedState(onUploadingChange)
    // Saveable: the camera app can outlive this process, and the result must still
    // know where the photo went.
    var cameraUri by rememberSaveable { mutableStateOf<Uri?>(null) }
    var reviewCandidate by remember { mutableStateOf<Bitmap?>(null) }
    var readFailedFlag by remember { mutableStateOf(false) }

    // Same as FoodImageField: the upload runs in a view model, so rotating mid-upload
    // neither cancels it nor drops the URL.
    val (uploads, uploadKey) = rememberImageUpload()
    val allUploads by uploads.uploads.collectAsStateWithLifecycle()
    val upload = allUploads[uploadKey] ?: FoodImageUploadViewModel.Upload()
    val uploadedUrl = upload.url
    val isUploading = upload.isUploading

    LaunchedEffect(isUploading) { currentOnUploadingChange(isUploading) }
    LaunchedEffect(uploadedUrl) {
        uploadedUrl?.let {
            currentOnImageUrlChange(it)
            uploads.consumeUploadedUrl(uploadKey)
        }
    }

    val errorMessage =
        when {
            readFailedFlag -> stringResource(R.string.photo_read_failed)
            upload.failed -> stringResource(R.string.recipe_edit_step_photo_failed)
            else -> null
        }

    fun load(uri: Uri) {
        readFailedFlag = false
        scope.launch {
            try {
                reviewCandidate = withContext(Dispatchers.IO) { requireUprightBitmap(context, uri) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                errorReporter.captureException(e)
                readFailedFlag = true
            }
        }
    }

    fun upload(
        photo: Bitmap,
        transparent: Boolean,
    ) {
        reviewCandidate = null
        readFailedFlag = false
        uploads.upload(uploadKey, photo, transparent, STEP_MAX_DIMENSION, STEP_UPLOAD_QUALITY, RECIPE_STEP_PURPOSE)
    }

    val pickMedia =
        rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
            if (uri != null) load(uri)
        }
    val takePicture =
        rememberCameraCaptureLauncher { success ->
            cameraUri?.takeIf { success }?.let { load(it) }
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
    reviewCandidate?.let { photo ->
        PhotoReviewDialog(
            bitmap = photo,
            onCancel = { reviewCandidate = null },
            onConfirm = { reviewed, transparent -> upload(reviewed, transparent) },
        )
    }
}
