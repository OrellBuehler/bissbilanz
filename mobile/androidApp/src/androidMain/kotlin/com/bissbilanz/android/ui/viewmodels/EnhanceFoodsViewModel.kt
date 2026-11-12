package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.api.generated.model.FoodEnrichmentStatusResponse
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.FoodEnrichmentException
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.isActive
import com.bissbilanz.sync.ConnectivityProvider
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class EnhanceFoodsViewModel(
    private val foodRepo: FoodRepository,
    private val connectivityProvider: ConnectivityProvider,
    private val errorReporter: ErrorReporter,
    appModeManager: AppModeManager,
) : ViewModel() {
    val isLocalMode = appModeManager.isLocal

    data class UiState(
        val status: FoodEnrichmentStatusResponse? = null,
        val loadFailures: Int = 0,
        val busy: Boolean = false,
        val rateLimited: Boolean = false,
        val hasBarcodeFoods: Boolean = true,
    ) {
        val job get() = status?.job
        val isActive get() = job?.isActive == true
        val loadStalled get() = loadFailures >= MAX_LOAD_FAILURES || (loadFailures > 0 && !isActive)
        val canStart get() = !busy && !rateLimited && !isActive && (status?.candidates ?: 0) > 0
        val canStop get() = !busy && !rateLimited && isActive
    }

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    val isOnline: StateFlow<Boolean> = connectivityProvider.isOnline

    private val _snackbarMessage = MutableStateFlow<UiMessage?>(null)
    val snackbarMessage: StateFlow<UiMessage?> = _snackbarMessage.asStateFlow()

    private var latestRead = 0
    private var actionGeneration = 0
    private var pollRetryAfterMs = 0L
    private var rateLimitJob: Job? = null

    suspend fun pollWhileVisible() {
        if (isLocalMode) return
        connectivityProvider.isOnline.collectLatest { online ->
            if (!online) return@collectLatest
            load()
            _state
                .map { it.isActive && !it.loadStalled && !it.busy }
                .distinctUntilChanged()
                .collectLatest { polling ->
                    while (polling) {
                        delay(nextPollDelayMs())
                        load()
                    }
                }
        }
    }

    suspend fun refresh() {
        if (isLocalMode || !connectivityProvider.isOnline.value) return
        _state.update { it.copy(loadFailures = 0) }
        load()
    }

    fun retry() {
        if (isLocalMode) return
        _state.update { it.copy(loadFailures = 0) }
        viewModelScope.launch { load() }
    }

    fun start() = act { foodRepo.startFoodEnrichment() }

    fun stop() = act { foodRepo.cancelFoodEnrichment() }

    fun clearSnackbar() {
        _snackbarMessage.value = null
    }

    private fun nextPollDelayMs(): Long {
        val backoff = POLL_INTERVAL_MS shl _state.value.loadFailures.coerceAtMost(MAX_LOAD_FAILURES)
        return maxOf(backoff, pollRetryAfterMs)
    }

    private suspend fun load() {
        if (_state.value.busy) return
        val read = ++latestRead
        val generation = actionGeneration

        fun current() = read == latestRead && generation == actionGeneration && !_state.value.busy
        try {
            val next = foodRepo.foodEnrichmentStatus()
            val hasBarcodeFoods = hasBarcodeFoods(next)
            if (current()) apply(next, hasBarcodeFoods)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            if (e !is FoodEnrichmentException) errorReporter.captureException(e)
            if (!current()) return
            pollRetryAfterMs = (e as? FoodEnrichmentException)?.retryAfterSeconds?.times(1000) ?: 0L
            _state.update { it.copy(loadFailures = it.loadFailures + 1) }
        }
    }

    private suspend fun hasBarcodeFoods(status: FoodEnrichmentStatusResponse) =
        status.candidates > 0 || status.job?.isActive == true || foodRepo.hasBarcodeFoods()

    private fun apply(
        next: FoodEnrichmentStatusResponse,
        hasBarcodeFoods: Boolean,
    ) {
        val finished = _state.value.isActive && next.job?.isActive != true
        pollRetryAfterMs = 0L
        _state.update { it.copy(status = next, loadFailures = 0, hasBarcodeFoods = hasBarcodeFoods) }
        if (finished) viewModelScope.launch { refreshFoods() }
    }

    private suspend fun refreshFoods() {
        try {
            foodRepo.refreshFoods()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    private fun act(call: suspend () -> FoodEnrichmentStatusResponse) {
        val current = _state.value
        if (isLocalMode || current.busy || current.rateLimited) return
        if (!connectivityProvider.isOnline.value) {
            _snackbarMessage.value = UiMessage(R.string.enhance_foods_offline)
            return
        }
        actionGeneration++
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            var outcomeUnknown = false
            try {
                val next = call()
                apply(next, hasBarcodeFoods(next))
            } catch (e: FoodEnrichmentException) {
                when (e.reason) {
                    FoodEnrichmentException.Reason.OFFLINE -> {
                        _snackbarMessage.value = UiMessage(R.string.enhance_foods_offline)
                        outcomeUnknown = e.cause != null
                    }
                    FoodEnrichmentException.Reason.RATE_LIMITED -> rateLimit(e.retryAfterSeconds)
                    else -> {
                        errorReporter.captureException(e)
                        _snackbarMessage.value = UiMessage(R.string.enhance_foods_action_failed)
                        outcomeUnknown = true
                    }
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.enhance_foods_action_failed)
                outcomeUnknown = true
            } finally {
                _state.update { it.copy(busy = false) }
            }
            if (outcomeUnknown && connectivityProvider.isOnline.value) load()
        }
    }

    private fun rateLimit(retryAfterSeconds: Long?) {
        _state.update { it.copy(rateLimited = true) }
        rateLimitJob?.cancel()
        rateLimitJob =
            viewModelScope.launch {
                delay((retryAfterSeconds ?: DEFAULT_RETRY_AFTER_SECONDS) * 1000)
                _state.update { it.copy(rateLimited = false) }
            }
    }

    companion object {
        const val POLL_INTERVAL_MS = 3_000L
        const val MAX_LOAD_FAILURES = 3
        const val DEFAULT_RETRY_AFTER_SECONDS = 60L
    }
}
