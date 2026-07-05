package com.bissbilanz.analytics

data class RdaEntry(
    val nutrientKey: String,
    val unit: String,
    val rdaMale: Double,
    val rdaFemale: Double,
    val label: String,
)
