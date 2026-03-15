package com.bissbilanz.model

import kotlinx.serialization.Serializable

@Serializable
data class GoalsResponse(
    val goals: Goals? = null,
)
