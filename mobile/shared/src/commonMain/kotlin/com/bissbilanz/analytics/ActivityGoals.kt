package com.bissbilanz.analytics

import com.bissbilanz.model.Goals
import kotlin.math.roundToInt

/** [goals] with its macro targets raised by [activityBonus] kcal worth of workout credit. */
data class ActivityAdjustedGoals(
    val goals: Goals,
    val activityBonus: Int,
)

/**
 * Raises calorieGoal (and the other macro goals proportionally) by a share of
 * the day's activity calories. Mirrors the web's adjustGoalsForActivity
 * (src/lib/utils/activity-goals.ts) field for field, including its rounding.
 * Fields outside the 5 macro goals (sodium, sugar, targetWeight, ...) pass
 * through unchanged.
 */
fun adjustGoalsForActivity(
    goals: Goals?,
    activityCalories: Int?,
    enabled: Boolean,
    creditPercent: Int,
): ActivityAdjustedGoals? {
    if (goals == null) return null

    val calories = activityCalories ?: 0
    if (!enabled || calories <= 0 || goals.calorieGoal <= 0) {
        return ActivityAdjustedGoals(goals = goals, activityBonus = 0)
    }

    val bonus = ((calories * creditPercent) / 100.0).roundToInt()
    val factor = (goals.calorieGoal + bonus) / goals.calorieGoal

    return ActivityAdjustedGoals(
        goals =
            goals.copy(
                calorieGoal = goals.calorieGoal + bonus,
                proteinGoal = (goals.proteinGoal * factor).roundToInt().toDouble(),
                carbGoal = (goals.carbGoal * factor).roundToInt().toDouble(),
                fatGoal = (goals.fatGoal * factor).roundToInt().toDouble(),
                fiberGoal = (goals.fiberGoal * factor).roundToInt().toDouble(),
            ),
        activityBonus = bonus,
    )
}
