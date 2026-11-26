import Foundation

/// Supported extended nutrients, grouped for "Add Nutrient" menus. Keys match
/// the FoodCreate/quick-entry JSON fields; units mirror the food detail view.
/// Shared between `FoodEditForm` and `QuickEntrySheet`.
enum NutrientCatalog {
    static var categories: [AdditionalNutrientCategory] {
        [
            AdditionalNutrientCategory(title: L10n.fatBreakdown, nutrients: [
                AdditionalNutrientSpec(key: "saturatedFat", unit: "g"),
                AdditionalNutrientSpec(key: "monounsaturatedFat", unit: "g"),
                AdditionalNutrientSpec(key: "polyunsaturatedFat", unit: "g"),
                AdditionalNutrientSpec(key: "transFat", unit: "g"),
                AdditionalNutrientSpec(key: "cholesterol", unit: "mg"),
                AdditionalNutrientSpec(key: "omega3", unit: "g"),
                AdditionalNutrientSpec(key: "omega6", unit: "g"),
            ]),
            AdditionalNutrientCategory(title: L10n.sugarsCarbs, nutrients: [
                AdditionalNutrientSpec(key: "sugar", unit: "g"),
                AdditionalNutrientSpec(key: "addedSugars", unit: "g"),
                AdditionalNutrientSpec(key: "sugarAlcohols", unit: "g"),
                AdditionalNutrientSpec(key: "starch", unit: "g"),
            ]),
            AdditionalNutrientCategory(title: L10n.minerals, nutrients: [
                AdditionalNutrientSpec(key: "sodium", unit: "mg"),
                AdditionalNutrientSpec(key: "potassium", unit: "mg"),
                AdditionalNutrientSpec(key: "calcium", unit: "mg"),
                AdditionalNutrientSpec(key: "iron", unit: "mg"),
                AdditionalNutrientSpec(key: "magnesium", unit: "mg"),
                AdditionalNutrientSpec(key: "phosphorus", unit: "mg"),
                AdditionalNutrientSpec(key: "zinc", unit: "mg"),
                AdditionalNutrientSpec(key: "copper", unit: "mg"),
                AdditionalNutrientSpec(key: "manganese", unit: "mg"),
                AdditionalNutrientSpec(key: "selenium", unit: "\u{00B5}g"),
                AdditionalNutrientSpec(key: "iodine", unit: "\u{00B5}g"),
                AdditionalNutrientSpec(key: "fluoride", unit: "mg"),
                AdditionalNutrientSpec(key: "chromium", unit: "\u{00B5}g"),
                AdditionalNutrientSpec(key: "molybdenum", unit: "\u{00B5}g"),
                AdditionalNutrientSpec(key: "chloride", unit: "mg"),
            ]),
            AdditionalNutrientCategory(title: L10n.vitamins, nutrients: [
                AdditionalNutrientSpec(key: "vitaminA", unit: "\u{00B5}g"),
                AdditionalNutrientSpec(key: "vitaminC", unit: "mg"),
                AdditionalNutrientSpec(key: "vitaminD", unit: "\u{00B5}g"),
                AdditionalNutrientSpec(key: "vitaminE", unit: "mg"),
                AdditionalNutrientSpec(key: "vitaminK", unit: "\u{00B5}g"),
                AdditionalNutrientSpec(key: "vitaminB1", unit: "mg"),
                AdditionalNutrientSpec(key: "vitaminB2", unit: "mg"),
                AdditionalNutrientSpec(key: "vitaminB3", unit: "mg"),
                AdditionalNutrientSpec(key: "vitaminB5", unit: "mg"),
                AdditionalNutrientSpec(key: "vitaminB6", unit: "mg"),
                AdditionalNutrientSpec(key: "vitaminB7", unit: "\u{00B5}g"),
                AdditionalNutrientSpec(key: "vitaminB9", unit: "\u{00B5}g"),
                AdditionalNutrientSpec(key: "vitaminB12", unit: "\u{00B5}g"),
            ]),
            AdditionalNutrientCategory(title: L10n.other, nutrients: [
                AdditionalNutrientSpec(key: "caffeine", unit: "mg"),
                AdditionalNutrientSpec(key: "alcohol", unit: "g"),
                AdditionalNutrientSpec(key: "water", unit: "g"),
                AdditionalNutrientSpec(key: "salt", unit: "g"),
            ]),
        ]
    }

    static let all: [AdditionalNutrientSpec] = categories.flatMap(\.nutrients)

    /// Nutrient rows the user has added a value for, in catalog order.
    static func added(from values: [String: String]) -> [AdditionalNutrientSpec] {
        all.filter { values[$0.key] != nil }
    }

    /// "Add Nutrient" menu categories: everything not already added, restricted
    /// to the user's enabled nutrients (nil or empty means every nutrient).
    static func addable(
        excluding values: [String: String],
        visibleKeys: Set<String>?
    ) -> [AdditionalNutrientCategory] {
        let showAll = visibleKeys?.isEmpty ?? true
        return categories.compactMap { category in
            let nutrients = category.nutrients.filter { spec in
                values[spec.key] == nil && (showAll || visibleKeys?.contains(spec.key) == true)
            }
            guard !nutrients.isEmpty else { return nil }
            return AdditionalNutrientCategory(title: category.title, nutrients: nutrients)
        }
    }
}

struct AdditionalNutrientSpec: Identifiable {
    let key: String
    let unit: String
    var id: String { key }
    var label: String { nutrientDisplayName(key) }
}

struct AdditionalNutrientCategory: Identifiable {
    let title: String
    let nutrients: [AdditionalNutrientSpec]
    var id: String { title }
}
