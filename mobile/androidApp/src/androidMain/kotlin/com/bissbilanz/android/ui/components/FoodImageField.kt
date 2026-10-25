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
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.images.FoodImageUploader
import com.bissbilanz.android.util.createImageUri
import com.bissbilanz.android.util.rememberCameraCaptureLauncher
import com.bissbilanz.android.util.requireUprightBitmap
import com.bissbilanz.android.util.toUploadBytes
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.koin.compose.koinInject
import java.util.UUID

/**
 * The server thumbnails to 512×512, so 800 px leaves headroom for a future
 * retina bump while roughly quartering the upload against the AI-task path
 * (which needs 1600 px only because a model has to read a label).
 */
private const val MAX_UPLOAD_DIMENSION = 800
private const val UPLOAD_QUALITY = 85

/**
 * Runs a [FoodImageField] upload outside composition, so rotating the screen (or any
 * other recreation of the form) neither cancels it nor loses the URL it produces.
 */
internal class FoodImageUploadViewModel(
    private val uploader: FoodImageUploader,
    private val errorReporter: ErrorReporter,
) : ViewModel() {
    private val _isUploading = MutableStateFlow(false)
    val isUploading: StateFlow<Boolean> = _isUploading.asStateFlow()

    /** The finished upload's URL, until the field has handed it to the form. */
    private val _uploadedUrl = MutableStateFlow<String?>(null)
    val uploadedUrl: StateFlow<String?> = _uploadedUrl.asStateFlow()

    private val _failed = MutableStateFlow(false)
    val failed: StateFlow<Boolean> = _failed.asStateFlow()

    fun upload(
        cropped: Bitmap,
        transparent: Boolean,
    ) {
        if (_isUploading.value) return
        _isUploading.value = true
        _failed.value = false
        viewModelScope.launch {
            try {
                val encoded =
                    withContext(Dispatchers.IO) {
                        cropped.toUploadBytes(MAX_UPLOAD_DIMENSION, UPLOAD_QUALITY, transparent)
                    }
                _uploadedUrl.value = uploader.store(encoded.bytes, format = encoded.format)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                errorReporter.captureException(e)
                _failed.value = true
            } finally {
                _isUploading.value = false
            }
        }
    }

    fun consumeUploadedUrl() {
        _uploadedUrl.value = null
    }
}

/**
 * The image row of a food or recipe form: shows the current photo, and offers
 * camera, library and removal. Everything from capture through square crop,
 * downscale and upload happens here; [onImageUrlChange] receives the URL to store
 * on the row (null when the user removes the image). [onUploadingChange] reports an
 * upload in flight, so the form can hold Save (and its own dismissal) until the URL
 * has arrived.
 */
@Composable
fun FoodImageField(
    imageUrl: String?,
    onImageUrlChange: (String?) -> Unit,
    modifier: Modifier = Modifier,
    label: String = stringResource(R.string.food_image_label),
    onUploadingChange: (Boolean) -> Unit = {},
) {
    val context = LocalContext.current
    val uploader: FoodImageUploader = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()

    // One upload holder per field, found again after recreation by its saved key.
    val uploadKey = rememberSaveable { UUID.randomUUID().toString() }
    val uploads = viewModel(key = "food-image-$uploadKey") { FoodImageUploadViewModel(uploader, errorReporter) }
    val uploadInFlight by uploads.isUploading.collectAsStateWithLifecycle()
    val uploadedUrl by uploads.uploadedUrl.collectAsStateWithLifecycle()
    val uploadFailedFlag by uploads.failed.collectAsStateWithLifecycle()
    // Still "uploading" until the URL has reached the form, so Save never runs without it.
    val isUploading = uploadInFlight || uploadedUrl != null

    // Saveable: the camera app can outlive this process, and the result must still
    // know where the photo went.
    var cameraUri by rememberSaveable { mutableStateOf<Uri?>(null) }
    var cropCandidate by remember { mutableStateOf<Bitmap?>(null) }
    var readFailedFlag by remember { mutableStateOf(false) }
    val currentOnUploadingChange by rememberUpdatedState(onUploadingChange)
    val currentOnImageUrlChange by rememberUpdatedState(onImageUrlChange)

    LaunchedEffect(isUploading) { currentOnUploadingChange(isUploading) }
    LaunchedEffect(uploadedUrl) {
        uploadedUrl?.let {
            currentOnImageUrlChange(it)
            uploads.consumeUploadedUrl()
        }
    }

    val errorMessage =
        when {
            readFailedFlag -> stringResource(R.string.photo_read_failed)
            uploadFailedFlag -> stringResource(R.string.food_image_upload_failed)
            else -> null
        }

    fun load(uri: Uri) {
        readFailedFlag = false
        scope.launch {
            try {
                cropCandidate = withContext(Dispatchers.IO) { requireUprightBitmap(context, uri) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                errorReporter.captureException(e)
                readFailedFlag = true
            }
        }
    }

    val pickMedia =
        rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
            if (uri != null) load(uri)
        }
    val takePicture =
        rememberCameraCaptureLauncher { success ->
            cameraUri?.takeIf { success }?.let { load(it) }
        }

    fun upload(
        cropped: Bitmap,
        transparent: Boolean,
    ) {
        cropCandidate = null
        readFailedFlag = false
        uploads.upload(cropped, transparent)
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
                        contentDescription = label,
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
                        Icon(Icons.Outlined.PhotoCamera, contentDescription = stringResource(R.string.food_image_take_photo))
                    }
                    OutlinedButton(
                        onClick = {
                            pickMedia.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                            )
                        },
                        enabled = !isUploading,
                    ) {
                        Icon(Icons.Outlined.PhotoLibrary, contentDescription = stringResource(R.string.food_image_choose_photo))
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
            onCropped = { cropped, transparent -> upload(cropped, transparent) },
        )
    }
}
