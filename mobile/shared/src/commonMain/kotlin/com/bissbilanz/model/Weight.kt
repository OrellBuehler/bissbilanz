package com.bissbilanz.model

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
data class WeightCreate(
    val weightKg: Double,
    val entryDate: String,
    val notes: String? = null,
)

@Serializable
data class WeightUpdate(
    val weightKg: Double? = null,
    val entryDate: String? = null,
    val notes: String? = null,
)

@Serializable
data class WeightEntriesResponse(
    val entries: List<WeightEntry>,
)

@Serializable
data class WeightEntryResponse(
    val entry: WeightEntry,
)
