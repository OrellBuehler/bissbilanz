package com.bissbilanz.android.ui.components

import android.Manifest
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.LocalActivity
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
import androidx.compose.material.icons.filled.CalendarToday
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.aitasks.AiTaskUploadWorker
import com.bissbilanz.android.util.createImageUri
import com.bissbilanz.android.util.dayLabel
import com.bissbilanz.android.util.hasPermission
import com.bissbilanz.android.util.isPermanentlyDenied
import com.bissbilanz.android.util.openAppSettings
import com.bissbilanz.android.util.rememberCameraCaptureLauncher
import com.bissbilanz.android.util.requireUprightBitmap
import com.bissbilanz.android.util.toJpegBytes
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.api.generated.model.AiTaskUpdate
import com.bissbilanz.repository.AiTaskRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.util.AiTaskField
import com.bissbilanz.util.jsonKeys
import com.bissbilanz.util.mealTypes
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.todayIn
import org.koin.compose.koinInject
import kotlin.time.Clock
import kotlin.time.Instant

/** Mirrors MAX_AI_TASK_PHOTOS on the server. */
private const val MAX_AI_TASK_PHOTOS = 5

/** Mirrors the description limit in the server's AI task validation. */
private const val MAX_AI_TASK_DESCRIPTION_LENGTH = 2000

/**
 * Hands a meal to the MCP assistant: a description, up to five photos and the
 * target meal are queued as an AI task the assistant logs later. Mirrors the
 * "send to assistant" half of the iOS AIMealSheet; iOS additionally estimates
 * on-device via Apple's Foundation Models, which has no Android counterpart
 * that ships on the same devices.
 *
 * Passing [task] switches the sheet to edit mode for that still-open task instead:
 * the same fields, prefilled, PATCHing the task on save rather than queuing a new
 * one. [date] is only used to seed a new task and is ignored once [task] is set.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiMealSheet(
    date: String,
    task: AiTask? = null,
    onDismiss: () -> Unit,
    onQueued: () -> Unit = {},
    onSaved: () -> Unit = {},
) {
    val errorReporter: ErrorReporter = koinInject()
    val aiTaskRepo: AiTaskRepository = koinInject()
    val api: BissbilanzApi = koinInject()
    val prefsRepo: PreferencesRepository = koinInject()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val isEditing = task != null

    val prefs by prefsRepo.preferences().collectAsStateWithLifecycle(initialValue = null)
    val processorIsDevice = prefs?.aiTaskProcessor?.value == "device"
    // Unknown while the check is in flight, or if it fails — fail open rather than
    // block sending over a transient network hiccup; only a definite "not
    // connected" answer disables the button.
    var mcpConnected by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        try {
            mcpConnected = api.getMcpStatus()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }
    val canProcess = processorIsDevice || mcpConnected

    var description by remember(task?.id) { mutableStateOf(task?.description ?: "") }
    var mealType by remember(task?.id) { mutableStateOf(if (task != null) task.mealType else mealTypes.first()) }
    var mealMenuOpen by remember { mutableStateOf(false) }
    var selectedDate by remember(task?.id) { mutableStateOf(task?.date ?: date) }
    var showDatePicker by remember { mutableStateOf(false) }
    val initialEatenLocal =
        remember(task?.id) {
            task?.eatenAt?.let {
                runCatching { Instant.parse(it).toLocalDateTime(TimeZone.currentSystemDefault()) }.getOrNull()
            }
        }
    // Unset means "when I sent it" on creation, or "no specific time" on an edit: the
    // server stamps its own clock on a task for today and leaves a back-dated one to
    // the assistant.
    var eatenHour by remember(task?.id) { mutableStateOf(initialEatenLocal?.hour) }
    var eatenMinute by remember(task?.id) { mutableStateOf(initialEatenLocal?.minute) }
    var showTimePicker by remember { mutableStateOf(false) }
    val existingPhotoUrls =
        remember(task?.id) { mutableStateListOf<String>().apply { task?.photoUrls?.let(::addAll) } }
    val attached = remember(task?.id) { mutableStateListOf<Bitmap>() }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    var isSending by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var cameraPermanentlyDenied by remember { mutableStateOf(false) }

    val sendFailed = stringResource(R.string.ai_task_send_failed)
    val saveFailed = stringResource(R.string.ai_task_save_failed)
    val photoReadFailed = stringResource(R.string.photo_read_failed)
    val totalPhotoCount = existingPhotoUrls.size + attached.size

    val pickMedia =
        rememberLauncherForActivityResult(
            ActivityResultContracts.PickMultipleVisualMedia(MAX_AI_TASK_PHOTOS),
        ) { uris ->
            if (uris.isNotEmpty()) {
                scope.launch {
                    val room = MAX_AI_TASK_PHOTOS - totalPhotoCount
                    try {
                        val decoded =
                            withContext(Dispatchers.IO) {
                                uris.take(room).map { requireUprightBitmap(context, it) }
                            }
                        attached.addAll(decoded)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        errorReporter.captureException(e)
                        errorMessage = photoReadFailed
                    }
                }
            }
        }

    val activity = LocalActivity.current

    // rememberCameraCaptureLauncher (BISSBILANZ-3A) already checks/requests the
    // CAMERA permission before every launch and shows a Toast on denial. That
    // Toast alone leaves the user stuck once the system stops showing the
    // request dialog, so surface a persistent "Open settings" path for that
    // case — mirroring BarcodeScannerScreen's pattern — instead of nothing.
    val takePicture =
        rememberCameraCaptureLauncher { success ->
            val uri = cameraUri
            if (success && uri != null) {
                cameraPermanentlyDenied = false
                scope.launch {
                    try {
                        val decoded = withContext(Dispatchers.IO) { requireUprightBitmap(context, uri) }
                        if (totalPhotoCount < MAX_AI_TASK_PHOTOS) attached.add(decoded)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        errorReporter.captureException(e)
                        errorMessage = photoReadFailed
                    }
                }
            } else {
                cameraPermanentlyDenied =
                    !context.hasPermission(Manifest.permission.CAMERA) &&
                    activity.isPermanentlyDenied(Manifest.permission.CAMERA)
            }
        }

    val canSend = (description.isNotBlank() || totalPhotoCount > 0) && (isEditing || canProcess)

    if (showDatePicker) {
        val initialMillis =
            runCatching { LocalDate.parse(selectedDate).toEpochDays().toLong() * 86_400_000L }
                .getOrDefault(
                    Clock.System
                        .todayIn(TimeZone.currentSystemDefault())
                        .toEpochDays()
                        .toLong() * 86_400_000L,
                )
        val dateState = rememberDatePickerState(initialSelectedDateMillis = initialMillis, yearRange = 1900..2100)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        dateState.selectedDateMillis?.let { millis ->
                            selectedDate =
                                Instant
                                    .fromEpochMilliseconds(millis)
                                    .toLocalDateTime(TimeZone.UTC)
                                    .date
                                    .toString()
                        }
                        showDatePicker = false
                    },
                ) { Text(stringResource(R.string.dialog_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text(stringResource(R.string.dialog_cancel)) }
            },
        ) { DatePicker(state = dateState) }
    }

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
                if (isEditing) stringResource(R.string.ai_task_edit_title) else stringResource(R.string.ai_task_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                when {
                    isEditing && processorIsDevice -> stringResource(R.string.ai_task_edit_subtitle_device)
                    isEditing -> stringResource(R.string.ai_task_edit_subtitle)
                    processorIsDevice -> stringResource(R.string.ai_task_subtitle_device)
                    else -> stringResource(R.string.ai_task_subtitle)
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (!isEditing && !processorIsDevice && !mcpConnected) {
                Text(
                    stringResource(R.string.ai_task_mcp_not_connected),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            val noSpecificMeal = stringResource(R.string.ai_task_meal_none)
            ExposedDropdownMenuBox(
                expanded = mealMenuOpen,
                onExpandedChange = { mealMenuOpen = it },
            ) {
                OutlinedTextField(
                    value = mealType?.let { mealTypeDisplayName(it) } ?: noSpecificMeal,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.meal_picker_meal_label)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = mealMenuOpen) },
                    modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                )
                ExposedDropdownMenu(expanded = mealMenuOpen, onDismissRequest = { mealMenuOpen = false }) {
                    // Only an existing task can be edited into having no meal type; a new
                    // task always gets one of the four defaults, same as before.
                    if (isEditing) {
                        DropdownMenuItem(
                            text = { Text(noSpecificMeal) },
                            onClick = {
                                mealType = null
                                mealMenuOpen = false
                            },
                        )
                    }
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

            if (isEditing) {
                Text(stringResource(R.string.ai_task_date_label), style = MaterialTheme.typography.labelLarge)
                OutlinedButton(
                    onClick = { showDatePicker = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.CalendarToday, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        runCatching { LocalDate.parse(selectedDate) }.getOrNull()?.let { dayLabel(it) } ?: selectedDate,
                    )
                }
            }

            // The picker only shows a clock, and the sheet can be open for
            // yesterday's day card after midnight — name the day the time lands on.
            val parsedDate = remember(selectedDate) { runCatching { LocalDate.parse(selectedDate) }.getOrNull() }
            val dayName = parsedDate?.let { dayLabel(it) } ?: selectedDate
            Text(
                stringResource(
                    R.string.ai_task_time_day_label,
                    stringResource(R.string.ai_task_time_label),
                    dayName,
                ),
                style = MaterialTheme.typography.labelLarge,
            )
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
                if (eatenHour != null) {
                    stringResource(R.string.ai_task_time_on_day_hint, dayName)
                } else if (isEditing) {
                    stringResource(R.string.ai_task_time_hint_edit)
                } else {
                    stringResource(R.string.ai_task_time_hint)
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            OutlinedTextField(
                value = description,
                onValueChange = { description = it.take(MAX_AI_TASK_DESCRIPTION_LENGTH) },
                label = { Text(stringResource(R.string.ai_task_what_did_you_eat)) },
                placeholder = { Text(stringResource(R.string.ai_task_description_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                maxLines = 8,
            )

            if (existingPhotoUrls.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(existingPhotoUrls.toList()) { url ->
                        Box {
                            FoodImage(
                                imageUrl = url,
                                contentDescription = null,
                                modifier = Modifier.size(120.dp).clip(RoundedCornerShape(12.dp)),
                                contentScale = ContentScale.Crop,
                            )
                            FilledTonalIconButton(
                                onClick = { existingPhotoUrls.remove(url) },
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

            if (totalPhotoCount < MAX_AI_TASK_PHOTOS) {
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
                        Text(stringResource(R.string.ai_task_photo_camera), maxLines = 1, overflow = TextOverflow.Ellipsis)
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
                        Text(stringResource(R.string.ai_task_photo_gallery), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }

            if (cameraPermanentlyDenied) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        stringResource(R.string.ai_task_camera_permission_required),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                    TextButton(
                        onClick = { context.openAppSettings() },
                        contentPadding = PaddingValues(0.dp),
                    ) {
                        Text(stringResource(R.string.scan_barcode_open_settings))
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
                                if (isEditing) {
                                    val currentTask = requireNotNull(task)
                                    // Uploaded first, same as a new task's photos — the PATCH
                                    // that follows carries only the final URLs.
                                    val newPhotos =
                                        withContext(Dispatchers.IO) {
                                            attached.mapIndexed { index, bitmap -> "meal_$index.jpg" to bitmap.toJpegBytes() }
                                        }
                                    val uploadedUrls =
                                        if (newPhotos.isNotEmpty()) aiTaskRepo.uploadPhotos(newPhotos) else emptyList()
                                    val diff =
                                        buildAiTaskUpdate(
                                            original = currentTask,
                                            description = description.trim().ifBlank { null },
                                            mealType = mealType,
                                            date = selectedDate,
                                            eatenAt = buildEatenAt(selectedDate, eatenHour, eatenMinute),
                                            photoUrls = existingPhotoUrls.toList() + uploadedUrls,
                                        )
                                    aiTaskRepo.update(currentTask.id, diff.update, diff.clearedKeys.jsonKeys())
                                    isSending = false
                                    onSaved()
                                } else {
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
                                }
                            } catch (e: Exception) {
                                if (e is CancellationException) throw e
                                errorReporter.captureException(e)
                                isSending = false
                                errorMessage = if (isEditing) saveFailed else sendFailed
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = canSend && !isSending,
                ) {
                    if (isSending) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(stringResource(if (isEditing) R.string.ai_task_saving else R.string.ai_task_sending))
                    } else {
                        Text(
                            stringResource(
                                when {
                                    isEditing -> R.string.weight_save
                                    processorIsDevice -> R.string.ai_task_send_device
                                    else -> R.string.ai_task_send
                                },
                            ),
                        )
                    }
                }
            }
        }
    }
}

/** What [buildAiTaskUpdate] computed: the PATCH body plus the fields it deliberately clears. */
internal data class AiTaskEditDiff(
    val update: AiTaskUpdate,
    val clearedKeys: Set<AiTaskField>,
)

/**
 * Diffs the edited fields against [original] so the PATCH sent to the server carries
 * only what actually changed. A field the user cleared — no meal type, no eaten time,
 * or (with a photo left to satisfy the task) no description — has to travel as an
 * explicit JSON `null` rather than being merely absent, which [AiTaskField] and
 * [com.bissbilanz.util.encodePartialUpdate] read as "leave it alone". `photoUrls` is
 * always the full replacement list, never a clear, since the server does not accept a
 * null there.
 */
internal fun buildAiTaskUpdate(
    original: AiTask,
    description: String?,
    mealType: String?,
    date: String,
    eatenAt: String?,
    photoUrls: List<String>,
): AiTaskEditDiff {
    val descriptionChanged = description != original.description
    val mealTypeChanged = mealType != original.mealType
    val dateChanged = date != original.date
    val eatenAtChanged = eatenAt != original.eatenAt
    val photoUrlsChanged = photoUrls != original.photoUrls

    val clearedKeys =
        buildSet {
            if (descriptionChanged && description == null) add(AiTaskField.DESCRIPTION)
            if (mealTypeChanged && mealType == null) add(AiTaskField.MEAL_TYPE)
            if (eatenAtChanged && eatenAt == null) add(AiTaskField.EATEN_AT)
        }

    val update =
        AiTaskUpdate(
            description = description.takeIf { descriptionChanged },
            photoUrls = photoUrls.takeIf { photoUrlsChanged },
            date = date.takeIf { dateChanged },
            mealType = mealType.takeIf { mealTypeChanged },
            eatenAt = eatenAt.takeIf { eatenAtChanged },
        )
    return AiTaskEditDiff(update, clearedKeys)
}
