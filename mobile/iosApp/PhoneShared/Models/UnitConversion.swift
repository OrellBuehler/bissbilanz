import Foundation

/// Mirrors `src/lib/units.ts` (`UNIT_BASE`/`unitConversionFactor`/`convertQuantityForMacros`) —
/// keep both in sync. oz/lb/fl_oz use the exact conversion factors; cup/tbsp/tsp match the
/// rounded factors `ServingUnit.baseUnitsPerUnit` already uses elsewhere in this file, so
/// results stay consistent across the app.
extension ServingUnit {
    enum Dimension {
        case mass
        case volume
    }

    var dimension: Dimension { isVolume ? .volume : .mass }
}

private let unitConversionBase: [ServingUnit: Double] = [
    .g: 1,
    .kg: 1000,
    .oz: 28.349523125,
    .lb: 453.59237,
    .ml: 1,
    .cl: 10,
    .l: 1000,
    .flOz: 29.5735295625,
    .cup: 240,
    .tbsp: 15,
    .tsp: 5,
]

func isSameUnitDimension(_ a: ServingUnit, _ b: ServingUnit) -> Bool {
    a.dimension == b.dimension
}

/// Factor to multiply a quantity in `from` units by to get the equivalent quantity in `to`
/// units. Returns nil when the units are in different dimensions (mass vs. volume).
func unitConversionFactor(from: ServingUnit, to: ServingUnit) -> Double? {
    guard isSameUnitDimension(from, to),
          let fromBase = unitConversionBase[from],
          let toBase = unitConversionBase[to]
    else { return nil }
    return fromBase / toBase
}

/// Converts an ingredient `quantity` given in `from` units into the equivalent quantity in
/// `to` units, for use in macro math. Falls back to the raw quantity (factor 1) when the
/// units are in different dimensions — legacy rows that predate unit-aware validation.
func convertQuantityForMacros(_ quantity: Double, from: ServingUnit, to: ServingUnit) -> Double {
    guard let factor = unitConversionFactor(from: from, to: to) else { return quantity }
    return quantity * factor
}

/// All serving units in the same dimension (mass or volume) as `unit`.
func compatibleUnits(for unit: ServingUnit) -> [ServingUnit] {
    ServingUnit.allCases.filter { $0.dimension == unit.dimension }
}
