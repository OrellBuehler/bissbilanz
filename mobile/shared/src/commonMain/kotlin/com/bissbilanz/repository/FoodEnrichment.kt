package com.bissbilanz.repository

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodEnrichmentJob

enum class FoodEnrichOutcome {
    UPDATED,
    UNCHANGED,
    NOT_FOUND,
    ;

    companion object {
        fun fromServer(value: String): FoodEnrichOutcome =
            when (value) {
                "updated" -> UPDATED
                "not_found" -> NOT_FOUND
                else -> UNCHANGED
            }
    }
}

data class FoodEnrichResult(
    val food: Food,
    val outcome: FoodEnrichOutcome,
)

class FoodEnrichmentException(
    val reason: Reason,
    val retryAfterSeconds: Long? = null,
    cause: Throwable? = null,
) : Exception("Food enrichment failed: $reason", cause) {
    enum class Reason {
        OFFLINE,
        RATE_LIMITED,
        NO_BARCODE,
        FOOD_GONE,
        FOOD_CHANGED,
        OFF_UNAVAILABLE,
    }
}

val FoodEnrichmentJob.isActive get() = state == "queued" || state == "running"
