@testable import Bissbilanz
import Foundation
import Testing

@Suite("MacroFormat amounts")
struct MacroFormatTests {
    @Test("A fractional serving size keeps its fraction instead of truncating to zero")
    func fractionalServingSize() {
        #expect(MacroFormat.nutrient(0.5) == "0.5")
        #expect(MacroFormat.nutrient(12.5) == "12.5")
    }

    @Test("A whole serving size prints without a decimal")
    func wholeServingSize() {
        #expect(MacroFormat.nutrient(1) == "1")
        #expect(MacroFormat.nutrient(250) == "250")
    }

    @Test("A fractional total servings count keeps its fraction")
    func fractionalTotalServings() {
        #expect(MacroFormat.servings(0.5) == "0.5")
        #expect(MacroFormat.servings(2.5) == "2.5")
        #expect(MacroFormat.servings(0.25) == "0.25")
    }

    @Test("A whole total servings count prints without a decimal")
    func wholeTotalServings() {
        #expect(MacroFormat.servings(4) == "4")
        #expect(MacroFormat.servings(12) == "12")
    }
}
