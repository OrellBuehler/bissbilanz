package com.bissbilanz.android

import com.bissbilanz.api.ApiException
import com.bissbilanz.api.UnauthorizedException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SentryErrorReporterTest {
    @Test
    fun gatewayStatusesAreExpectedOutages() {
        listOf(502, 503, 504).forEach { status ->
            assertTrue(ApiException("GET /api/entries failed: HTTP $status", status).isGatewayError(), "HTTP $status")
        }
    }

    @Test
    fun serverAndClientErrorsStillReport() {
        listOf(0, 400, 404, 409, 500, 501, 505).forEach { status ->
            assertFalse(ApiException("GET /api/entries failed: HTTP $status", status).isGatewayError(), "HTTP $status")
        }
    }

    @Test
    fun otherThrowablesAreNotGatewayErrors() {
        assertFalse(UnauthorizedException().isGatewayError())
        assertFalse(IllegalStateException("502").isGatewayError())
    }

    @Test
    fun cancelledCoroutinesAreNotReported() {
        assertTrue(CancellationException("Job was cancelled").isCoroutineCancellation())
    }

    @Test
    fun timeoutsAndFailuresCausedByACancellationStillReport() {
        val timeout =
            assertFailsWith<TimeoutCancellationException> {
                runBlocking { withTimeout(1) { delay(1_000) } }
            }
        assertFalse(timeout.isCoroutineCancellation())
        assertFalse(IllegalStateException("boom", CancellationException("cancelled")).isCoroutineCancellation())
        assertFalse(ApiException("GET /api/entries failed: HTTP 500", 500).isCoroutineCancellation())
    }
}
