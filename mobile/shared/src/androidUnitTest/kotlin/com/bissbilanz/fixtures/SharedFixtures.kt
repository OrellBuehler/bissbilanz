package com.bissbilanz.fixtures

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.math.abs
import kotlin.test.fail

/**
 * Loader and comparer for the cross-platform fixtures in tests/fixtures/shared/.
 * The web (tests/shared-fixtures) and iOS (SharedFixtureTests) suites assert the
 * same files, so a rule implemented on all three platforms cannot drift apart
 * unnoticed. The path is relative to the Gradle project directory (mobile/shared).
 */
internal const val PLATFORM = "kotlin"

internal val fixtureJson = Json { ignoreUnknownKeys = true }

internal class FixtureCase(
    val fn: String,
    val name: String,
    val input: JsonObject,
    val expected: JsonElement,
) {
    val label: String get() = "$fn/$name"
}

internal class Fixture(
    val tolerance: Double,
    val cases: List<FixtureCase>,
)

/**
 * The cases this platform implements. A case whose fn is missing from the
 * fixture's `implementations` fails, so a new function cannot be silently
 * skipped; a documented known divergence replaces the expected value.
 */
internal fun loadFixture(file: String): Fixture {
    val root = fixtureJson.parseToJsonElement(File("../../tests/fixtures/shared/$file").readText()).jsonObject
    val implementations = root.getValue("implementations").jsonObject
    val cases =
        root.getValue("cases").jsonArray.mapNotNull { element ->
            val obj = element.jsonObject
            val fn = obj.getValue("fn").jsonPrimitive.content
            val platforms =
                implementations[fn]?.jsonArray?.map { it.jsonPrimitive.content }
                    ?: fail("$file: fn $fn is missing from implementations")
            if (PLATFORM !in platforms) return@mapNotNull null
            val divergence =
                obj["divergences"]?.jsonArray?.map { it.jsonObject }?.firstOrNull {
                    it.getValue("platform").jsonPrimitive.content == PLATFORM
                }
            FixtureCase(
                fn = fn,
                name = obj.getValue("name").jsonPrimitive.content,
                input = obj.getValue("input").jsonObject,
                expected = divergence?.getValue("expected") ?: obj.getValue("expected"),
            )
        }
    check(cases.isNotEmpty()) { "$file: no cases for $PLATFORM" }
    return Fixture(root["tolerance"]?.jsonPrimitive?.doubleOrNull ?: 1e-9, cases)
}

/** Mismatches between [actual] and [expected]; objects are compared on the keys [expected] names. */
internal fun diff(
    actual: JsonElement?,
    expected: JsonElement,
    tolerance: Double,
    path: String = "",
): List<String> {
    if (expected is JsonNull) {
        return if (actual == null || actual is JsonNull) emptyList() else listOf("$path: expected null, got $actual")
    }
    return when (expected) {
        is JsonPrimitive -> {
            val a = actual as? JsonPrimitive
            val matches =
                when {
                    a == null || a is JsonNull -> false
                    expected.isString -> a.isString && a.content == expected.content
                    expected.booleanOrNull != null -> a.booleanOrNull == expected.booleanOrNull
                    else -> a.doubleOrNull.let { it != null && abs(it - expected.content.toDouble()) <= tolerance }
                }
            if (matches) emptyList() else listOf("$path: expected $expected, got $actual")
        }

        is JsonArray -> {
            val a = actual as? JsonArray
            if (a == null || a.size != expected.size) {
                listOf("$path: expected array of ${expected.size}, got $actual")
            } else {
                expected.flatMapIndexed { i, e -> diff(a[i], e, tolerance, "$path[$i]") }
            }
        }

        is JsonObject -> {
            val a = actual as? JsonObject
            if (a == null) {
                listOf("$path: expected object, got $actual")
            } else {
                expected.entries.flatMap { (k, e) -> diff(a[k], e, tolerance, "$path.$k") }
            }
        }
    }
}

internal inline fun runFixture(
    file: String,
    run: (FixtureCase) -> JsonElement,
) {
    val fixture = loadFixture(file)
    val failures = mutableListOf<String>()
    for (case in fixture.cases) {
        try {
            failures += diff(run(case), case.expected, fixture.tolerance, case.label).map { "$file $it" }
        } catch (e: Exception) {
            failures += "$file ${case.label}: threw $e"
        }
    }
    if (failures.isNotEmpty()) {
        fail("Kotlin diverged from the shared fixtures:\n" + failures.joinToString("\n"))
    }
}
