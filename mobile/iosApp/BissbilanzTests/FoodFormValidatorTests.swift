@testable import Bissbilanz
import Foundation
import Testing

@Suite("Food form validator")
struct FoodFormValidatorTests {
    private static func input(
        name: String = "Oats",
        brand: String = "",
        barcode: String = "",
        servingSize: String = "100",
        calories: String = "370",
        protein: String = "13",
        carbs: String = "60",
        fat: String = "7",
        fiber: String = "10",
        additional: [String: String] = [:]
    ) -> FoodFormValidator.Input {
        FoodFormValidator.Input(
            name: name,
            brand: brand,
            barcode: barcode,
            servingSize: servingSize,
            calories: calories,
            protein: protein,
            carbs: carbs,
            fat: fat,
            fiber: fiber,
            additionalValues: additional
        )
    }

    private static func issue(_ input: FoodFormValidator.Input) -> FoodFormValidator.Issue? {
        FoodFormValidator.issue(for: input)
    }

    private static func values(_ input: FoodFormValidator.Input) -> FoodFormValidator.Values? {
        switch FoodFormValidator.validate(input) {
        case let .success(parsed): parsed
        case .failure: nil
        }
    }

    @Test("a complete form yields its parsed values")
    func completeForm() throws {
        let parsed = try #require(Self.values(Self.input(brand: "Farm", barcode: "4006381333931")))
        #expect(parsed.name == "Oats")
        #expect(parsed.brand == "Farm")
        #expect(parsed.barcode == "4006381333931")
        #expect(parsed.servingSize == 100)
        #expect(parsed.calories == 370)
        #expect(parsed.protein == 13)
        #expect(parsed.carbs == 60)
        #expect(parsed.fat == 7)
        #expect(parsed.fiber == 10)
        #expect(parsed.additional.isEmpty)
    }

    @Test("name, brand and barcode are trimmed and blank brand and barcode become nil")
    func trimsText() throws {
        let padded = try #require(Self.values(Self.input(name: "  Oats \n", brand: " Farm ", barcode: " 123 ")))
        #expect(padded.name == "Oats")
        #expect(padded.brand == "Farm")
        #expect(padded.barcode == "123")

        let blank = try #require(Self.values(Self.input(brand: "   ", barcode: " ")))
        #expect(blank.brand == nil)
        #expect(blank.barcode == nil)
    }

    @Test("a blank name is required")
    func nameRequired() {
        #expect(Self.issue(Self.input(name: "")) == .nameRequired)
        #expect(Self.issue(Self.input(name: "   ")) == .nameRequired)
        #expect(Self.issue(Self.input(name: "\n\t")) == .nameRequired)
    }

    @Test("a name is capped at 200 characters like the server")
    func nameLength() {
        #expect(Self.issue(Self.input(name: String(repeating: "a", count: 200))) == nil)
        #expect(Self.issue(Self.input(name: String(repeating: "a", count: 201))) == .nameTooLong)
    }

    @Test("the cap applies after trimming")
    func nameLengthIgnoresPadding() {
        let padded = " " + String(repeating: "a", count: 200) + " "
        #expect(Self.issue(Self.input(name: padded)) == nil)
    }

    @Test("the cap counts UTF-16 units, the way the server does")
    func nameLengthCountsUtf16() {
        #expect(Self.issue(Self.input(name: String(repeating: "\u{1F600}", count: 100))) == nil)
        #expect(Self.issue(Self.input(name: String(repeating: "\u{1F600}", count: 101))) == .nameTooLong)
    }

    @Test("a brand is capped at 200 characters")
    func brandLength() {
        #expect(Self.issue(Self.input(brand: String(repeating: "b", count: 200))) == nil)
        #expect(Self.issue(Self.input(brand: String(repeating: "b", count: 201))) == .brandTooLong)
    }

    @Test("a barcode is capped at 64 characters")
    func barcodeLength() {
        #expect(Self.issue(Self.input(barcode: String(repeating: "1", count: 64))) == nil)
        #expect(Self.issue(Self.input(barcode: String(repeating: "1", count: 65))) == .barcodeTooLong)
    }

    @Test("the name is checked before everything else")
    func nameComesFirst() {
        let broken = Self.input(name: "", servingSize: "abc", calories: "")
        #expect(Self.issue(broken) == .nameRequired)
    }

    @Test("each required field is required")
    func requiredFields() {
        #expect(Self.issue(Self.input(servingSize: "")) == .requiredFieldsMissing)
        #expect(Self.issue(Self.input(calories: "")) == .requiredFieldsMissing)
        #expect(Self.issue(Self.input(protein: "")) == .requiredFieldsMissing)
        #expect(Self.issue(Self.input(carbs: "")) == .requiredFieldsMissing)
        #expect(Self.issue(Self.input(fat: "")) == .requiredFieldsMissing)
        #expect(Self.issue(Self.input(fat: "  ")) == .requiredFieldsMissing)
    }

    @Test("a blank form needs everything but fiber")
    func blankFormIsIncomplete() {
        let blank = FoodFormValidator.Input(name: "Oats")
        #expect(Self.issue(blank) == .requiredFieldsMissing)
    }

    @Test("missing fields are reported before garbage in another field")
    func missingBeforeGarbage() {
        #expect(Self.issue(Self.input(calories: "", protein: "abc")) == .requiredFieldsMissing)
    }

    @Test("blank fiber is stored as zero")
    func blankFiber() throws {
        let parsed = try #require(Self.values(Self.input(fiber: "")))
        #expect(parsed.fiber == 0)
    }

    @Test("zero is a valid macro")
    func zeroMacros() throws {
        let parsed = try #require(Self.values(Self.input(calories: "0", protein: "0", carbs: "0", fat: "0", fiber: "0")))
        #expect(parsed.calories == 0)
        #expect(parsed.fat == 0)
    }

    @Test("decimal commas parse, so a German keyboard works")
    func decimalComma() throws {
        let parsed = try #require(Self.values(Self.input(
            servingSize: "33,5", calories: "1,5", protein: "0,25", carbs: "2,75", fat: "0,5", fiber: "1,25",
            additional: ["sugar": "4,5"]
        )))
        #expect(parsed.servingSize == 33.5)
        #expect(parsed.calories == 1.5)
        #expect(parsed.protein == 0.25)
        #expect(parsed.carbs == 2.75)
        #expect(parsed.fat == 0.5)
        #expect(parsed.fiber == 1.25)
        #expect(parsed.additional == ["sugar": 4.5])
    }

    @Test("garbage in a required field is not a number")
    func garbageRequired() {
        #expect(Self.issue(Self.input(servingSize: "abc")) == .notANumber)
        #expect(Self.issue(Self.input(calories: "12kcal")) == .notANumber)
        #expect(Self.issue(Self.input(protein: "1.2.3")) == .notANumber)
        #expect(Self.issue(Self.input(carbs: "--")) == .notANumber)
        #expect(Self.issue(Self.input(fat: "nan")) == .notANumber)
        #expect(Self.issue(Self.input(calories: "inf")) == .notANumber)
    }

    @Test("garbage in fiber is not a number")
    func garbageFiber() {
        #expect(Self.issue(Self.input(fiber: "lots")) == .notANumber)
    }

    @Test("garbage in an additional nutrient is not a number")
    func garbageAdditional() {
        #expect(Self.issue(Self.input(additional: ["sugar": "much"])) == .notANumber)
    }

    @Test("blank additional nutrients are skipped")
    func blankAdditional() throws {
        let parsed = try #require(Self.values(Self.input(additional: ["sugar": "", "salt": " ", "sodium": "0,4"])))
        #expect(parsed.additional == ["sodium": 0.4])
    }

    @Test("a serving size must be positive")
    func servingMustBePositive() {
        #expect(Self.issue(Self.input(servingSize: "0")) == .invalidValues)
        #expect(Self.issue(Self.input(servingSize: "-5")) == .invalidValues)
        #expect(Self.issue(Self.input(servingSize: "0,01")) == nil)
    }

    @Test("no nutrient may be negative")
    func nutrientsNotNegative() {
        #expect(Self.issue(Self.input(calories: "-1")) == .invalidValues)
        #expect(Self.issue(Self.input(protein: "-0,1")) == .invalidValues)
        #expect(Self.issue(Self.input(carbs: "-2")) == .invalidValues)
        #expect(Self.issue(Self.input(fat: "-3")) == .invalidValues)
        #expect(Self.issue(Self.input(fiber: "-4")) == .invalidValues)
        #expect(Self.issue(Self.input(additional: ["sugar": "-1"])) == .invalidValues)
    }

    @Test("a valid form has no issue")
    func validFormHasNoIssue() {
        #expect(Self.issue(Self.input()) == nil)
    }

    @Test("every issue has a message and the length messages name the limit")
    @MainActor
    func messages() {
        let all: [FoodFormValidator.Issue] = [
            .nameRequired, .nameTooLong, .brandTooLong, .barcodeTooLong,
            .requiredFieldsMissing, .notANumber, .invalidValues,
        ]
        for issue in all {
            #expect(!issue.message.isEmpty)
        }
        #expect(FoodFormValidator.Issue.nameTooLong.message.contains("200"))
        #expect(FoodFormValidator.Issue.brandTooLong.message.contains("200"))
        #expect(FoodFormValidator.Issue.barcodeTooLong.message.contains("64"))
    }
}
