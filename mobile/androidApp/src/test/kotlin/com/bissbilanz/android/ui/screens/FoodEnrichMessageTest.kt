package com.bissbilanz.android.ui.screens

import com.bissbilanz.android.R
import com.bissbilanz.android.ui.viewmodels.UiMessage
import com.bissbilanz.repository.FoodEnrichmentException
import kotlin.test.Test
import kotlin.test.assertEquals

class FoodEnrichMessageTest {
    private fun failure(
        reason: FoodEnrichmentException.Reason,
        retryAfterSeconds: Long? = null,
    ) = FoodEnrichmentException(reason, retryAfterSeconds)

    @Test
    fun anOpenFoodFactsOutageSaysWhenToTryAgain() {
        assertEquals(
            UiMessage(R.plurals.food_detail_enrich_off_unavailable_seconds, listOf(30), 30),
            failure(FoodEnrichmentException.Reason.OFF_UNAVAILABLE, 30).toUiMessage(),
        )
        assertEquals(
            UiMessage(R.plurals.food_detail_enrich_off_unavailable_minutes, listOf(2), 2),
            failure(FoodEnrichmentException.Reason.OFF_UNAVAILABLE, 90).toUiMessage(),
        )
        assertEquals(
            UiMessage(R.string.food_detail_enrich_off_unavailable),
            failure(FoodEnrichmentException.Reason.OFF_UNAVAILABLE).toUiMessage(),
        )
    }

    @Test
    fun aFoodThatNeverReachedTheServerIsNotCalledDeleted() {
        assertEquals(
            UiMessage(R.string.food_detail_enrich_not_uploaded),
            failure(FoodEnrichmentException.Reason.NOT_UPLOADED).toUiMessage(),
        )
        assertEquals(
            UiMessage(R.string.food_detail_enrich_food_gone),
            failure(FoodEnrichmentException.Reason.FOOD_GONE).toUiMessage(),
        )
    }
}
