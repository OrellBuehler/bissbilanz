package com.bissbilanz.android.ui.components

import android.Manifest
import android.net.Uri
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.chat.ChatPhoto
import com.bissbilanz.android.ui.theme.Dimens
import com.bissbilanz.android.ui.viewmodels.ChatViewModel
import com.bissbilanz.android.util.createImageUri
import com.bissbilanz.android.util.hasPermission
import com.bissbilanz.android.util.isPermanentlyDenied
import com.bissbilanz.android.util.openAppSettings
import com.bissbilanz.android.util.rememberCameraCaptureLauncher
import com.bissbilanz.android.util.requireUprightBitmap
import com.bissbilanz.android.util.toJpegBytes
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.koin.compose.koinInject

/**
 * The message field of the assistant chat: text, photos (camera or gallery, encoded like an
 * AI task's), and send, which turns into stop while the assistant is answering. Insets are
 * the nav host's: it already pads for the keyboard.
 */
@Composable
fun ChatComposer(
    text: TextFieldValue,
    onTextChange: (TextFieldValue) -> Unit,
    attachments: List<ChatPhoto>,
    photoRoom: Int,
    onAttach: (List<ByteArray>) -> Unit,
    onRemoveAttachment: (String) -> Unit,
    canSend: Boolean,
    working: Boolean,
    stopping: Boolean,
    enabled: Boolean,
    onSend: () -> Unit,
    onStop: () -> Unit,
    focusRequester: FocusRequester,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val errorReporter: ErrorReporter = koinInject()
    val scope = rememberCoroutineScope()
    val currentRoom by rememberUpdatedState(photoRoom)
    var menuOpen by remember { mutableStateOf(false) }
    var cameraUri by rememberSaveable { mutableStateOf<Uri?>(null) }
    var photoError by remember { mutableStateOf(false) }
    var cameraBlocked by remember { mutableStateOf(false) }
    val activity = LocalActivity.current

    fun decode(uris: List<Uri>) {
        scope.launch {
            try {
                val photos = withContext(Dispatchers.IO) { uris.take(currentRoom).map { requireUprightBitmap(context, it).toJpegBytes() } }
                photoError = false
                onAttach(photos)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                errorReporter.captureException(e)
                photoError = true
            }
        }
    }

    val pickMedia =
        rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(ChatViewModel.MAX_PHOTOS_PER_MESSAGE)) { uris ->
            if (uris.isNotEmpty()) decode(uris)
        }
    val takePicture =
        rememberCameraCaptureLauncher { success ->
            val uri = cameraUri
            if (success && uri != null) {
                cameraBlocked = false
                decode(listOf(uri))
            } else {
                cameraBlocked =
                    !context.hasPermission(Manifest.permission.CAMERA) &&
                    activity.isPermanentlyDenied(Manifest.permission.CAMERA)
            }
        }

    Surface(color = MaterialTheme.colorScheme.surface, modifier = modifier.fillMaxWidth()) {
        Column {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            if (attachments.isNotEmpty()) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(horizontal = Dimens.ScreenPadding),
                    modifier = Modifier.padding(top = 8.dp),
                ) {
                    items(attachments, key = { it.id }) { photo ->
                        Box {
                            LocalPhotoThumb(photo, size = 64)
                            IconButton(
                                onClick = { onRemoveAttachment(photo.id) },
                                modifier = Modifier.align(Alignment.TopEnd).size(28.dp),
                            ) {
                                Surface(
                                    shape = MaterialTheme.shapes.extraLarge,
                                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f),
                                ) {
                                    Icon(
                                        Icons.Default.Close,
                                        stringResource(R.string.ai_task_remove_photo),
                                        modifier = Modifier.padding(2.dp).size(16.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }
            if (photoError || cameraBlocked) {
                Column(modifier = Modifier.padding(horizontal = Dimens.ScreenPadding).semantics { liveRegion = LiveRegionMode.Polite }) {
                    Text(
                        stringResource(if (cameraBlocked) R.string.ai_task_camera_permission_required else R.string.photo_read_failed),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    if (cameraBlocked) {
                        TextButton(onClick = { context.openAppSettings() }, contentPadding = PaddingValues(0.dp)) {
                            Text(stringResource(R.string.scan_barcode_open_settings), maxLines = 1)
                        }
                    }
                }
            }
            Row(
                verticalAlignment = Alignment.Bottom,
                modifier = Modifier.padding(start = 4.dp, end = Dimens.ScreenPadding, top = 8.dp, bottom = 8.dp),
            ) {
                Box {
                    IconButton(onClick = { menuOpen = true }, enabled = enabled && photoRoom > 0) {
                        Icon(Icons.Default.AddPhotoAlternate, stringResource(R.string.chat_attach_photo))
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.ai_task_photo_camera)) },
                            leadingIcon = { Icon(Icons.Outlined.PhotoCamera, contentDescription = null) },
                            onClick = {
                                menuOpen = false
                                val uri = createImageUri(context, "chat_")
                                cameraUri = uri
                                takePicture.launch(uri)
                            },
                        )
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.ai_task_photo_gallery)) },
                            leadingIcon = { Icon(Icons.Outlined.PhotoLibrary, contentDescription = null) },
                            onClick = {
                                menuOpen = false
                                pickMedia.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                        )
                    }
                }
                val length = text.text.trim().length
                val tooLong = length > ChatViewModel.MAX_TEXT_CHARS
                OutlinedTextField(
                    value = text,
                    onValueChange = onTextChange,
                    enabled = enabled,
                    placeholder = { Text(stringResource(R.string.chat_input_placeholder)) },
                    isError = tooLong,
                    supportingText =
                        if (tooLong) {
                            { Text(stringResource(R.string.chat_input_too_long, ChatViewModel.MAX_TEXT_CHARS)) }
                        } else {
                            null
                        },
                    minLines = 1,
                    maxLines = 6,
                    textStyle = MaterialTheme.typography.bodyMedium,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    modifier = Modifier.weight(1f).focusRequester(focusRequester),
                )
                Box(modifier = Modifier.padding(start = 8.dp, bottom = 4.dp)) {
                    if (working) {
                        FilledTonalIconButton(onClick = onStop, enabled = !stopping) {
                            if (stopping) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = LocalContentColor.current,
                                )
                            } else {
                                Icon(Icons.Default.Stop, stringResource(R.string.chat_stop))
                            }
                        }
                    } else {
                        FilledIconButton(onClick = onSend, enabled = canSend) {
                            Icon(Icons.AutoMirrored.Filled.Send, stringResource(R.string.chat_send))
                        }
                    }
                }
            }
        }
    }
}
