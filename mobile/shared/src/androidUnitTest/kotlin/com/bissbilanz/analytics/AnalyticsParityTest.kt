package com.bissbilanz.analytics

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.fail

/**
 * Cross-language golden-vector parity for the analytics shared with the
 * TypeScript server. Both this test and tests/analytics/parity.test.ts assert
 * the same frozen fixtures, so the server's TS analytics and the mobile apps'
 * Kotlin analytics fail CI the moment they diverge. See analytics-parity/README.md.
 */
class AnalyticsParityTest {
    @Test
    fun matchesGoldenVectors() {
        val root = Json.parseToJsonElement(loadFixtureText()).jsonObject
        val cases = root.getValue("cases").jsonArray
        check(cases.isNotEmpty()) { "no golden-vector cases found" }

        val failures = mutableListOf<String>()
        for (case in cases) {
            val obj = case.jsonObject
            val fn = obj.getValue("fn").jsonPrimitive.content
            val name = obj.getValue("name").jsonPrimitive.content
            val input = obj.getValue("input").jsonObject
            val expected = obj.getValue("expected")
            val actual = runCase(fn, input)
            try {
                assertClose(actual, expected, "$fn/$name")
            } catch (e: AssertionError) {
                failures += e.message ?: "$fn/$name mismatch"
            }
        }
        if (failures.isNotEmpty()) {
            fail("Kotlin analytics diverged from the golden vectors:\n" + failures.joinToString("\n"))
        }
    }

    private fun runCase(
        fn: String,
        input: JsonObject,
    ): JsonElement =
        when (fn) {
            "pearsonCorrelation" -> {
                pearsonCorrelation(
                    doubleArrayFrom(input.getValue("x")),
                    doubleArrayFrom(input.getValue("y")),
                ).toJson()
            }

            "movingAverage" -> {
                movingAverage(
                    nullableDoublesFrom(input.getValue("series")),
                    input.getValue("windowSize").jsonPrimitive.int,
                ).let { result -> JsonArray(result.map { it?.let(::JsonPrimitive) ?: JsonNull }) }
            }

            "computeAdaptiveTDEE" -> {
                computeAdaptiveTDEE(
                    weightSeriesFrom(input.getValue("weightSeries")),
                    calorieSeriesFrom(input.getValue("calorieSeries")),
                    input.getValue("windowDays").jsonPrimitive.int,
                ).toJson()
            }

            "detectPlateau" -> {
                detectPlateau(
                    weightSeriesFrom(input.getValue("weightSeries")),
                    calorieSeriesFrom(input.getValue("calorieSeries")),
                    input["estimatedTDEE"].nullableDouble(),
                    input["sodiumAvg"].nullableDouble(),
                ).toJson()
            }

            "projectWeight" -> {
                projectWeight(
                    weightSeriesFrom(input.getValue("weightSeries")),
                    input.getValue("weeklyRate").jsonPrimitive.double,
                ).toJson()
            }

            else -> {
                error("Unknown fn in fixtures: $fn")
            }
        }

    // --- result -> JSON (shape mirrors the TS return objects) ----------------

    private fun CorrelationResult.toJson() =
        buildJsonObject {
            put("r", r)
            put("pValue", pValue)
            put("sampleSize", sampleSize)
            put("confidence", confidence.wire())
            put("constantInput", constantInput)
        }

    private fun TDEEResult.toJson() =
        buildJsonObject {
            putNullableDouble("estimatedTDEE", estimatedTDEE)
            put("trend", trend)
            put("avgIntake", avgIntake)
            put("weeklyRate", weeklyRate)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun PlateauResult.toJson() =
        buildJsonObject {
            put("isPlateaued", isPlateaued)
            put("plateauDays", plateauDays)
            putNullableDouble("estimatedDeficit", estimatedDeficit)
            put("cause", cause)
            put("confidence", confidence.wire())
            put("sampleSize", sampleSize)
        }

    private fun WeightForecast.toJson() =
        buildJsonObject {
            putNullableDouble("currentWeight", currentWeight)
            put("weeklyRate", weeklyRate)
            putNullableDouble("day30", day30)
            putNullableDouble("day60", day60)
            putNullableDouble("day90", day90)
            put("sampleSize", sampleSize)
            put("confidence", confidence.wire())
        }

    // TS encodes ConfidenceLevel as a lowercase string.
    private fun ConfidenceLevel.wire() = name.lowercase()

    private fun JsonObjectBuilder.putNullableDouble(
        key: String,
        value: Double?,
    ) {
        put(key, value?.let(::JsonPrimitive) ?: JsonNull)
    }

    // --- input parsing -------------------------------------------------------

    private fun weightSeriesFrom(el: JsonElement): List<Pair<String, Double?>> = seriesFrom(el, "weightKg")

    private fun calorieSeriesFrom(el: JsonElement): List<Pair<String, Double?>> = seriesFrom(el, "calories")

    private fun seriesFrom(
        el: JsonElement,
        valueKey: String,
    ): List<Pair<String, Double?>> =
        el.jsonArray.map {
            val o = it.jsonObject
            o.getValue("date").jsonPrimitive.content to o.getValue(valueKey).asNullableDouble()
        }

    private fun nullableDoublesFrom(el: JsonElement): List<Double?> = el.jsonArray.map { it.asNullableDouble() }

    private fun doubleArrayFrom(el: JsonElement): DoubleArray = el.jsonArray.map { it.jsonPrimitive.double }.toDoubleArray()

    private fun JsonElement.asNullableDouble(): Double? = if (this is JsonNull) null else jsonPrimitive.double

    private fun JsonElement?.nullableDouble(): Double? = if (this == null || this is JsonNull) null else jsonPrimitive.double

    // --- comparison with the same tolerances as the TS harness ---------------

    private fun assertClose(
        actual: JsonElement,
        expected: JsonElement,
        path: String,
    ) {
        when (expected) {
            is JsonNull -> {
                if (actual !is JsonNull) fail("$path: expected null, got $actual")
            }

            is JsonArray -> {
                if (actual !is JsonArray) fail("$path: expected array, got $actual")
                if (actual.size != expected.size) fail("$path: size ${actual.size} != ${expected.size}")
                expected.forEachIndexed { i, e -> assertClose(actual[i], e, "$path[$i]") }
            }

            is JsonObject -> {
                if (actual !is JsonObject) fail("$path: expected object, got $actual")
                for ((k, e) in expected) assertClose(actual[k] ?: JsonNull, e, "$path.$k")
            }

            is JsonPrimitive -> {
                assertPrimitiveClose(actual, expected, path)
            }
        }
    }

    private fun assertPrimitiveClose(
        actual: JsonElement,
        expected: JsonPrimitive,
        path: String,
    ) {
        if (actual !is JsonPrimitive) fail("$path: expected primitive, got $actual")
        val expectedBool = if (!expected.isString) expected.booleanOrNull else null
        if (expectedBool != null) {
            if (actual.booleanOrNull != expectedBool) fail("$path: expected $expectedBool, got $actual")
            return
        }
        val expectedNum = if (!expected.isString) expected.doubleOrNull else null
        if (expectedNum != null) {
            val actualNum = actual.doubleOrNull ?: fail("$path: expected number, got $actual")
            val tol = if (path.endsWith("pValue")) 1e-7 else 1e-9 * maxOf(1.0, abs(expectedNum))
            if (abs(actualNum - expectedNum) > tol) {
                fail("$path: expected $expectedNum, got $actualNum (tolerance $tol)")
            }
            return
        }
        if (actual.content != expected.content) fail("$path: expected '${expected.content}', got '${actual.content}'")
    }

    private fun loadFixtureText(): String {
        var dir: File? = File(System.getProperty("user.dir"))
        repeat(8) {
            val candidate = File(dir, "analytics-parity/fixtures/golden-vectors.json")
            if (candidate.exists()) return candidate.readText()
            dir = dir?.parentFile
        }
        error("golden-vectors.json not found walking up from ${System.getProperty("user.dir")}")
    }
}
