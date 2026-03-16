package com.bissbilanz.model

import kotlinx.serialization.Serializable

@Serializable
data class DayProperties(
    val date: String,
    val isFastingDay: Boolean,
)

@Serializable
data class DayPropertiesResponse(
    val properties: DayProperties? = null,
)

@Serializable
data class DayPropertiesRangeResponse(
    val data: List<DayProperties>,
)

@Serializable
data class DayPropertiesSet(
    val date: String,
    val isFastingDay: Boolean,
)
