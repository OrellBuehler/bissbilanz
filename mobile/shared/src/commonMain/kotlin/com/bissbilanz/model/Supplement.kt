package com.bissbilanz.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class ScheduleType {
    @SerialName("daily")
    DAILY,

    @SerialName("every_other_day")
    EVERY_OTHER_DAY,

    @SerialName("weekly")
    WEEKLY,

    @SerialName("specific_days")
    SPECIFIC_DAYS,
}

@Serializable
data class Supplement(
    val id: String,
    val userId: String,
    val name: String,
    val dosage: Double,
    val dosageUnit: String,
    val scheduleType: ScheduleType,
    val scheduleDays: List<Int>? = null,
    val scheduleStartDate: String? = null,
    val isActive: Boolean = true,
    val sortOrder: Int = 0,
    val timeOfDay: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val ingredients: List<SupplementIngredient>? = null,
)

@Serializable
data class SupplementIngredient(
    val id: String? = null,
    val supplementId: String? = null,
    val name: String,
    val dosage: Double,
    val dosageUnit: String,
    val sortOrder: Int = 0,
)

@Serializable
data class SupplementCreate(
    val name: String,
    val dosage: Double,
    val dosageUnit: String,
    val scheduleType: ScheduleType,
    val scheduleDays: List<Int>? = null,
    val scheduleStartDate: String? = null,
    val isActive: Boolean? = null,
    val sortOrder: Int? = null,
    val timeOfDay: String? = null,
    val ingredients: List<SupplementIngredientInput>? = null,
)

@Serializable
data class SupplementIngredientInput(
    val name: String,
    val dosage: Double,
    val dosageUnit: String,
    val sortOrder: Int? = null,
)

@Serializable
data class SupplementLog(
    val id: String,
    val supplementId: String,
    val userId: String,
    val date: String,
    val takenAt: String,
    val createdAt: String? = null,
)

@Serializable
data class SupplementHistoryEntry(
    val log: SupplementHistoryLog,
    val supplementName: String,
    val dosage: Double,
    val dosageUnit: String,
)

@Serializable
data class SupplementHistoryLog(
    val id: String,
    val supplementId: String,
    val userId: String,
    val date: String,
    val takenAt: String,
)

@Serializable
data class SupplementHistoryResponse(
    val history: List<SupplementHistoryEntry>,
)

@Serializable
data class SupplementsResponse(
    val supplements: List<Supplement>,
)
