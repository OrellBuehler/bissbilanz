package com.bissbilanz.model

import kotlinx.serialization.Serializable

@Serializable
data class Goals(
    val calorieGoal: Double,
    val proteinGoal: Double,
    val carbGoal: Double,
    val fatGoal: Double,
    val fiberGoal: Double,
    val sodiumGoal: Double? = null,
    val sugarGoal: Double? = null,
)

@Serializable
data class GoalsResponse(
    val goals: Goals? = null,
)
