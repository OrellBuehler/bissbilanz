@testable import Bissbilanz
import Foundation
import Testing

/// Golden cases — must agree with src/lib/units.test.ts and
/// mobile/shared/.../util/UnitsTest.kt.
@Suite("Unit conversion")
struct UnitConversionTests {
    @Test("Same dimension within mass")
    func sameDimensionWithinMass() {
        #expect(isSameUnitDimension(.g, .kg))
    }

    @Test("Same dimension within volume")
    func sameDimensionWithinVolume() {
        #expect(isSameUnitDimension(.ml, .cup))
    }

    @Test("Different dimension is not the same")
    func differentDimensionIsNotSame() {
        #expect(!isSameUnitDimension(.g, .ml))
        #expect(!isSameUnitDimension(.cup, .lb))
    }

    @Test("Grams and kilograms")
    func gramsAndKilograms() {
        #expect(abs(unitConversionFactor(from: .kg, to: .g)! - 1000) < 1e-9)
        #expect(abs(unitConversionFactor(from: .g, to: .kg)! - 0.001) < 1e-9)
    }

    @Test("oz -> g uses the exact factor")
    func ozToGramsExactFactor() {
        #expect(abs(unitConversionFactor(from: .oz, to: .g)! - 28.349523125) < 1e-9)
    }

    @Test("lb -> g uses the exact factor")
    func lbToGramsExactFactor() {
        #expect(abs(unitConversionFactor(from: .lb, to: .g)! - 453.59237) < 1e-9)
    }

    @Test("fl_oz -> ml uses the exact factor")
    func flOzToMlExactFactor() {
        #expect(abs(unitConversionFactor(from: .flOz, to: .ml)! - 29.5735295625) < 1e-9)
    }

    @Test("cup/tbsp/tsp -> ml match the codebase-wide rounded factors")
    func cupTbspTspMatchCodebaseWideFactors() {
        #expect(abs(unitConversionFactor(from: .cup, to: .ml)! - 240) < 1e-9)
        #expect(abs(unitConversionFactor(from: .tbsp, to: .ml)! - 15) < 1e-9)
        #expect(abs(unitConversionFactor(from: .tsp, to: .ml)! - 5) < 1e-9)
    }

    @Test("Cross dimension factor is nil")
    func crossDimensionFactorIsNil() {
        #expect(unitConversionFactor(from: .g, to: .ml) == nil)
        #expect(unitConversionFactor(from: .cup, to: .oz) == nil)
    }

    @Test("Converts tablespoons to ml")
    func convertsTablespoonsToMl() {
        #expect(abs(convertQuantityForMacros(2, from: .tbsp, to: .ml) - 30) < 1e-9)
    }

    @Test("Converts pounds to grams")
    func convertsPoundsToGrams() {
        #expect(abs(convertQuantityForMacros(1, from: .lb, to: .g) - 453.59237) < 1e-9)
    }

    @Test("Falls back to the raw quantity for a legacy cross-dimension row")
    func fallsBackToRawQuantityForCrossDimension() {
        #expect(convertQuantityForMacros(2, from: .cup, to: .g) == 2)
        #expect(convertQuantityForMacros(100, from: .g, to: .ml) == 100)
    }

    @Test("compatibleUnits excludes the other dimension")
    func compatibleUnitsExcludesOtherDimension() {
        let massUnits = compatibleUnits(for: .g)
        #expect(massUnits.contains(.kg))
        #expect(!massUnits.contains(.ml))
    }
}
