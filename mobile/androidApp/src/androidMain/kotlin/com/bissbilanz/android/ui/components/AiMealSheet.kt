package com.bissbilanz.android.ui.components

import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.aitasks.AiTaskUploadWorker
import com.bissbilanz.android.util.createImageUri
import com.bissbilanz.android.util.decodeUprightBitmap
import com.bissbilanz.android.util.toJpegBytes
import com.bissbilanz.util.mealTypes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import org.koin.compose.koinInject
import kotlin.time.Clock

/** Mirrors MAX_AI_TASK_PHOTOS on the server. */
private const val MAX_AI_TASK_PHOTOS = 5

/**
 * Hands a meal to the MCP assistant: a description, up to five photos and the
 * target meal are queued as an AI task the assistant logs later. Mirrors the
 * "send to assistant" half of the iOS AIMealSheet; iOS additionally estimates
 * on-device via Apple's Foundation Models, which has no Android counterpart
 * that ships on the same devices.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiMealSheet(
    date: String,
    onDismiss: () -> Unit,
    onQueued: () -> Unit,
) {
    val errorReporter: ErrorReporter = koinInject()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var description by remember { mutableStateOf("") }
    var mealType by remember { mutableStateOf(mealTypes.first()) }
    var mealMenuOpen by remember { mutableStateOf(false) }
    // Unset means "when I sent it": the server stamps its own clock on a task
    // for today and leaves a back-dated one to the assistant.
    var eatenHour by remember { mutableStateOf<Int?>(null) }
    var eatenMinute by remember { mutableStateOf<Int?>(null) }
    var showTimePicker by remember { mutableStateOf(false) }
    val attached = remember { mutableStateListOf<Bitmap>() }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    var isSending by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val sendFailed = stringResource(R.string.ai_task_send_failed)

    val pickMedia =
        rememberLauncherForActivityResult(
            ActivityResultContracts.PickMultipleVisualMedia(MAX_AI_TASK_PHOTOS),
        ) { uris ->
            if (uris.isNotEmpty()) {
                scope.launch {
                    val room = MAX_AI_TASK_PHOTOS - attached.size
                    val decoded =
                        withContext(Dispatchers.IO) {
                            uris.take(room).mapNotNull { decodeUprightBitmap(context, it) }
                        }
                    attached.addAll(decoded)
                }
            }
        }

    val takePicture =
        rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
            val uri = cameraUri
            if (success && uri != null) {
                scope.launch {
                    val decoded = withContext(Dispatchers.IO) { decodeUprightBitmap(context, uri) }
                    if (decoded != null && attached.size < MAX_AI_TASK_PHOTOS) attached.add(decoded)
                }
            }
        }

    val canSend = description.isNotBlank() || attached.isNotEmpty()

    if (showTimePicker) {
        val nowLocal = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault())
        val timeState =
            rememberTimePickerState(
                initialHour = eatenHour ?: nowLocal.hour,
                initialMinute = eatenMinute ?: nowLocal.minute,
            )
        AlertDialog(
            onDismissRequest = { showTimePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        eatenHour = timeState.hour
                        eatenMinute = timeState.minute
                        showTimePicker = false
                    },
                ) { Text(stringResource(R.string.dialog_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showTimePicker = false }) { Text(stringResource(R.string.dialog_cancel)) }
            },
            text = {
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    TimePicker(state = timeState)
                }
            },
        )
    }

    // Swiping the sheet away mid-send would cancel the upload with it, since the
    // send runs in this composable's scope — hold it open until the task is queued.
    ModalBottomSheet(
        onDismissRequest = { if (!isSending) onDismiss() },
        sheetState = sheetState,
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 32.dp)
                    .imePadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(R.string.ai_task_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                stringResource(R.string.ai_task_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            ExposedDropdownMenuBox(
                expanded = mealMenuOpen,
                onExpandedChange = { mealMenuOpen = it },
            ) {
                OutlinedTextField(
                    value = mealTypeDisplayName(mealType),
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.meal_picker_meal_label)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = mealMenuOpen) },
                    modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                )
                ExposedDropdownMenu(expanded = mealMenuOpen, onDismissRequest = { mealMenuOpen = false }) {
                    mealTypes.forEach { meal ->
                        DropdownMenuItem(
                            text = { Text(mealTypeDisplayName(meal)) },
                            onClick = {
                                mealType = meal
                                mealMenuOpen = false
                            },
                        )
                    }
                }
            }

            Text(stringResource(R.string.ai_task_time_label), style = MaterialTheme.typography.labelLarge)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                OutlinedButton(
                    onClick = { showTimePicker = true },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Default.Schedule, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(formatTimeOfDay(eatenHour, eatenMinute))
                }
                if (eatenHour != null) {
                    IconButton(
                        onClick = {
                            eatenHour = null
                            eatenMinute = null
                        },
                    ) {
                        Icon(Icons.Default.Close, contentDescription = stringResource(R.string.ai_task_clear_time))
                    }
                }
            }
            Text(
                stringResource(R.string.ai_task_time_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text(stringResource(R.string.ai_task_what_did_you_eat)) },
                placeholder = { Text(stringResource(R.string.ai_task_description_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                maxLines = 8,
            )

            if (attached.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(attached) { bitmap ->
                        Box {
                            Image(
                                bitmap = bitmap.asImageBitmap(),
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier =
                                    Modifier
                                        .size(120.dp)
                                        .clip(RoundedCornerShape(12.dp)),
                            )
                            FilledTonalIconButton(
                                onClick = { attached.remove(bitmap) },
                                modifier = Modifier.align(Alignment.TopEnd).padding(4.dp).size(28.dp),
                            ) {
                                Icon(
                                    Icons.Default.Close,
                                    stringResource(R.string.ai_task_remove_photo),
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                    }
                }
            }

            if (attached.size < MAX_AI_TASK_PHOTOS) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = {
                            val uri = createImageUri(context, "ai_meal_")
                            cameraUri = uri
                            takePicture.launch(uri)
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Outlined.PhotoCamera, null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(stringResource(R.string.scan_label_take_photo))
                    }
                    OutlinedButton(
                        onClick = {
                            pickMedia.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                            )
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Outlined.PhotoLibrary, null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(stringResource(R.string.scan_label_choose_photo))
                    }
                }
            }

            Text(
                stringResource(R.string.ai_task_photo_hint, MAX_AI_TASK_PHOTOS),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            errorMessage?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                    enabled = !isSending,
                ) { Text(stringResource(R.string.dialog_cancel)) }
                Button(
                    onClick = {
                        isSending = true
                        errorMessage = null
                        scope.launch {
                            try {
                                // Only the encoding happens here; the upload itself is
                                // WorkManager's, so closing the sheet or the app does
                                // not lose the meal.
                                withContext(Dispatchers.IO) {
                                    val bytes = attached.map { it.toJpegBytes() }
                                    AiTaskUploadWorker.enqueue(
                                        context = context,
                                        date = date,
                                        description = description.trim().ifBlank { null },
                                        mealType = mealType,
                                        eatenAt = buildEatenAt(date, eatenHour, eatenMinute),
                                        photos = bytes,
                                    )
                                }
                                isSending = false
                                onQueued()
                            } catch (e: Exception) {
                                if (e is kotlinx.coroutines.CancellationException) throw e
                                errorReporter.captureException(e)
                                isSending = false
                                errorMessage = sendFailed
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = canSend && !isSending,
                ) {
                    if (isSending) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(stringResource(R.string.ai_task_sending))
                    } else {
                        Text(stringResource(R.string.ai_task_send))
                    }
                }
            }
        }
    }
}
