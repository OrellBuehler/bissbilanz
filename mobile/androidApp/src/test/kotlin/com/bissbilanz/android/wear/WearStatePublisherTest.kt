package com.bissbilanz.android.wear

import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WearStatePublisherTest {
    @Test
    fun `detects a bare API_NOT_CONNECTED failure`() {
        val error = ApiException(Status(CommonStatusCodes.API_NOT_CONNECTED))

        assertTrue(error.isWearableApiUnavailable())
    }

    @Test
    fun `detects API_NOT_CONNECTED wrapped by the Data Layer`() {
        val error = RuntimeException("publish failed", ApiException(Status(CommonStatusCodes.API_NOT_CONNECTED)))

        assertTrue(error.isWearableApiUnavailable())
    }

    @Test
    fun `keeps reporting other Play services failures`() {
        val error = ApiException(Status(CommonStatusCodes.NETWORK_ERROR))

        assertFalse(error.isWearableApiUnavailable())
    }

    @Test
    fun `keeps reporting unrelated failures`() {
        assertFalse(IOException("socket closed").isWearableApiUnavailable())
    }
}
