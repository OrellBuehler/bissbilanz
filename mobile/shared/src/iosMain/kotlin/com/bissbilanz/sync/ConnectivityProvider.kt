package com.bissbilanz.sync

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

actual class ConnectivityProvider {
    private val _isOnline = MutableStateFlow(true)
    actual val isOnline: StateFlow<Boolean> = _isOnline.asStateFlow()
}
