package com.bissbilanz.util

/**
 * Mirrors `src/lib/units.ts` (`UNIT_BASE`/`unitConversionFactor`/`convertQuantityForMacros`) —
 * keep both in sync. oz/lb/fl_oz use the exact conversion factors; cup/tbsp/tsp match the
 * rounded factors already used elsewhere in this codebase (see `FoodEditSheet.baseUnitsPerUnit`
 * on Android) so results stay consistent across the app.
 *
 * Keyed by the raw unit string (e.g. "g", "tbsp") rather than a single shared enum type:
 * the generated OpenAPI models currently give `Food.servingUnit`, `RecipeIngredient.servingUnit`
 * and `RecipeIngredientInput.servingUnit` three distinct Kotlin enum types (one nested per
 * schema) even though they all represent the same `ServingUnit` value set — every one of them
 * exposes the same `.value: String` property, so going through that avoids duplicating this
 * table three times.
 */
enum class UnitDimension { MASS, VOLUME }

private data class UnitBase(
    val dimension: UnitDimension,
    val unitsPerBase: Double,
)

private val UNIT_BASE: Map<String, UnitBase> =
    mapOf(
        "g" to UnitBase(UnitDimension.MASS, 1.0),
        "kg" to UnitBase(UnitDimension.MASS, 1000.0),
        "oz" to UnitBase(UnitDimension.MASS, 28.349523125),
        "lb" to UnitBase(UnitDimension.MASS, 453.59237),
        "ml" to UnitBase(UnitDimension.VOLUME, 1.0),
        "cl" to UnitBase(UnitDimension.VOLUME, 10.0),
        "l" to UnitBase(UnitDimension.VOLUME, 1000.0),
        "fl_oz" to UnitBase(UnitDimension.VOLUME, 29.5735295625),
        "cup" to UnitBase(UnitDimension.VOLUME, 240.0),
        "tbsp" to UnitBase(UnitDimension.VOLUME, 15.0),
        "tsp" to UnitBase(UnitDimension.VOLUME, 5.0),
    )

/** Null for a unit string outside the known set (should never happen for server data). */
fun unitDimensionOrNull(unit: String): UnitDimension? = UNIT_BASE[unit]?.dimension

fun isSameUnitDimension(
    a: String,
    b: String,
): Boolean {
    val dimA = unitDimensionOrNull(a) ?: return false
    val dimB = unitDimensionOrNull(b) ?: return false
    return dimA == dimB
}

/**
 * Factor to multiply a quantity in [from] units by to get the equivalent quantity in [to]
 * units. Returns null when the units are in different dimensions (mass vs. volume), or either
 * is unrecognized.
 */
fun unitConversionFactor(
    from: String,
    to: String,
): Double? {
    val fromBase = UNIT_BASE[from] ?: return null
    val toBase = UNIT_BASE[to] ?: return null
    if (fromBase.dimension != toBase.dimension) return null
    return fromBase.unitsPerBase / toBase.unitsPerBase
}

/**
 * Converts an ingredient [quantity] given in [from] units into the equivalent quantity in
 * [to] units, for use in macro math. Falls back to the raw quantity (factor 1) when the
 * units are in different dimensions (or unrecognized) — legacy rows that predate unit-aware
 * validation.
 */
fun convertQuantityForMacros(
    quantity: Double,
    from: String,
    to: String,
): Double {
    val factor = unitConversionFactor(from, to) ?: return quantity
    return quantity * factor
}

/** All known unit strings in the same dimension (mass or volume) as [unit]. */
fun compatibleUnits(unit: String): List<String> {
    val dimension = unitDimensionOrNull(unit) ?: return UNIT_BASE.keys.toList()
    return UNIT_BASE.filterValues { it.dimension == dimension }.keys.toList()
}
