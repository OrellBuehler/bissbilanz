package com.bissbilanz.android.ui.components

import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
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
import com.bissbilanz.android.util.createImageUri
import com.bissbilanz.android.util.decodeUprightBitmap
import com.bissbilanz.android.util.toJpegBytes
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.AiTaskCreate
import com.bissbilanz.util.mealTypes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.koin.compose.koinInject

/**
 * Hands a meal to the MCP assistant: a description, an optional photo and the
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
    val api: BissbilanzApi = koinInject()
    val errorReporter: ErrorReporter = koinInject()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var description by remember { mutableStateOf("") }
    var mealType by remember { mutableStateOf(mealTypes.first()) }
    var mealMenuOpen by remember { mutableStateOf(false) }
    var attached by remember { mutableStateOf<Bitmap?>(null) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    var isSending by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val sendFailed = stringResource(R.string.ai_task_send_failed)

    val pickMedia =
        rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
            if (uri != null) {
                scope.launch { attached = withContext(Dispatchers.IO) { decodeUprightBitmap(context, uri) } }
            }
        }

    val takePicture =
        rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
            val uri = cameraUri
            if (success && uri != null) {
                scope.launch { attached = withContext(Dispatchers.IO) { decodeUprightBitmap(context, uri) } }
            }
        }

    val canSend = description.isNotBlank() || attached != null

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

            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text(stringResource(R.string.ai_task_what_did_you_eat)) },
                placeholder = { Text(stringResource(R.string.ai_task_description_placeholder)) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                maxLines = 8,
            )

            val bitmap = attached
            if (bitmap != null) {
                Box(modifier = Modifier.fillMaxWidth()) {
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .height(180.dp)
                                .clip(RoundedCornerShape(12.dp)),
                    )
                    FilledTonalIconButton(
                        onClick = { attached = null },
                        modifier = Modifier.align(Alignment.TopEnd).padding(8.dp),
                    ) {
                        Icon(Icons.Default.Close, stringResource(R.string.ai_task_remove_photo))
                    }
                }
            } else {
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
                                // Upload first: the task is only worth creating
                                // once its photo has a URL to point at.
                                val photoUrl =
                                    attached?.let { image ->
                                        val bytes = withContext(Dispatchers.IO) { image.toJpegBytes() }
                                        api.uploadAiTaskPhoto("meal.jpg", bytes)
                                    }
                                api.createAiTask(
                                    AiTaskCreate(
                                        date = date,
                                        description = description.trim().ifBlank { null },
                                        photoUrl = photoUrl,
                                        mealType = mealType,
                                        source = AiTaskCreate.Source.android,
                                    ),
                                )
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
