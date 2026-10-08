package com.bissbilanz.android

import com.bissbilanz.api.ApiException
import com.bissbilanz.api.UnauthorizedException
import kotlin.test.Test
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
}
