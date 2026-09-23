package com.bissbilanz.analytics

import com.bissbilanz.model.Goals
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

private val GOALS =
    Goals(
        calorieGoal = 2000.0,
        proteinGoal = 150.0,
        carbGoal = 200.0,
        fatGoal = 65.0,
        fiberGoal = 30.0,
    )

class ActivityGoalsTest {
    @Test
    fun returnsNullWhenGoalsIsNull() {
        assertNull(adjustGoalsForActivity(null, 400, enabled = true, creditPercent = 100))
    }

    @Test
    fun returnsGoalsWithZeroBonusWhenDisabled() {
        val result = adjustGoalsForActivity(GOALS, 400, enabled = false, creditPercent = 100)
        assertEquals(GOALS, result?.goals)
        assertEquals(0, result?.activityBonus)
    }

    @Test
    fun returnsGoalsWithZeroBonusWhenActivityCaloriesIsNull() {
        val result = adjustGoalsForActivity(GOALS, null, enabled = true, creditPercent = 100)
        assertEquals(GOALS, result?.goals)
        assertEquals(0, result?.activityBonus)
    }

    @Test
    fun returnsGoalsWithZeroBonusWhenActivityCaloriesIsZero() {
        val result = adjustGoalsForActivity(GOALS, 0, enabled = true, creditPercent = 100)
        assertEquals(GOALS, result?.goals)
        assertEquals(0, result?.activityBonus)
    }

    @Test
    fun returnsGoalsWithZeroBonusWhenCalorieGoalIsZero() {
        val goals = GOALS.copy(calorieGoal = 0.0)
        val result = adjustGoalsForActivity(goals, 400, enabled = true, creditPercent = 100)
        assertEquals(goals, result?.goals)
        assertEquals(0, result?.activityBonus)
    }

    @Test
    fun raisesCaloriesAndMacrosProportionallyAt100PercentCredit() {
        val result = adjustGoalsForActivity(GOALS, 400, enabled = true, creditPercent = 100)
        assertEquals(2400.0, result?.goals?.calorieGoal)
        assertEquals(400, result?.activityBonus)
        // factor = 2400 / 2000 = 1.2
        assertEquals(180.0, result?.goals?.proteinGoal)
        assertEquals(240.0, result?.goals?.carbGoal)
        assertEquals(78.0, result?.goals?.fatGoal)
        assertEquals(36.0, result?.goals?.fiberGoal)
    }

    @Test
    fun appliesAPartialCreditPercent() {
        val result = adjustGoalsForActivity(GOALS, 400, enabled = true, creditPercent = 50)
        assertEquals(200, result?.activityBonus)
        assertEquals(2200.0, result?.goals?.calorieGoal)
        // factor = 2200 / 2000 = 1.1
        assertEquals(165.0, result?.goals?.proteinGoal)
        assertEquals(220.0, result?.goals?.carbGoal)
        assertEquals(72.0, result?.goals?.fatGoal)
        assertEquals(33.0, result?.goals?.fiberGoal)
    }

    @Test
    fun roundsTheBonusAndTheAdjustedMacroGoals() {
        val result = adjustGoalsForActivity(GOALS, 333, enabled = true, creditPercent = 70)
        // 333 * 0.7 = 233.1 -> 233
        assertEquals(233, result?.activityBonus)
        assertEquals(2233.0, result?.goals?.calorieGoal)
    }

    @Test
    fun leavesSodiumSugarAndTargetWeightFieldsUntouched() {
        val goals = GOALS.copy(sodiumGoal = 2300.0, sugarGoal = 50.0, targetWeightKg = 75.0)
        val result = adjustGoalsForActivity(goals, 400, enabled = true, creditPercent = 100)
        assertEquals(2300.0, result?.goals?.sodiumGoal)
        assertEquals(50.0, result?.goals?.sugarGoal)
        assertEquals(75.0, result?.goals?.targetWeightKg)
    }
}
