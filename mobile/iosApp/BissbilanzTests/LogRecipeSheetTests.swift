@testable import Bissbilanz
import Foundation
import Testing

@Suite("LogRecipeSheet servings")
struct LogRecipeSheetTests {
    @Test("By servings, the servings control is the amount logged")
    func byServingsUsesTheControl() {
        let servings = LogRecipeSheet.servingsToLog(
            logByWeight: false,
            servings: 2.5,
            gramsText: "",
            gramsPerServing: nil
        )
        #expect(servings == 2.5)
    }

    @Test("By servings ignores the grams field even when the recipe has a cooked weight")
    func byServingsIgnoresGrams() {
        let servings = LogRecipeSheet.servingsToLog(
            logByWeight: false,
            servings: 0.5,
            gramsText: "400",
            gramsPerServing: 200
        )
        #expect(servings == 0.5)
    }

    @Test("By weight, grams eaten are divided by the grams in one serving")
    func byWeightDividesByServingWeight() {
        let servings = LogRecipeSheet.servingsToLog(
            logByWeight: true,
            servings: 1,
            gramsText: "300",
            gramsPerServing: 200
        )
        #expect(servings == 1.5)
    }

    @Test("By weight accepts a comma as the decimal separator")
    func byWeightAcceptsComma() {
        let servings = LogRecipeSheet.servingsToLog(
            logByWeight: true,
            servings: 1,
            gramsText: "150,5",
            gramsPerServing: 100
        )
        #expect(servings == 1.505)
    }

    @Test("By weight without a cooked weight falls back to the servings control")
    func byWeightWithoutCookedWeightFallsBack() {
        let servings = LogRecipeSheet.servingsToLog(
            logByWeight: true,
            servings: 3,
            gramsText: "300",
            gramsPerServing: nil
        )
        #expect(servings == 3)
    }
}
