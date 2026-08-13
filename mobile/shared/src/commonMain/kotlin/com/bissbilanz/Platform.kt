package com.bissbilanz

import io.ktor.client.engine.*

expect fun createHttpEngine(): HttpClientEngine
