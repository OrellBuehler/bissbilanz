package com.bissbilanz.android.ui.viewmodels

import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.aitasks.AiTaskUploadQueue
import com.bissbilanz.android.aitasks.QueuedAiTaskUpload
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.errorCode
import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.repository.AiTaskRepository
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.util.AI_TASK_REPLY_MAX_CHARS
import com.bissbilanz.util.ReplyBlock
import com.bissbilanz.util.hasActiveClaudeWork
import com.bissbilanz.util.unreadReplies
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import java.io.IOException
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

enum class ReplyFailure(
    @StringRes val message: Int,
) {
    OFFLINE(R.string.ai_tasks_reply_offline),
    NETWORK(R.string.ai_tasks_reply_network),
    STILL_SENDING(R.string.ai_tasks_reply_still_sending),
    TOO_MANY_REQUESTS(R.string.ai_tasks_reply_too_many),
    INVALID(R.string.ai_tasks_reply_invalid),
    SIGNED_OUT(R.string.ai_tasks_reply_signed_out),
    UNKNOWN(R.string.ai_tasks_reply_error),
}

@StringRes
fun ReplyBlock.message(): Int =
    when (this) {
        ReplyBlock.NOT_PROCESSED_BY_SERVER -> R.string.ai_tasks_reply_blocked_not_server
        ReplyBlock.NOT_COMPLETED -> R.string.ai_tasks_reply_blocked_not_completed
        ReplyBlock.CORRECTION_IN_FLIGHT -> R.string.ai_tasks_reply_blocked_in_flight
        ReplyBlock.REPLY_LIMIT_REACHED -> R.string.ai_tasks_reply_blocked_limit
        ReplyBlock.FAILED_TOO_OFTEN -> R.string.ai_tasks_reply_blocked_failing
        ReplyBlock.PROCESSOR_UNAVAILABLE -> R.string.ai_tasks_reply_blocked_unavailable
        ReplyBlock.BUDGET_EXHAUSTED -> R.string.ai_tasks_reply_blocked_budget
        ReplyBlock.RATE_LIMITED -> R.string.ai_tasks_reply_blocked_rate
        ReplyBlock.OTHER -> R.string.ai_tasks_reply_blocked_other
    }

data class ReplyDraft(
    val text: String = "",
    val sending: Boolean = false,
    val failure: ReplyFailure? = null,
    val retryAfterSeconds: Long? = null,
    val waiting: Boolean = false,
) {
    val canSend: Boolean
        get() {
            val trimmed = text.trim()
            return !sending && !waiting && trimmed.isNotEmpty() && trimmed.length <= AI_TASK_REPLY_MAX_CHARS
        }
}

class AiTasksViewModel(
    private val aiTaskRepo: AiTaskRepository,
    private val uploadQueue: AiTaskUploadQueue,
    private val errorReporter: ErrorReporter,
    private val entryRepo: EntryRepository,
    private val connectivity: ConnectivityProvider,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {
    enum class Filter(
        @StringRes val emptyMessage: Int,
    ) {
        OPEN(R.string.ai_tasks_empty_open),
        COMPLETED(R.string.ai_tasks_empty_completed),
        DISMISSED(R.string.ai_tasks_empty_dismissed),
        ;

        fun matches(task: AiTask): Boolean =
            when (this) {
                OPEN -> task.status == AiTask.Status.pending
                COMPLETED -> task.status == AiTask.Status.completed
                DISMISSED -> task.status == AiTask.Status.dismissed
            }
    }

    // Backed by SavedStateHandle so the chosen tab survives process death.
    val filter: StateFlow<Filter> =
        savedStateHandle
            .getStateFlow(KEY_FILTER, Filter.OPEN.name)
            .map { runCatching { Filter.valueOf(it) }.getOrDefault(Filter.OPEN) }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), Filter.OPEN)

    val visibleTasks: StateFlow<List<AiTask>> =
        combine(aiTaskRepo.tasks, filter) { tasks, active -> tasks.filter { active.matches(it) } }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /** Meals still queued for upload, shown only on the Open tab like their iOS counterpart. */
    val queuedUploads: StateFlow<List<QueuedAiTaskUpload>> =
        combine(uploadQueue.items, filter) { uploads, active -> if (active == Filter.OPEN) uploads else emptyList() }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    fun selectFilter(value: Filter) {
        savedStateHandle[KEY_FILTER] = value.name
        savedStateHandle[KEY_FILTER_CHOSEN] = true
    }

    private val _loadFailed = MutableStateFlow(false)
    val loadFailed: StateFlow<Boolean> = _loadFailed.asStateFlow()

    /** Initial load: pull, then clear the unread badge because the user is looking at it. */
    fun load() {
        viewModelScope.launch {
            _isLoading.value = true
            _loadFailed.value = false
            try {
                aiTaskRepo.refresh()
                // Show the tab holding what the user came here for. Opening from a
                // dismissal notification would otherwise land on Open, which by
                // definition cannot contain the task they just tapped. A separate key,
                // because getStateFlow already stored the default under KEY_FILTER.
                if (savedStateHandle.get<Boolean>(KEY_FILTER_CHOSEN) != true) {
                    when {
                        aiTaskRepo.unreadCount() > 0 -> savedStateHandle[KEY_FILTER] = Filter.DISMISSED.name
                        aiTaskRepo.unreadReplyCount() > 0 -> savedStateHandle[KEY_FILTER] = Filter.COMPLETED.name
                    }
                }
                aiTaskRepo.acknowledgeAll()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                _loadFailed.value = true
                errorReporter.captureException(e)
            }
            _isLoading.value = false
        }
    }

    /** Suspends so pull-to-refresh keeps its spinner up until the pull actually ends. */
    suspend fun refresh() {
        _loadFailed.value = false
        try {
            aiTaskRepo.refresh()
            aiTaskRepo.acknowledgeAll()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            _loadFailed.value = true
            errorReporter.captureException(e)
        }
    }

    /**
     * While any pending task is queued, running or retrying on Claude's side, or a correction
     * of a completed one is, re-reads the list every [POLL_INTERVAL_MS] as long as the device
     * is online. Runs until cancelled; the screen launches it only while visible, and a second
     * call while one runs returns at once. A failed read is already reported by the repository;
     * the next tick retries.
     */
    suspend fun pollWhileClaudeWorks() {
        if (!pollLock.tryLock()) return
        try {
            combine(aiTaskRepo.tasks.map { it.hasActiveClaudeWork() }, connectivity.isOnline) { active, online ->
                active && online
            }.distinctUntilChanged()
                .collectLatest { active ->
                    while (active) {
                        delay(POLL_INTERVAL_MS)
                        try {
                            aiTaskRepo.refresh()
                            aiTaskRepo.acknowledgeAll(quiet = true)
                        } catch (e: Exception) {
                            if (e is kotlinx.coroutines.CancellationException) throw e
                            // The repository already reported the failure; the next tick retries.
                        }
                    }
                }
        } finally {
            pollLock.unlock()
        }
    }

    private val pollLock = Mutex()

    private val _newReplyIds = MutableStateFlow<Set<String>>(emptySet())

    val newReplyIds: StateFlow<Set<String>> = _newReplyIds.asStateFlow()

    suspend fun markDisplayedRepliesRead(displayedTaskIds: Flow<Set<String>>) {
        combine(displayedTaskIds, aiTaskRepo.tasks, connectivity.isOnline) { displayed, tasks, online ->
            if (!online) {
                emptySet()
            } else {
                tasks.filter { it.id in displayed }.flatMapTo(mutableSetOf()) { task -> task.unreadReplies().map { it.id } }
            }
        }.distinctUntilChanged()
            .collect { ids ->
                if (ids.isEmpty()) return@collect
                _newReplyIds.update { it + ids }
                aiTaskRepo.markRepliesRead(ids)
            }
    }

    private val _replyDrafts = MutableStateFlow<Map<String, ReplyDraft>>(emptyMap())

    val replyDrafts: StateFlow<Map<String, ReplyDraft>> = _replyDrafts.asStateFlow()

    private val replyKeys = mutableMapOf<String, Pair<String, String>>()

    private val replyWaits = mutableMapOf<String, Job>()

    fun updateReplyText(
        taskId: String,
        text: String,
    ) {
        updateDraft(taskId) { if (sending) this else copy(text = text, failure = if (waiting) failure else null) }
    }

    @OptIn(ExperimentalUuidApi::class)
    fun sendReply(taskId: String) {
        val draft = _replyDrafts.value[taskId] ?: return
        if (!draft.canSend) return
        val text = draft.text.trim()
        if (!connectivity.isOnline.value) {
            updateDraft(taskId) { copy(failure = ReplyFailure.OFFLINE) }
            return
        }
        val key = replyKeys[taskId]?.takeIf { it.first == text }?.second ?: Uuid.random().toString()
        replyKeys[taskId] = text to key
        updateDraft(taskId) { copy(sending = true, failure = null, retryAfterSeconds = null) }
        viewModelScope.launch {
            try {
                aiTaskRepo.reply(taskId, text, key)
                replyKeys.remove(taskId)
                _replyDrafts.update { it - taskId }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                onReplyFailed(taskId, e)
            }
        }
    }

    private suspend fun onReplyFailed(
        taskId: String,
        e: Exception,
    ) {
        val api = e as? ApiException
        val status = api?.statusCode
        val code = api?.errorCode()
        if (status == 404) {
            replyKeys.remove(taskId)
            replyWaits.remove(taskId)?.cancel()
            _replyDrafts.update { it - taskId }
            _messages.emit(R.string.ai_tasks_reply_task_gone)
            return
        }
        val blocked = status == 403 || status == 409 || (status == 429 && code in CODED_LIMITS)
        val failure =
            when {
                blocked -> null
                e is UnauthorizedException || status == 401 -> ReplyFailure.SIGNED_OUT
                api == null -> if (e is IOException) ReplyFailure.NETWORK else ReplyFailure.UNKNOWN
                status == 400 -> ReplyFailure.INVALID
                status == 429 -> ReplyFailure.TOO_MANY_REQUESTS
                status == 503 && code == REQUEST_IN_PROGRESS -> ReplyFailure.STILL_SENDING
                status != null && status >= 500 -> ReplyFailure.NETWORK
                else -> ReplyFailure.UNKNOWN
            }
        if (status == 422) replyKeys.remove(taskId)
        if (failure == ReplyFailure.INVALID || failure == ReplyFailure.UNKNOWN || (failure == ReplyFailure.NETWORK && api != null)) {
            errorReporter.captureException(e)
        }
        val wait =
            api?.retryAfterSeconds
                ?: if (failure == ReplyFailure.STILL_SENDING) DEFAULT_IN_PROGRESS_WAIT_SECONDS else null
        updateDraft(taskId) { copy(sending = false, failure = failure, retryAfterSeconds = wait, waiting = wait != null) }
        if (blocked) _messages.emit(ReplyBlock.of(code).message())
        replyWaits.remove(taskId)?.cancel()
        if (wait != null) {
            replyWaits[taskId] =
                viewModelScope.launch {
                    delay(wait * 1000)
                    replyWaits.remove(taskId)
                    updateDraft(taskId) { copy(waiting = false, failure = null, retryAfterSeconds = null) }
                }
        }
    }

    private fun updateDraft(
        taskId: String,
        transform: ReplyDraft.() -> ReplyDraft,
    ) {
        _replyDrafts.update { drafts -> drafts + (taskId to (drafts[taskId] ?: ReplyDraft()).transform()) }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            runCatching { aiTaskRepo.delete(id) }
                .onFailure { errorReporter.captureException(it as? Exception ?: Exception(it)) }
        }
    }

    private val _busyTaskId = MutableStateFlow<String?>(null)

    /** The task whose proposal is being logged or discarded; its buttons are disabled meanwhile. */
    val busyTaskId: StateFlow<String?> = _busyTaskId.asStateFlow()

    private val _messages = MutableSharedFlow<Int>(extraBufferCapacity = 1)

    /** One-shot snackbar messages as string resource ids, resolved by the screen. */
    val messages: SharedFlow<Int> = _messages.asSharedFlow()

    /**
     * Logs exactly the given [itemIds] of a Claude proposal. A failure keeps the card
     * and the caller's selection so the user can retry. A 409, 404 or 400 means the proposal is
     * gone: the repository has already re-read the list, and this is an expected outcome,
     * not an error to report. A 429 is a rate limit and likewise not reported.
     */
    fun acceptProposal(
        taskId: String,
        itemIds: List<String>,
    ) {
        if (_busyTaskId.value != null) return
        _busyTaskId.value = taskId
        viewModelScope.launch {
            var loggedOn: String? = null
            try {
                loggedOn = aiTaskRepo.acceptProposal(taskId, itemIds).date
                _messages.emit(R.string.ai_tasks_proposal_logged)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                when {
                    e.isProposalGone() || (e is ApiException && e.statusCode == 400) ->
                        _messages.emit(R.string.ai_tasks_proposal_accept_conflict)
                    e is ApiException && e.statusCode == 429 -> _messages.emit(R.string.ai_tasks_proposal_accept_failed)
                    else -> {
                        errorReporter.captureException(e)
                        _messages.emit(R.string.ai_tasks_proposal_accept_failed)
                    }
                }
            } finally {
                _busyTaskId.value = null
            }
            loggedOn?.let { refreshEntries(it) }
        }
    }

    fun discardProposal(taskId: String) {
        if (_busyTaskId.value != null) return
        _busyTaskId.value = taskId
        viewModelScope.launch {
            try {
                aiTaskRepo.dismiss(taskId)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                if (e.isProposalGone()) {
                    refreshTasksAfterConflict()
                    _messages.emit(R.string.ai_tasks_proposal_accept_conflict)
                } else {
                    errorReporter.captureException(e)
                    _messages.emit(R.string.ai_task_save_failed)
                }
            } finally {
                _busyTaskId.value = null
            }
        }
    }

    private fun Exception.isProposalGone() = this is ApiException && (statusCode == 409 || statusCode == 404)

    private suspend fun refreshTasksAfterConflict() {
        try {
            aiTaskRepo.refresh()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    private suspend fun refreshEntries(date: String) {
        try {
            entryRepo.refresh(date)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    companion object {
        private const val KEY_FILTER = "ai_tasks_filter"
        private const val KEY_FILTER_CHOSEN = "ai_tasks_filter_chosen"
        const val POLL_INTERVAL_MS = 10_000L
        const val DEFAULT_IN_PROGRESS_WAIT_SECONDS = 2L
        private const val REQUEST_IN_PROGRESS = "request_in_progress"
        private val CODED_LIMITS = setOf("rate_limited", "failed_too_often")
    }
}
