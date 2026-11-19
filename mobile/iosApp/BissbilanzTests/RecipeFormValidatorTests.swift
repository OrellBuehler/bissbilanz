@testable import Bissbilanz
import Foundation
import Testing

@Suite("Recipe form validator")
struct RecipeFormValidatorTests {
    private static func input(
        name: String = "Porridge",
        totalServings: String = "2",
        cookedWeight: String = "",
        quantities: [String] = ["100"]
    ) -> RecipeFormValidator.Input {
        RecipeFormValidator.Input(
            name: name, totalServings: totalServings, cookedWeight: cookedWeight, quantities: quantities
        )
    }

    private static func issue(_ input: RecipeFormValidator.Input) -> RecipeFormValidator.Issue? {
        RecipeFormValidator.issue(for: input)
    }

    private static func values(_ input: RecipeFormValidator.Input) -> RecipeFormValidator.Values? {
        switch RecipeFormValidator.validate(input) {
        case let .success(parsed): parsed
        case .failure: nil
        }
    }

    @Test("a complete form yields its parsed values")
    func completeForm() throws {
        let parsed = try #require(Self.values(Self.input(
            totalServings: "4", cookedWeight: "850", quantities: ["100", "2,5", "0.5"]
        )))
        #expect(parsed.name == "Porridge")
        #expect(parsed.totalServings == 4)
        #expect(parsed.cookedWeight == 850)
        #expect(parsed.quantities == [100, 2.5, 0.5])
    }

    @Test("the name is trimmed")
    func trimsName() throws {
        let parsed = try #require(Self.values(Self.input(name: "  Porridge \n")))
        #expect(parsed.name == "Porridge")
    }

    @Test("a blank name is required")
    func nameRequired() {
        #expect(Self.issue(Self.input(name: "")) == .nameRequired)
        #expect(Self.issue(Self.input(name: "   ")) == .nameRequired)
    }

    @Test("a name is capped at 200 characters like the server")
    func nameLength() {
        #expect(Self.issue(Self.input(name: String(repeating: "r", count: 200))) == nil)
        #expect(Self.issue(Self.input(name: String(repeating: "r", count: 201))) == .nameTooLong)
        #expect(Self.issue(Self.input(name: " " + String(repeating: "r", count: 200) + " ")) == nil)
    }

    @Test("the cap counts UTF-16 units, the way the server does")
    func nameLengthCountsUtf16() {
        #expect(Self.issue(Self.input(name: String(repeating: "\u{1F600}", count: 100))) == nil)
        #expect(Self.issue(Self.input(name: String(repeating: "\u{1F600}", count: 101))) == .nameTooLong)
    }

    @Test("at least one ingredient is required")
    func needsAnIngredient() {
        #expect(Self.issue(Self.input(quantities: [])) == .noIngredients)
    }

    @Test("at most 100 ingredients are allowed")
    func ingredientCap() {
        #expect(Self.issue(Self.input(quantities: Array(repeating: "1", count: 100))) == nil)
        #expect(Self.issue(Self.input(quantities: Array(repeating: "1", count: 101))) == .tooManyIngredients)
    }

    @Test("the ingredient cap is the server's")
    func ingredientCapMatchesServer() {
        #expect(RecipeIngredientLimits.maxIngredients == 100)
        #expect(RecipeFormValidator.maxNameLength == 200)
    }

    @Test("total servings must be a positive number")
    func servings() {
        #expect(Self.issue(Self.input(totalServings: "")) == .invalidServings)
        #expect(Self.issue(Self.input(totalServings: "0")) == .invalidServings)
        #expect(Self.issue(Self.input(totalServings: "-1")) == .invalidServings)
        #expect(Self.issue(Self.input(totalServings: "abc")) == .invalidServings)
        #expect(Self.issue(Self.input(totalServings: "inf")) == .invalidServings)
        #expect(Self.issue(Self.input(totalServings: "1,5")) == nil)
    }

    @Test("an ingredient quantity must be a positive number, never defaulted to 1")
    func quantities() {
        #expect(Self.issue(Self.input(quantities: ["100", ""])) == .invalidQuantity)
        #expect(Self.issue(Self.input(quantities: ["100", "abc"])) == .invalidQuantity)
        #expect(Self.issue(Self.input(quantities: ["0"])) == .invalidQuantity)
        #expect(Self.issue(Self.input(quantities: ["-2"])) == .invalidQuantity)
        #expect(Self.issue(Self.input(quantities: ["nan"])) == .invalidQuantity)
        #expect(Self.issue(Self.input(quantities: ["0,25"])) == nil)
    }

    @Test("servings are checked before quantities")
    func servingsBeforeQuantities() {
        #expect(Self.issue(Self.input(totalServings: "0", quantities: ["abc"])) == .invalidServings)
    }

    @Test("a blank cooked weight is stored as nothing")
    func blankCookedWeight() throws {
        let empty = try #require(Self.values(Self.input(cookedWeight: "")))
        let spaces = try #require(Self.values(Self.input(cookedWeight: "  ")))
        #expect(empty.cookedWeight == nil)
        #expect(spaces.cookedWeight == nil)
    }

    @Test("a cooked weight must be a positive number")
    func cookedWeight() throws {
        #expect(Self.issue(Self.input(cookedWeight: "0")) == .invalidCookedWeight)
        #expect(Self.issue(Self.input(cookedWeight: "-5")) == .invalidCookedWeight)
        #expect(Self.issue(Self.input(cookedWeight: "heavy")) == .invalidCookedWeight)
        #expect(Self.issue(Self.input(cookedWeight: "inf")) == .invalidCookedWeight)
        let parsed = try #require(Self.values(Self.input(cookedWeight: "1250,5")))
        #expect(parsed.cookedWeight == 1250.5)
    }

    @Test("only the missing-input issues stay quiet inline")
    func missingInput() {
        #expect(RecipeFormValidator.Issue.nameRequired.isMissingInput)
        #expect(RecipeFormValidator.Issue.noIngredients.isMissingInput)
        #expect(!RecipeFormValidator.Issue.nameTooLong.isMissingInput)
        #expect(!RecipeFormValidator.Issue.tooManyIngredients.isMissingInput)
        #expect(!RecipeFormValidator.Issue.invalidServings.isMissingInput)
        #expect(!RecipeFormValidator.Issue.invalidQuantity.isMissingInput)
        #expect(!RecipeFormValidator.Issue.invalidCookedWeight.isMissingInput)
    }

    @Test("every issue has a message and the cap messages name the limit")
    @MainActor
    func messages() {
        let all: [RecipeFormValidator.Issue] = [
            .nameRequired, .nameTooLong, .noIngredients, .tooManyIngredients,
            .invalidServings, .invalidQuantity, .invalidCookedWeight,
        ]
        for issue in all {
            #expect(!issue.message.isEmpty)
        }
        #expect(RecipeFormValidator.Issue.nameTooLong.message.contains("200"))
        #expect(RecipeFormValidator.Issue.tooManyIngredients.message.contains("100"))
    }
}
