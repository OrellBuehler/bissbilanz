import Foundation

enum FoodFormValidator {
    static let maxNameLength = 200
    static let maxBrandLength = 200
    static let maxBarcodeLength = 64

    struct Input: Equatable {
        var name = ""
        var brand = ""
        var barcode = ""
        var servingSize = ""
        var calories = ""
        var protein = ""
        var carbs = ""
        var fat = ""
        var fiber = ""
        var additionalValues: [String: String] = [:]
    }

    enum Issue: Error, Equatable {
        case nameRequired
        case nameTooLong
        case brandTooLong
        case barcodeTooLong
        case requiredFieldsMissing
        case notANumber
        case invalidValues
    }

    struct Values: Equatable {
        let name: String
        let brand: String?
        let barcode: String?
        let servingSize: Double
        let calories: Double
        let protein: Double
        let carbs: Double
        let fat: Double
        let fiber: Double
        let additional: [String: Double]
    }

    static func validate(_ input: Input) -> Result<Values, Issue> {
        let name = trimmed(input.name)
        let brand = trimmed(input.brand)
        let barcode = trimmed(input.barcode)
        guard !name.isEmpty else { return .failure(.nameRequired) }
        guard name.utf16.count <= maxNameLength else { return .failure(.nameTooLong) }
        guard brand.utf16.count <= maxBrandLength else { return .failure(.brandTooLong) }
        guard barcode.utf16.count <= maxBarcodeLength else { return .failure(.barcodeTooLong) }

        let serving = FormNumber.parse(input.servingSize)
        let calories = FormNumber.parse(input.calories)
        let protein = FormNumber.parse(input.protein)
        let carbs = FormNumber.parse(input.carbs)
        let fat = FormNumber.parse(input.fat)
        guard ![serving, calories, protein, carbs, fat].contains(.blank) else {
            return .failure(.requiredFieldsMissing)
        }
        guard let servingValue = serving.number,
              let caloriesValue = calories.number,
              let proteinValue = protein.number,
              let carbsValue = carbs.number,
              let fatValue = fat.number
        else {
            return .failure(.notANumber)
        }

        let fiber = FormNumber.parse(input.fiber)
        let extras = input.additionalValues.mapValues { FormNumber.parse($0) }
        guard fiber != .invalid, !extras.values.contains(.invalid) else {
            return .failure(.notANumber)
        }

        let fiberValue = fiber.number ?? 0
        let additional = extras.compactMapValues { $0.number }
        let nutrients = [caloriesValue, proteinValue, carbsValue, fatValue, fiberValue] + Array(additional.values)
        guard servingValue > 0, nutrients.allSatisfy({ $0 >= 0 }) else {
            return .failure(.invalidValues)
        }

        return .success(Values(
            name: name,
            brand: brand.isEmpty ? nil : brand,
            barcode: barcode.isEmpty ? nil : barcode,
            servingSize: servingValue,
            calories: caloriesValue,
            protein: proteinValue,
            carbs: carbsValue,
            fat: fatValue,
            fiber: fiberValue,
            additional: additional
        ))
    }

    static func issue(for input: Input) -> Issue? {
        switch validate(input) {
        case .success: nil
        case let .failure(issue): issue
        }
    }

    private static func trimmed(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

extension FoodFormValidator.Issue {
    var message: String {
        switch self {
        case .nameRequired: L10n.foodFormNameRequired
        case .nameTooLong: L10n.fieldTooLong(L10n.name, max: FoodFormValidator.maxNameLength)
        case .brandTooLong: L10n.fieldTooLong(L10n.brand, max: FoodFormValidator.maxBrandLength)
        case .barcodeTooLong: L10n.fieldTooLong(L10n.barcode, max: FoodFormValidator.maxBarcodeLength)
        case .requiredFieldsMissing: L10n.foodFormRequiredFields
        case .notANumber: L10n.foodFormNotANumber
        case .invalidValues: L10n.foodFormInvalidValues
        }
    }
}
