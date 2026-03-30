package com.bissbilanz.analytics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class RdaTest {
    @Test
    fun rdaValuesContains31Entries() {
        assertEquals(31, RDA_VALUES.size)
    }

    @Test
    fun allEntriesHavePositiveMaleRda() {
        for (entry in RDA_VALUES) {
            assertTrue(entry.rdaMale > 0, "${entry.nutrientKey} has non-positive rdaMale: ${entry.rdaMale}")
        }
    }

    @Test
    fun allEntriesHavePositiveFemaleRda() {
        for (entry in RDA_VALUES) {
            assertTrue(entry.rdaFemale > 0, "${entry.nutrientKey} has non-positive rdaFemale: ${entry.rdaFemale}")
        }
    }

    @Test
    fun allNutrientKeysAreUnique() {
        val keys = RDA_VALUES.map { it.nutrientKey }
        assertEquals(keys.size, keys.toSet().size)
    }

    @Test
    fun allLabelsAreNonBlank() {
        for (entry in RDA_VALUES) {
            assertTrue(entry.label.isNotBlank(), "${entry.nutrientKey} has blank label")
        }
    }

    @Test
    fun knownEntryIronHasHigherFemaleRda() {
        val iron = RDA_VALUES.first { it.nutrientKey == "iron" }
        assertTrue(iron.rdaFemale > iron.rdaMale, "Iron female RDA should exceed male RDA")
    }

    @Test
    fun knownEntrySodiumSameBothSexes() {
        val sodium = RDA_VALUES.first { it.nutrientKey == "sodium" }
        assertEquals(2300.0, sodium.rdaMale)
        assertEquals(2300.0, sodium.rdaFemale)
    }
}
