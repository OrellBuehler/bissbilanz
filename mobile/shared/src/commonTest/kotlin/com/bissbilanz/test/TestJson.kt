package com.bissbilanz.test

import kotlinx.serialization.json.Json

val testJson =
    Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
    }
