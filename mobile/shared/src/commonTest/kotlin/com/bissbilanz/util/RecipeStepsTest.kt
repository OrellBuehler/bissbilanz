package com.bissbilanz.util

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame

class RecipeStepsTest {
    @Test
    fun movedSwapsWithTheNeighbour() {
        assertEquals(listOf("b", "a", "c"), listOf("a", "b", "c").moved(1, -1))
        assertEquals(listOf("a", "c", "b"), listOf("a", "b", "c").moved(1, 1))
    }

    @Test
    fun movedIsANoOpAtTheEdgesAndOutOfRange() {
        val list = listOf("a", "b")
        assertSame(list, list.moved(0, -1))
        assertSame(list, list.moved(1, 1))
        assertSame(list, list.moved(5, -1))
    }

    @Test
    fun toStepInputsTrimsDropsBlankStepsAndKeepsPhotosInOrder() {
        val inputs =
            listOf(
                RecipeStepDraft("k1", "  Chop onions  ", "/uploads/a.webp"),
                RecipeStepDraft("k2", "   "),
                RecipeStepDraft("k3", "Fry"),
            ).toStepInputs()

        assertEquals(listOf("Chop onions", "Fry"), inputs.map { it.text })
        assertEquals(listOf("/uploads/a.webp", null), inputs.map { it.imageUrl })
    }

    @Test
    fun toStepInputsCapsTheListAndEachTextAtTheServerLimits() {
        val many = List(MAX_RECIPE_STEPS + 5) { RecipeStepDraft("k$it", "step $it") }
        assertEquals(MAX_RECIPE_STEPS, many.toStepInputs().size)

        val long = listOf(RecipeStepDraft("k", "x".repeat(MAX_RECIPE_STEP_TEXT + 10))).toStepInputs()
        assertEquals(MAX_RECIPE_STEP_TEXT, long.single().text.length)
    }
}
