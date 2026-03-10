package com.bissbilanz.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class GoalsSerializationTest {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
    }

    @Test
    fun serializeAndDeserializeGoalsRoundTrip() {
        val goals = Goals(
            calorieGoal = 2000.0,
            proteinGoal = 150.0,
            carbGoal = 250.0,
            fatGoal = 65.0,
            fiberGoal = 30.0,
        )
        val encoded = json.encodeToString(goals)
        val decoded = json.decodeFromString<Goals>(encoded)
        assertEquals(goals, decoded)
    }

    @Test
    fun goalsOptionalFieldsDefaultToNull() {
        val goals = Goals(
            calorieGoal = 2000.0,
            proteinGoal = 150.0,
            carbGoal = 250.0,
            fatGoal = 65.0,
            fiberGoal = 30.0,
        )
        assertNull(goals.sodiumGoal)
        assertNull(goals.sugarGoal)
    }

    @Test
    fun goalsWithOptionalFieldsIncluded() {
        val jsonStr = """
            {
                "calorieGoal": 1800,
                "proteinGoal": 130,
                "carbGoal": 200,
                "fatGoal": 60,
                "fiberGoal": 25,
                "sodiumGoal": 2300,
                "sugarGoal": 50
            }
        """.trimIndent()
        val goals = json.decodeFromString<Goals>(jsonStr)
        assertEquals(2300.0, goals.sodiumGoal)
        assertEquals(50.0, goals.sugarGoal)
    }

    @Test
    fun deserializeGoalsFromServerResponse() {
        val jsonStr = """
            {
                "calorieGoal": 2500.0,
                "proteinGoal": 180.0,
                "carbGoal": 300.0,
                "fatGoal": 80.0,
                "fiberGoal": 35.0,
                "extraServerField": true
            }
        """.trimIndent()
        val goals = json.decodeFromString<Goals>(jsonStr)
        assertEquals(2500.0, goals.calorieGoal)
        assertEquals(180.0, goals.proteinGoal)
    }
}
