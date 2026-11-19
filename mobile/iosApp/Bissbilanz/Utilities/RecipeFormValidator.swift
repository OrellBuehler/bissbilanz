import Foundation

enum RecipeFormValidator {
    static let maxNameLength = 200

    struct Input: Equatable {
        var name = ""
        var totalServings = ""
        var cookedWeight = ""
        var quantities: [String] = []
    }

    enum Issue: Error, Equatable {
        case nameRequired
        case nameTooLong
        case noIngredients
        case tooManyIngredients
        case invalidServings
        case invalidQuantity
        case invalidCookedWeight
    }

    struct Values: Equatable {
        let name: String
        let totalServings: Double
        let cookedWeight: Double?
        let quantities: [Double]
    }

    static func validate(_ input: Input) -> Result<Values, Issue> {
        let name = input.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return .failure(.nameRequired) }
        guard name.utf16.count <= maxNameLength else { return .failure(.nameTooLong) }
        guard !input.quantities.isEmpty else { return .failure(.noIngredients) }
        guard input.quantities.count <= RecipeIngredientLimits.maxIngredients else {
            return .failure(.tooManyIngredients)
        }
        guard let servings = positive(input.totalServings) else { return .failure(.invalidServings) }

        let quantities = input.quantities.compactMap { positive($0) }
        guard quantities.count == input.quantities.count else { return .failure(.invalidQuantity) }

        let cookedWeight = FormNumber.parse(input.cookedWeight)
        switch cookedWeight {
        case .blank:
            return .success(Values(name: name, totalServings: servings, cookedWeight: nil, quantities: quantities))
        case .invalid:
            return .failure(.invalidCookedWeight)
        case let .value(grams):
            guard grams > 0 else { return .failure(.invalidCookedWeight) }
            return .success(Values(name: name, totalServings: servings, cookedWeight: grams, quantities: quantities))
        }
    }

    static func issue(for input: Input) -> Issue? {
        switch validate(input) {
        case .success: nil
        case let .failure(issue): issue
        }
    }

    private static func positive(_ text: String) -> Double? {
        guard let value = FormNumber.parse(text).number, value > 0 else { return nil }
        return value
    }
}

extension RecipeFormValidator.Issue {
    var message: String {
        switch self {
        case .nameRequired: L10n.recipeNameRequired
        case .nameTooLong: L10n.fieldTooLong(L10n.recipeName, max: RecipeFormValidator.maxNameLength)
        case .noIngredients: L10n.recipeNeedsIngredient
        case .tooManyIngredients: L10n.addFromRecipeTooMany(RecipeIngredientLimits.maxIngredients)
        case .invalidServings: L10n.recipeServingsInvalid
        case .invalidQuantity: L10n.recipeAmountInvalid
        case .invalidCookedWeight: L10n.recipeCookedWeightInvalid
        }
    }

    var isMissingInput: Bool {
        self == .nameRequired || self == .noIngredients
    }
}
