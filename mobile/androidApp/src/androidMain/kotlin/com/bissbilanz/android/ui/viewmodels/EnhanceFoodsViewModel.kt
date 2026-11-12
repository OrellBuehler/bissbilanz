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

    private var latestRequest = 0
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
        val request = ++latestRequest
        try {
            val next = foodRepo.foodEnrichmentStatus()
            if (request == latestRequest) apply(next)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            if (request != latestRequest) return
            if (e !is FoodEnrichmentException) errorReporter.captureException(e)
            pollRetryAfterMs = (e as? FoodEnrichmentException)?.retryAfterSeconds?.times(1000) ?: 0L
            _state.update { it.copy(loadFailures = it.loadFailures + 1) }
        }
    }

    private fun apply(next: FoodEnrichmentStatusResponse) {
        val finished = _state.value.isActive && next.job?.isActive != true
        pollRetryAfterMs = 0L
        _state.update { it.copy(status = next, loadFailures = 0) }
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
        val request = ++latestRequest
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            try {
                val next = call()
                if (request == latestRequest) apply(next)
            } catch (e: FoodEnrichmentException) {
                when (e.reason) {
                    FoodEnrichmentException.Reason.OFFLINE -> _snackbarMessage.value = UiMessage(R.string.enhance_foods_offline)
                    FoodEnrichmentException.Reason.RATE_LIMITED -> rateLimit(e.retryAfterSeconds)
                    else -> {
                        errorReporter.captureException(e)
                        _snackbarMessage.value = UiMessage(R.string.enhance_foods_action_failed)
                    }
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
                _snackbarMessage.value = UiMessage(R.string.enhance_foods_action_failed)
            } finally {
                _state.update { it.copy(busy = false) }
            }
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
