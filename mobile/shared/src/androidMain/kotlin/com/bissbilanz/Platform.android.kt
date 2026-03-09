package com.bissbilanz

import io.ktor.client.engine.*
import io.ktor.client.engine.okhttp.*

actual fun createHttpEngine(): HttpClientEngine = OkHttp.create()
