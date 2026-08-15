package com.bissbilanz.label

import kotlin.jvm.JvmName
import kotlin.math.abs
import kotlin.math.round

/**
 * Heuristic, on-device parser that turns the text of a nutrition-facts panel
 * into a [ParsedNutrition]. It is intentionally OCR-agnostic: it operates on
 * plain row strings so the same logic serves both the spatial line clustering
 * used on Android (ML Kit) and any table-aware recognizer, and so it can be unit
 * tested without a camera.
 *
 * Supported formats: EU panels (kJ/kcal, "of which …" / "davon …" sub-rows,
 * salt) and US "Nutrition Facts" (sodium, %DV column). Values are read on a
 * per-100 g basis (the canonical column on EU labels and the first numeric
 * column elsewhere); the user adjusts to per-portion in the confirmation sheet.
 *
 * This is a Kotlin port of the iOS `NutritionLabelParser`, kept behaviourally
 * identical so both apps extract the same values from the same label.
 */
object NutritionLabelParser {
    // MARK: - Public API

    /** Parses already-assembled rows (one nutrient per row, left-to-right text). */
    fun parse(rows: List<String>): ParsedNutrition {
        val result = ParsedNutrition()
        for (row in rows) {
            val folded = fold(row)
            when (val nutrient = match(folded)) {
                null, Nutrient.Ignore -> {
                    continue
                }

                Nutrient.Energy -> {
                    if (result.calories == null) {
                        energyKcal(row)?.let { result.calories = round2(it) }
                    }
                }

                is Nutrient.Field -> {
                    if (nutrient.get(result) == null) {
                        firstValue(row)?.let { measured ->
                            nutrient.set(result, round2(convert(measured, nutrient.unit)))
                        }
                    }
                }
            }
        }
        return result
    }

    /** Convenience: cluster raw OCR lines into rows, then parse. */
    @JvmName("parseLines")
    fun parse(lines: List<OcrTextLine>): ParsedNutrition = parse(assembleRows(lines))

    /**
     * Groups recognized lines that share a baseline into a single row (so a
     * label in the left column and its value in the right column are read
     * together), ordering each row left-to-right and rows top-to-bottom.
     */
    fun assembleRows(lines: List<OcrTextLine>): List<String> {
        val usable =
            lines
                .filter { it.text.trim().isNotEmpty() }
                .sortedByDescending { it.boundingBox.midY } // top (high y) first

        val rows = mutableListOf<MutableList<OcrTextLine>>()
        for (line in usable) {
            val index =
                rows.indexOfFirst { row ->
                    val reference = row.firstOrNull() ?: return@indexOfFirst false
                    val tolerance = maxOf(reference.boundingBox.height, line.boundingBox.height) * 0.6
                    abs(reference.boundingBox.midY - line.boundingBox.midY) <= tolerance
                }
            if (index >= 0) rows[index].add(line) else rows.add(mutableListOf(line))
        }

        return rows.map { row ->
            row.sortedBy { it.boundingBox.minX }.joinToString(separator = " ") { it.text }
        }
    }

    // MARK: - Nutrient matching

    /** How a parsed numeric value relates to the `FoodCreate` unit convention. */
    private enum class FieldUnit { GRAMS, MILLIGRAMS }

    private sealed interface Nutrient {
        data object Energy : Nutrient

        data object Ignore : Nutrient

        data class Field(
            val get: (ParsedNutrition) -> Double?,
            val set: (ParsedNutrition, Double) -> Unit,
            val unit: FieldUnit,
        ) : Nutrient
    }

    /**
     * Ordered most-specific first so substrings resolve correctly: "saturated
     * fat" before "fat", "of which sugars" before "carbohydrate". Keywords are
     * stored pre-folded (lowercase, ß→ss, diacritics removed).
     */
    private val matchers: List<Pair<List<String>, Nutrient>> =
        listOf(
            // Skip fat sub-rows that would otherwise be misread as a macro:
            // "unsaturated"/"ungesättigte" contains "gesättigte fettsäuren", and
            // "trans fat" contains "fat".
            listOf("trans", "unsaturated", "ungesattigte") to Nutrient.Ignore,
            listOf("of which saturates", "saturated fat", "saturates", "gesattigte fettsauren", "davon gesattigte") to
                Nutrient.Field({ it.saturatedFat }, { p, v -> p.saturatedFat = v }, FieldUnit.GRAMS),
            listOf("of which sugars", "of which sugar", "total sugars", "sugars", "sugar", "davon zucker", "zucker") to
                Nutrient.Field({ it.sugar }, { p, v -> p.sugar = v }, FieldUnit.GRAMS),
            listOf("dietary fibre", "dietary fiber", "fibre", "fiber", "ballaststoffe") to
                Nutrient.Field({ it.fiber }, { p, v -> p.fiber = v }, FieldUnit.GRAMS),
            listOf("protein", "eiweiss") to
                Nutrient.Field({ it.protein }, { p, v -> p.protein = v }, FieldUnit.GRAMS),
            listOf("total carbohydrate", "carbohydrates", "carbohydrate", "kohlenhydrate", "kohlenhydrat") to
                Nutrient.Field({ it.carbs }, { p, v -> p.carbs = v }, FieldUnit.GRAMS),
            listOf("total fat", "fat", "fett") to
                Nutrient.Field({ it.fat }, { p, v -> p.fat = v }, FieldUnit.GRAMS),
            listOf("salt", "salz") to
                Nutrient.Field({ it.salt }, { p, v -> p.salt = v }, FieldUnit.GRAMS),
            listOf("sodium", "natrium") to
                Nutrient.Field({ it.sodium }, { p, v -> p.sodium = v }, FieldUnit.MILLIGRAMS),
            listOf("energy", "energie", "brennwert", "calories", "kalorien", "kcal", "kj") to Nutrient.Energy,
        )

    private fun match(folded: String): Nutrient? {
        for ((keywords, nutrient) in matchers) {
            if (keywords.any { folded.contains(it) }) return nutrient
        }
        return null
    }

    // MARK: - Value extraction

    private const val NUMBER_TOKEN = "[0-9]+(?:[.,\\s][0-9]+)*"
    private val units = listOf("kcal", "kj", "mg", "µg", "mcg", "g", "ml")

    /** A number plus the unit printed immediately after it (if any). */
    private data class Measurement(
        val value: Double,
        val unit: String?,
    )

    /**
     * Energy in kcal: prefer an explicit kcal figure, else convert kJ, else fall
     * back to the first number (US "Calories" has no unit word).
     */
    private fun energyKcal(row: String): Double? {
        val cleaned = stripBasis(row).lowercase()
        firstNumber(cleaned, "kcal")?.let { return it }
        firstNumber(cleaned, "kj", energyKJ = true)?.let { return it / 4.184 }
        return firstValue(row)?.value
    }

    /** First numeric value in a row, with the unit token that follows it. */
    private fun firstValue(row: String): Measurement? {
        val cleaned = stripBasis(row)
        val match = Regex(NUMBER_TOKEN).find(cleaned) ?: return null
        val value = parseDecimal(match.value) ?: return null
        val rest = cleaned.substring(match.range.last + 1).trim().lowercase()
        val unit = units.firstOrNull { rest.startsWith(it) }
        return Measurement(value, unit)
    }

    /** First number that is immediately followed by [unit] (e.g. "375 kcal"). */
    private fun firstNumber(
        lowercased: String,
        unit: String,
        energyKJ: Boolean = false,
    ): Double? {
        val pattern = "($NUMBER_TOKEN)\\s*${Regex.escape(unit)}"
        val match = Regex(pattern).find(lowercased) ?: return null
        return parseDecimal(match.groupValues[1], energyKJ)
    }

    private fun convert(
        measured: Measurement,
        unit: FieldUnit,
    ): Double =
        when (unit) {
            // Salt is the only gram field commonly printed in mg.
            FieldUnit.GRAMS -> if (measured.unit == "mg") measured.value / 1000 else measured.value

            // Sodium is usually mg (US); EU prints it in grams.
            FieldUnit.MILLIGRAMS -> if (measured.unit == "g") measured.value * 1000 else measured.value
        }

    // MARK: - Number normalization

    /**
     * Removes the "per 100 g / pro 100 g / je 100 ml" basis phrase so its digits
     * are not mistaken for a nutrient value.
     */
    private fun stripBasis(row: String): String = row.replace(Regex("(?i)(per|pro|je)\\s*100\\s*(g|ml|kcal|kj)?"), " ")

    /**
     * Parses a numeric token handling decimal comma vs point and thousands
     * separators. [energyKJ] treats a lone "1.569"-style dot as thousands.
     */
    fun parseDecimal(
        token: String,
        energyKJ: Boolean = false,
    ): Double? {
        var cleaned = token.replace(" ", "")
        val hasComma = cleaned.contains(",")
        val hasDot = cleaned.contains(".")

        if (hasComma && hasDot) {
            // The right-most separator is the decimal point.
            cleaned =
                if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
                    cleaned.replace(".", "").replace(",", ".")
                } else {
                    cleaned.replace(",", "")
                }
        } else if (hasComma) {
            cleaned = cleaned.replace(",", ".")
        } else if (hasDot) {
            val parts = cleaned.split(".")
            val dotIsThousands = parts.size > 2 || (energyKJ && parts.size == 2 && parts[1].length == 3)
            if (dotIsThousands) cleaned = cleaned.replace(".", "")
        }
        return cleaned.toDoubleOrNull()
    }

    // MARK: - Text folding

    /** Maps the accented characters that appear on EN/DE labels to their base. */
    private val diacritics: Map<Char, String> =
        mapOf(
            'ä' to "a",
            'ö' to "o",
            'ü' to "u",
            'ë' to "e",
            'ï' to "i",
            'ñ' to "n",
            'ç' to "c",
            'á' to "a",
            'à' to "a",
            'â' to "a",
            'ã' to "a",
            'é' to "e",
            'è' to "e",
            'ê' to "e",
            'í' to "i",
            'ì' to "i",
            'î' to "i",
            'ó' to "o",
            'ò' to "o",
            'ô' to "o",
            'õ' to "o",
            'ú' to "u",
            'ù' to "u",
            'û' to "u",
        )

    /**
     * Lowercases, expands ß→ss and strips the diacritics found on nutrition
     * labels so EN/DE keywords match regardless of OCR diacritic fidelity
     * ("Gesättigte" → "gesattigte").
     */
    private fun fold(text: String): String {
        val builder = StringBuilder(text.length)
        for (ch in text) {
            val lower = ch.lowercaseChar()
            when {
                lower == 'ß' -> builder.append("ss")
                else -> diacritics[lower]?.let { builder.append(it) } ?: builder.append(lower)
            }
        }
        return builder.toString()
    }

    private fun round2(value: Double): Double = round(value * 100) / 100.0
}
