package com.bissbilanz.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class ServingUnit {
    @SerialName("g")
    G,

    @SerialName("kg")
    KG,

    @SerialName("ml")
    ML,

    @SerialName("l")
    L,

    @SerialName("oz")
    OZ,

    @SerialName("lb")
    LB,

    @SerialName("fl_oz")
    FL_OZ,

    @SerialName("cup")
    CUP,

    @SerialName("tbsp")
    TBSP,

    @SerialName("tsp")
    TSP,
}
