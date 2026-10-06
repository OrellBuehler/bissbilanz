package com.bissbilanz.sync

/**
 * Lets the sync queue wait for foods that were imported in bulk and have not reached the
 * server yet: a diary entry or recipe that points at one would be refused until it is there.
 */
fun interface BulkFoodGate {
    /**
     * Makes sure every id in [foodIds] that is still waiting for upload is on the server.
     * Throws [com.bissbilanz.api.ApiException] (429 / 503 for "later", 404 for "never") or
     * [com.bissbilanz.api.UnauthorizedException] when it cannot.
     */
    suspend fun ensureUploaded(foodIds: Set<String>)
}
