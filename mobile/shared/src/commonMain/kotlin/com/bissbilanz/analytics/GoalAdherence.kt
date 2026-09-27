package com.bissbilanz.analytics

import com.bissbilanz.model.DailyStatsEntry
import com.bissbilanz.model.Goals

/**
 * How a day's intake is judged against its goal. Mirrors
 * src/lib/analytics/goal-adherence.ts and is locked by golden vectors.
 * - MINIMUM: meeting or exceeding the goal counts (protein, fiber)
 * - MAXIMUM: staying at or under the goal counts (carbs, fat)
 * - RANGE: within ±[GOAL_RANGE_TOLERANCE] of the goal counts (calories)
 */
enum class GoalRule(
    val wire: String,
) {
    MINIMUM("minimum"),
    MAXIMUM("maximum"),
    RANGE("range"),
}

enum class GoalOutcome(
    val wire: String,
) {
    BELOW("below"),
    MET("met"),
    ABOVE("above"),
}

const val GOAL_RANGE_TOLERANCE = 0.1

enum class GoalMacro(
    val rule: GoalRule,
) {
    CALORIES(GoalRule.RANGE),
    PROTEIN(GoalRule.MINIMUM),
    CARBS(GoalRule.MAXIMUM),
    FAT(GoalRule.MAXIMUM),
    FIBER(GoalRule.MINIMUM),
    ;

    fun valueOf(day: DailyStatsEntry): Double =
        when (this) {
            CALORIES -> day.calories
            PROTEIN -> day.protein
            CARBS -> day.carbs
            FAT -> day.fat
            FIBER -> day.fiber
        }

    fun goalOf(goals: Goals): Double =
        when (this) {
            CALORIES -> goals.calorieGoal
            PROTEIN -> goals.proteinGoal
            CARBS -> goals.carbGoal
            FAT -> goals.fatGoal
            FIBER -> goals.fiberGoal
        }
}

fun classifyGoalOutcome(
    rule: GoalRule,
    value: Double,
    goal: Double,
): GoalOutcome? {
    if (!(goal > 0)) return null
    return when (rule) {
        GoalRule.MINIMUM -> if (value >= goal) GoalOutcome.MET else GoalOutcome.BELOW
        GoalRule.MAXIMUM -> if (value <= goal) GoalOutcome.MET else GoalOutcome.ABOVE
        GoalRule.RANGE ->
            when {
                value < goal * (1 - GOAL_RANGE_TOLERANCE) -> GoalOutcome.BELOW
                value > goal * (1 + GOAL_RANGE_TOLERANCE) -> GoalOutcome.ABOVE
                else -> GoalOutcome.MET
            }
    }
}

data class MacroAdherence(
    val macro: GoalMacro,
    val below: Int,
    val met: Int,
    val above: Int,
) {
    val eligible: Int get() = below + met + above
}

/**
 * Counts, per macro, how many days with entries fell below/met/above that
 * day's effective (activity-adjusted) goal. Days without entries are not
 * eligible; macros without a goal are omitted. Mirrors summarizeGoalAdherence.
 */
fun summarizeGoalAdherence(
    days: List<DailyStatsEntry>,
    goals: Goals,
    activityAdjustment: Boolean,
    activityCreditPercent: Int,
): List<MacroAdherence> {
    val eligibleDays = days.filter { it.calories > 0 }
    val effective =
        eligibleDays.map {
            adjustGoalsForActivity(goals, it.activityCalories, activityAdjustment, activityCreditPercent)!!.goals
        }
    return GoalMacro.entries
        .filter { it.goalOf(goals) > 0 }
        .map { macro ->
            val outcomes =
                eligibleDays.mapIndexedNotNull { i, day ->
                    classifyGoalOutcome(macro.rule, macro.valueOf(day), macro.goalOf(effective[i]))
                }
            MacroAdherence(
                macro = macro,
                below = outcomes.count { it == GoalOutcome.BELOW },
                met = outcomes.count { it == GoalOutcome.MET },
                above = outcomes.count { it == GoalOutcome.ABOVE },
            )
        }
}
