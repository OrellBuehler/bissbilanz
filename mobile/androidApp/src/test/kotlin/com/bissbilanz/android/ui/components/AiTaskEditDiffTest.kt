package com.bissbilanz.android.ui.components

import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.util.AiTaskField
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Which fields an AI task edit reports as changed, and which of those are a
 * deliberate clear. Getting this wrong either leaks an untouched field into the
 * PATCH or, worse, silently drops a clear (an omitted `null` looks identical to
 * "leave it alone" on the wire — see [com.bissbilanz.util.encodePartialUpdate]).
 */
class AiTaskEditDiffTest {
    private val original =
        AiTask(
            id = "task-1",
            userId = "user-1",
            status = AiTask.Status.pending,
            description = "Oatmeal",
            photoUrl = null,
            photoUrls = listOf("/uploads/a.webp"),
            date = "2024-01-15",
            mealType = "Breakfast",
            eatenAt = "2024-01-15T08:00:00Z",
            source = "android",
            resultSummary = null,
            createdEntryIds = null,
            completedAt = null,
            dismissedAt = null,
            acknowledgedAt = null,
        )

    private fun diff(
        description: String? = original.description,
        mealType: String? = original.mealType,
        date: String = original.date,
        eatenAt: String? = original.eatenAt,
        photoUrls: List<String> = original.photoUrls,
    ) = buildAiTaskUpdate(
        original = original,
        description = description,
        mealType = mealType,
        date = date,
        eatenAt = eatenAt,
        photoUrls = photoUrls,
    )

    @Test
    fun anUntouchedFormChangesNothing() {
        val result = diff()

        assertNull(result.update.description)
        assertNull(result.update.mealType)
        assertNull(result.update.date)
        assertNull(result.update.eatenAt)
        assertNull(result.update.photoUrls)
        assertEquals(emptySet(), result.clearedKeys)
    }

    @Test
    fun anEditedDescriptionIsSentAsAValueNotAClear() {
        val result = diff(description = "Oatmeal with berries")

        assertEquals("Oatmeal with berries", result.update.description)
        assertTrue(AiTaskField.DESCRIPTION !in result.clearedKeys)
    }

    @Test
    fun anEmptiedDescriptionIsReportedAsCleared() {
        val result = diff(description = null)

        assertNull(result.update.description)
        assertEquals(setOf(AiTaskField.DESCRIPTION), result.clearedKeys)
    }

    @Test
    fun pickingNoSpecificMealClearsTheMealType() {
        val result = diff(mealType = null)

        assertEquals(setOf(AiTaskField.MEAL_TYPE), result.clearedKeys)
    }

    @Test
    fun aTaskAlreadyWithoutAMealTypeStaysUntouchedWhenLeftAsNoMeal() {
        val noMealOriginal = original.copy(mealType = null)
        val result =
            buildAiTaskUpdate(
                original = noMealOriginal,
                description = noMealOriginal.description,
                mealType = null,
                date = noMealOriginal.date,
                eatenAt = noMealOriginal.eatenAt,
                photoUrls = noMealOriginal.photoUrls,
            )

        assertNull(result.update.mealType)
        assertEquals(emptySet(), result.clearedKeys)
    }

    @Test
    fun clearingTheEatenTimeIsReportedAsCleared() {
        val result = diff(eatenAt = null)

        assertEquals(setOf(AiTaskField.EATEN_AT), result.clearedKeys)
    }

    @Test
    fun movingTheDateIsSentAsAPlainValue() {
        val result = diff(date = "2024-02-01")

        assertEquals("2024-02-01", result.update.date)
        assertTrue(result.clearedKeys.isEmpty())
    }

    @Test
    fun removingAPhotoSendsTheShrunkenListNotAClear() {
        val result = diff(photoUrls = emptyList())

        assertEquals(emptyList(), result.update.photoUrls)
        assertTrue(result.clearedKeys.isEmpty())
    }

    @Test
    fun unchangedPhotosAreOmitted() {
        val result = diff(photoUrls = original.photoUrls)

        assertNull(result.update.photoUrls)
    }
}
