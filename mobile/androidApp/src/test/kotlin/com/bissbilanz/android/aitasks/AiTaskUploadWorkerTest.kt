package com.bissbilanz.android.aitasks

import com.bissbilanz.api.ApiException
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Mirrors iOS's `AiTaskStore.isRetryable`: a 4xx other than the two transient
 * ones (408, 429) means the server rejected the payload itself, so retrying the
 * same bytes cannot help and the upload must be kept in the queue as a final,
 * non-retryable failure instead of being retried forever or silently dropped.
 */
class AiTaskUploadWorkerTest {
    @Test
    fun `a 4xx other than 408 or 429 is not retryable`() {
        assertFalse(AiTaskUploadWorker.isRetryable(ApiException("bad request", 400)))
        assertFalse(AiTaskUploadWorker.isRetryable(ApiException("not found", 404)))
        assertFalse(AiTaskUploadWorker.isRetryable(ApiException("payload too large", 413)))
        assertFalse(AiTaskUploadWorker.isRetryable(ApiException("conflict", 409)))
    }

    @Test
    fun `408 and 429 are retryable despite being 4xx`() {
        assertTrue(AiTaskUploadWorker.isRetryable(ApiException("timeout", 408)))
        assertTrue(AiTaskUploadWorker.isRetryable(ApiException("rate limited", 429)))
    }

    @Test
    fun `5xx and below-400 codes are retryable`() {
        assertTrue(AiTaskUploadWorker.isRetryable(ApiException("server error", 500)))
        assertTrue(AiTaskUploadWorker.isRetryable(ApiException("unknown", 0)))
    }

    @Test
    fun `a non-API exception, such as a network failure, is retryable`() {
        assertTrue(AiTaskUploadWorker.isRetryable(java.io.IOException("no connection")))
    }
}
