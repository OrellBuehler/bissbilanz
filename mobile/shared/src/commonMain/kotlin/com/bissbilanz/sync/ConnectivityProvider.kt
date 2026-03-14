package com.bissbilanz.sync

import kotlinx.coroutines.flow.StateFlow

expect class ConnectivityProvider {
    val isOnline: StateFlow<Boolean>
}
