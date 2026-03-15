package com.bissbilanz.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class WeightEntry(
    val id: String,
    val userId: String,
    val weightKg: Double,
    val entryDate: String,
    val loggedAt: String? = null,
    val notes: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class WeightEntriesResponse(
    val entries: List<WeightEntry>,
)

@Serializable
data class WeightEntryResponse(
    val entry: WeightEntry,
)

@Serializable
data class WeightTrendEntry(
    @SerialName("entry_date") val entryDate: String,
    @SerialName("weight_kg") val weightKg: Double,
    @SerialName("moving_avg") val movingAvg: Double? = null,
)

@Serializable
data class WeightTrendResponse(
    val data: List<WeightTrendEntry>,
)
