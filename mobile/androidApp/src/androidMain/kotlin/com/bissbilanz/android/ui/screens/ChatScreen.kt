package com.bissbilanz.android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.outlined.AddComment
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavController
import com.bissbilanz.android.R
import com.bissbilanz.android.chat.ChatPreferences
import com.bissbilanz.android.tips.HelpSlugs
import com.bissbilanz.android.tips.openHelp
import com.bissbilanz.android.ui.components.AiTaskImageViewer
import com.bissbilanz.android.ui.components.AppTopBar
import com.bissbilanz.android.ui.components.ChatComposer
import com.bissbilanz.android.ui.components.ChatMessageList
import com.bissbilanz.android.ui.components.ChatPrivacyNotice
import com.bissbilanz.android.ui.components.ChatRow
import com.bissbilanz.android.ui.components.EmptyState
import com.bissbilanz.android.ui.components.LoadingScreen
import com.bissbilanz.android.ui.components.PullToRefreshWrapper
import com.bissbilanz.android.ui.components.chatRows
import com.bissbilanz.android.ui.components.message
import com.bissbilanz.android.ui.theme.Dimens
import com.bissbilanz.android.ui.viewmodels.ChatViewModel
import com.bissbilanz.android.util.formatIsoDateTime
import com.bissbilanz.api.generated.model.ChatConversationListItem
import com.bissbilanz.api.generated.model.ChatRun
import com.bissbilanz.chat.ChatConnection
import com.bissbilanz.chat.ChatProblems
import com.bissbilanz.chat.ChatStatus
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import kotlinx.coroutines.launch
import org.koin.compose.koinInject
import org.koin.compose.viewmodel.koinViewModel

private const val PRIVACY_URL = "https://bissbilanz.orellbuehler.ch/privacy"

/**
 * The assistant chat: the list of conversations, or the one that is open. Needs an account;
 * in Local mode it only says so, even when reached through a stale link or tab.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    navController: NavController,
    showBack: Boolean = false,
) {
    val appModeManager: AppModeManager = koinInject()
    val mode by appModeManager.mode.collectAsStateWithLifecycle()
    if (mode == AppMode.LOCAL) {
        Scaffold(
            topBar = {
                AppTopBar(title = stringResource(R.string.chat_title), onBack = if (showBack) ({ navController.popBackStack() }) else null)
            },
        ) { padding ->
            Box(modifier = Modifier.padding(padding)) {
                EmptyState(stringResource(R.string.chat_requires_account), Icons.AutoMirrored.Filled.Chat)
            }
        }
        return
    }

    val viewModel: ChatViewModel = koinViewModel()
    val chatPrefs: ChatPreferences = koinInject()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val conversations by viewModel.conversations.collectAsStateWithLifecycle()
    val capability by viewModel.capability.collectAsStateWithLifecycle()
    val pending by viewModel.pending.collectAsStateWithLifecycle()
    val draftRevision by viewModel.draftRevision.collectAsStateWithLifecycle()
    val attachments by viewModel.attachments.collectAsStateWithLifecycle()
    val photoRoom by viewModel.photoRoom.collectAsStateWithLifecycle()
    val noticeSeen by chatPrefs.noticeSeen.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val snackbarHostState = remember { SnackbarHostState() }
    val focusRequester = remember { FocusRequester() }
    var showAbout by rememberSaveable { mutableStateOf(false) }
    var renaming by rememberSaveable { mutableStateOf<String?>(null) }
    var deleting by rememberSaveable { mutableStateOf<String?>(null) }
    var gallery by remember { mutableStateOf<Pair<List<String>, Int>?>(null) }

    val locale = LocalConfiguration.current.locales[0].toLanguageTag()
    SideEffect { viewModel.clientLocale = locale }

    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) { viewModel.whileVisible() }
    }
    val resources = context.resources
    LaunchedEffect(Unit) {
        viewModel.messages.collect { snackbarHostState.showSnackbar(resources.getString(it)) }
    }

    val openId = state.openId
    // The field owns its text while the user types (a round trip through a flow drops keys
    // and moves the cursor); it is only re-read when the view model sets the draft itself.
    var draft by remember(openId, draftRevision) {
        val text = viewModel.draftFor(openId)
        mutableStateOf(TextFieldValue(text, TextRange(text.length)))
    }
    val openItem = conversations.orEmpty().firstOrNull { it.id == openId }
    val hasList = conversations.orEmpty().any { it.id != openId || !state.isNew }
    BackHandler(enabled = openId != null && hasList) { viewModel.close() }

    Scaffold(
        topBar = {
            AppTopBar(
                title = {
                    Text(
                        if (openId == null) stringResource(R.string.chat_title) else openItem?.title ?: stringResource(R.string.chat_new),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon =
                    when {
                        openId != null && hasList -> {
                            {
                                IconButton(onClick = { viewModel.close() }) {
                                    Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.chat_all_chats))
                                }
                            }
                        }
                        showBack -> {
                            {
                                IconButton(onClick = { navController.popBackStack() }) {
                                    Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.action_back))
                                }
                            }
                        }
                        else -> null
                    },
                actions = {
                    val freshChat = state.isNew && pending.none { it.conversationId == openId }
                    if (openId != null && !freshChat) {
                        IconButton(onClick = { viewModel.startNew() }) {
                            Icon(Icons.Outlined.AddComment, stringResource(R.string.chat_new))
                        }
                    }
                    ChatOverflowMenu(
                        canEdit = openId != null && !state.isNew,
                        onRename = { renaming = openId },
                        onDelete = { deleting = openId },
                        onAbout = { showAbout = true },
                    )
                },
            )
        },
        floatingActionButton = {
            if (openId == null) {
                ExtendedFloatingActionButton(
                    onClick = { viewModel.startNew() },
                    icon = { Icon(Icons.Default.Add, contentDescription = null) },
                    text = { Text(stringResource(R.string.chat_new), maxLines = 1) },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (openId == null) {
                ConversationList(
                    conversations = conversations,
                    failed = state.listFailed,
                    onOpen = viewModel::open,
                    onRename = { renaming = it },
                    onDelete = { deleting = it },
                    onRefresh = { viewModel.refreshConversations() },
                )
            } else {
                val thread = state.thread
                Column(modifier = Modifier.fillMaxSize()) {
                    val block = ChatProblems.block(capability)
                    if (block != null) Banner(stringResource(block.message()), stringResource(R.string.chat_blocked_hint))
                    if (!noticeSeen) {
                        ChatPrivacyNotice(
                            onSeen = chatPrefs::markNoticeSeen,
                            onPrivacyPolicy = { uriHandler.openUri(PRIVACY_URL) },
                            modifier = Modifier.padding(horizontal = Dimens.ScreenPadding, vertical = Dimens.ListGap),
                        )
                    }
                    if (thread != null && thread.activeRun != null) {
                        when {
                            state.followFailed ->
                                Banner(
                                    stringResource(R.string.chat_connection_lost),
                                    null,
                                    actionLabel = stringResource(R.string.action_retry),
                                ) {
                                    viewModel.retryLoad()
                                }
                            state.connection == ChatConnection.RECONNECTING -> Banner(stringResource(R.string.chat_reconnecting), null)
                        }
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        when {
                            thread == null && state.threadFailed ->
                                EmptyState(stringResource(R.string.chat_thread_load_failed), Icons.AutoMirrored.Filled.Chat) {
                                    OutlinedButton(
                                        onClick = { viewModel.retryLoad() },
                                    ) { Text(stringResource(R.string.action_retry), maxLines = 1) }
                                }
                            thread == null -> LoadingScreen()
                            else -> {
                                val outbox = pending.filter { it.conversationId == openId && it.accepted == null }
                                val rows =
                                    remember(thread, outbox) {
                                        chatRows(thread.messages, outbox, thread.activeRun, thread.unansweredRuns)
                                    }
                                // Keyed so another conversation starts with its own scroll position.
                                key(openId) {
                                    ConversationView(
                                        rows = rows,
                                        viewModel = viewModel,
                                        stateDeciding = state.deciding,
                                        activeRun = thread.activeRun,
                                        onSuggestion = { suggestion ->
                                            viewModel.setDraft(suggestion)
                                            focusRequester.requestFocus()
                                        },
                                        onOpenPhoto = { urls, index -> gallery = urls to index },
                                    )
                                }
                            }
                        }
                    }
                    ChatComposer(
                        text = draft,
                        onTextChange = {
                            draft = it
                            viewModel.updateDraft(it.text)
                        },
                        attachments = attachments,
                        photoRoom = photoRoom,
                        onAttach = viewModel::attach,
                        onRemoveAttachment = viewModel::removeAttachment,
                        canSend = viewModel.canSend(draft.text) && thread != null,
                        working = state.activeRunWorking,
                        stopping = state.stopping,
                        enabled = block == null && thread != null,
                        onSend = viewModel::send,
                        onStop = viewModel::stop,
                        focusRequester = focusRequester,
                    )
                }
            }
        }
    }

    if (showAbout) {
        AlertDialog(
            onDismissRequest = { showAbout = false },
            icon = { Icon(Icons.Default.Info, contentDescription = null) },
            title = { Text(stringResource(R.string.chat_privacy_title)) },
            text = {
                Column {
                    Text(stringResource(R.string.chat_privacy_text))
                    TextButton(onClick = { uriHandler.openUri(PRIVACY_URL) }, contentPadding = PaddingValues(0.dp)) {
                        Text(stringResource(R.string.settings_privacy_policy), maxLines = 1)
                    }
                    TextButton(onClick = { openHelp(context, HelpSlugs.AI_ASSISTANT) }, contentPadding = PaddingValues(0.dp)) {
                        Text(stringResource(R.string.chat_help), maxLines = 1)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    showAbout = false
                    chatPrefs.markNoticeSeen()
                }) { Text(stringResource(R.string.chat_privacy_ok), maxLines = 1) }
            },
        )
    }

    renaming?.let { id ->
        val current =
            conversations
                .orEmpty()
                .firstOrNull { it.id == id }
                ?.title
                .orEmpty()
        RenameDialog(
            initial = current,
            onDismiss = { renaming = null },
            onSave = { title ->
                viewModel.rename(id, title)
                renaming = null
            },
        )
    }

    deleting?.let { id ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text(stringResource(R.string.chat_delete)) },
            text = { Text(stringResource(R.string.chat_delete_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.delete(id)
                        deleting = null
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text(stringResource(R.string.action_delete), maxLines = 1) }
            },
            dismissButton = {
                TextButton(onClick = { deleting = null }) { Text(stringResource(R.string.dialog_cancel), maxLines = 1) }
            },
        )
    }

    gallery?.let { (urls, index) ->
        AiTaskImageViewer(imageUrls = urls, initialIndex = index, onDismiss = { gallery = null })
    }
}

@Composable
private fun ConversationView(
    rows: List<ChatRow>,
    viewModel: ChatViewModel,
    stateDeciding: Set<String>,
    activeRun: ChatRun?,
    onSuggestion: (String) -> Unit,
    onOpenPhoto: (List<String>, Int) -> Unit,
) {
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    // Follows new content while the user is at the newest message; scrolling up to read
    // earlier messages stops that until they come back down.
    var stickToNewest by remember { mutableStateOf(true) }
    LaunchedEffect(listState) {
        snapshotFlow { listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset < 48 }
            .collect { atNewest -> if (listState.isScrollInProgress) stickToNewest = atNewest }
    }
    val newestKey = rows.firstOrNull()?.key
    LaunchedEffect(newestKey) {
        if (stickToNewest && rows.isNotEmpty()) listState.animateScrollToItem(0)
    }
    Box(modifier = Modifier.fillMaxSize()) {
        ChatMessageList(
            rows = rows,
            listState = listState,
            activeRun = activeRun,
            deciding = stateDeciding,
            onApprove = viewModel::approve,
            onReject = viewModel::reject,
            onRetry = viewModel::retry,
            onDiscard = viewModel::discard,
            onNewChatFromRun = viewModel::startNewFromRun,
            onNewChatWith = viewModel::startNewWith,
            onOpenPhoto = onOpenPhoto,
            onSuggestion = onSuggestion,
        )
        if (!stickToNewest) {
            SmallFloatingActionButton(
                onClick = {
                    stickToNewest = true
                    scope.launch { listState.animateScrollToItem(0) }
                },
                modifier = Modifier.align(Alignment.BottomEnd).padding(Dimens.ScreenPadding),
            ) {
                Icon(Icons.Default.KeyboardArrowDown, stringResource(R.string.chat_scroll_to_newest))
            }
        }
    }
}

@Composable
private fun Banner(
    text: String,
    detail: String?,
    actionLabel: String? = null,
    onAction: () -> Unit = {},
) {
    Surface(color = MaterialTheme.colorScheme.secondaryContainer, contentColor = MaterialTheme.colorScheme.onSecondaryContainer) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Dimens.ScreenPadding, vertical = 8.dp)
                    .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        ) {
            Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(18.dp))
            Column(modifier = Modifier.weight(1f).padding(start = 8.dp)) {
                Text(text, style = MaterialTheme.typography.bodySmall)
                detail?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
            if (actionLabel != null) {
                TextButton(onClick = onAction) { Text(actionLabel, maxLines = 1) }
            }
        }
    }
}

@Composable
private fun ChatOverflowMenu(
    canEdit: Boolean,
    onRename: () -> Unit,
    onDelete: () -> Unit,
    onAbout: () -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) {
            Icon(Icons.Default.MoreVert, stringResource(R.string.chat_more_actions))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (canEdit) {
                DropdownMenuItem(text = { Text(stringResource(R.string.chat_rename)) }, onClick = {
                    open = false
                    onRename()
                })
                DropdownMenuItem(text = { Text(stringResource(R.string.chat_delete)) }, onClick = {
                    open = false
                    onDelete()
                })
            }
            DropdownMenuItem(text = { Text(stringResource(R.string.chat_about)) }, onClick = {
                open = false
                onAbout()
            })
        }
    }
}

@Composable
private fun ConversationList(
    conversations: List<ChatConversationListItem>?,
    failed: Boolean,
    onOpen: (String) -> Unit,
    onRename: (String) -> Unit,
    onDelete: (String) -> Unit,
    onRefresh: suspend () -> Unit,
) {
    PullToRefreshWrapper(onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        when {
            conversations == null && failed -> EmptyState(stringResource(R.string.chat_list_load_failed), Icons.AutoMirrored.Filled.Chat)
            conversations == null -> LoadingScreen()
            conversations.isEmpty() -> EmptyState(stringResource(R.string.chat_list_empty), Icons.AutoMirrored.Filled.Chat)
            else ->
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = Dimens.FabClearance),
                ) {
                    items(conversations, key = { it.id }) { conversation ->
                        ConversationRow(conversation, onOpen, onRename, onDelete)
                        HorizontalDivider()
                    }
                }
        }
    }
}

@Composable
private fun ConversationRow(
    conversation: ChatConversationListItem,
    onOpen: (String) -> Unit,
    onRename: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    val title = conversation.title ?: stringResource(R.string.chat_new)
    val answering = ChatStatus.isActiveRun(conversation.activeRun?.status)
    ListItem(
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        headlineContent = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            if (answering) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CircularProgressIndicator(modifier = Modifier.size(12.dp), strokeWidth = 2.dp)
                    Text(
                        stringResource(
                            if (conversation.activeRun?.status == ChatStatus.AWAITING_CONFIRMATION) {
                                R.string.chat_list_waiting
                            } else {
                                R.string.chat_list_answering
                            },
                        ),
                        maxLines = 1,
                    )
                }
            } else {
                Text(formatIsoDateTime(conversation.lastMessageAt), maxLines = 1)
            }
        },
        leadingContent = { Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
        trailingContent = {
            var open by remember { mutableStateOf(false) }
            Box {
                IconButton(onClick = { open = true }) {
                    Icon(Icons.Default.MoreVert, stringResource(R.string.chat_actions_for, title))
                }
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    DropdownMenuItem(text = { Text(stringResource(R.string.chat_rename)) }, onClick = {
                        open = false
                        onRename(conversation.id)
                    })
                    DropdownMenuItem(text = { Text(stringResource(R.string.chat_delete)) }, onClick = {
                        open = false
                        onDelete(conversation.id)
                    })
                }
            }
        },
        modifier = Modifier.clickable { onOpen(conversation.id) },
    )
}

@Composable
private fun RenameDialog(
    initial: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var title by rememberSaveable { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.chat_rename_title)) },
        text = {
            OutlinedTextField(
                value = title,
                onValueChange = { title = it.take(ChatViewModel.MAX_TITLE_CHARS) },
                label = { Text(stringResource(R.string.chat_rename_label)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = { TextButton(onClick = { onSave(title) }) { Text(stringResource(R.string.action_save), maxLines = 1) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.dialog_cancel), maxLines = 1) } },
    )
}
