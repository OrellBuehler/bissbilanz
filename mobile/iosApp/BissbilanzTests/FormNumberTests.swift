@testable import Bissbilanz
import Foundation
import Testing

@Suite("Form number parsing")
struct FormNumberTests {
    @Test("blank and whitespace-only text is blank")
    func blank() {
        #expect(FormNumber.parse("") == .blank)
        #expect(FormNumber.parse("   ") == .blank)
        #expect(FormNumber.parse("\n") == .blank)
    }

    @Test("dot and comma decimals both parse")
    func decimals() {
        #expect(FormNumber.parse("12") == .value(12))
        #expect(FormNumber.parse("12.5") == .value(12.5))
        #expect(FormNumber.parse("12,5") == .value(12.5))
        #expect(FormNumber.parse(" 0,25 ") == .value(0.25))
        #expect(FormNumber.parse("-3,5") == .value(-3.5))
    }

    @Test("garbage and non-finite input is invalid")
    func invalid() {
        #expect(FormNumber.parse("abc") == .invalid)
        #expect(FormNumber.parse("1.2.3") == .invalid)
        #expect(FormNumber.parse("1,2,3") == .invalid)
        #expect(FormNumber.parse("12g") == .invalid)
        #expect(FormNumber.parse("-") == .invalid)
        #expect(FormNumber.parse(",") == .invalid)
        #expect(FormNumber.parse("nan") == .invalid)
        #expect(FormNumber.parse("inf") == .invalid)
        #expect(FormNumber.parse("-infinity") == .invalid)
    }

    @Test("number is only set for a parsed value")
    func number() {
        #expect(FormNumber.parse("4,5").number == 4.5)
        #expect(FormNumber.parse("").number == nil)
        #expect(FormNumber.parse("x").number == nil)
    }
}
