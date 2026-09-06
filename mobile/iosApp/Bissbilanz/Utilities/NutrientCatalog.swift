import Foundation

/// Supported extended nutrients, grouped for "Add Nutrient" menus. Keys match
/// the FoodCreate/quick-entry JSON fields; units mirror the food detail view.
/// Shared between `FoodEditForm` and `QuickEntrySheet`.
enum NutrientCatalog {
    static let categories: [AdditionalNutrientCategory] = [
        AdditionalNutrientCategory(title: "Fat Breakdown", nutrients: [
            AdditionalNutrientSpec(key: "saturatedFat", label: "Saturated Fat", unit: "g"),
            AdditionalNutrientSpec(key: "monounsaturatedFat", label: "Monounsaturated Fat", unit: "g"),
            AdditionalNutrientSpec(key: "polyunsaturatedFat", label: "Polyunsaturated Fat", unit: "g"),
            AdditionalNutrientSpec(key: "transFat", label: "Trans Fat", unit: "g"),
            AdditionalNutrientSpec(key: "cholesterol", label: "Cholesterol", unit: "mg"),
            AdditionalNutrientSpec(key: "omega3", label: "Omega-3", unit: "g"),
            AdditionalNutrientSpec(key: "omega6", label: "Omega-6", unit: "g"),
        ]),
        AdditionalNutrientCategory(title: "Sugars & Carbs", nutrients: [
            AdditionalNutrientSpec(key: "sugar", label: "Sugar", unit: "g"),
            AdditionalNutrientSpec(key: "addedSugars", label: "Added Sugars", unit: "g"),
            AdditionalNutrientSpec(key: "sugarAlcohols", label: "Sugar Alcohols", unit: "g"),
            AdditionalNutrientSpec(key: "starch", label: "Starch", unit: "g"),
        ]),
        AdditionalNutrientCategory(title: "Minerals", nutrients: [
            AdditionalNutrientSpec(key: "sodium", label: "Sodium", unit: "mg"),
            AdditionalNutrientSpec(key: "potassium", label: "Potassium", unit: "mg"),
            AdditionalNutrientSpec(key: "calcium", label: "Calcium", unit: "mg"),
            AdditionalNutrientSpec(key: "iron", label: "Iron", unit: "mg"),
            AdditionalNutrientSpec(key: "magnesium", label: "Magnesium", unit: "mg"),
            AdditionalNutrientSpec(key: "phosphorus", label: "Phosphorus", unit: "mg"),
            AdditionalNutrientSpec(key: "zinc", label: "Zinc", unit: "mg"),
            AdditionalNutrientSpec(key: "copper", label: "Copper", unit: "mg"),
            AdditionalNutrientSpec(key: "manganese", label: "Manganese", unit: "mg"),
            AdditionalNutrientSpec(key: "selenium", label: "Selenium", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "iodine", label: "Iodine", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "fluoride", label: "Fluoride", unit: "mg"),
            AdditionalNutrientSpec(key: "chromium", label: "Chromium", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "molybdenum", label: "Molybdenum", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "chloride", label: "Chloride", unit: "mg"),
        ]),
        AdditionalNutrientCategory(title: "Vitamins", nutrients: [
            AdditionalNutrientSpec(key: "vitaminA", label: "Vitamin A", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "vitaminC", label: "Vitamin C", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminD", label: "Vitamin D", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "vitaminE", label: "Vitamin E", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminK", label: "Vitamin K", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "vitaminB1", label: "Vitamin B1", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminB2", label: "Vitamin B2", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminB3", label: "Vitamin B3", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminB5", label: "Vitamin B5", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminB6", label: "Vitamin B6", unit: "mg"),
            AdditionalNutrientSpec(key: "vitaminB7", label: "Vitamin B7", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "vitaminB9", label: "Vitamin B9", unit: "\u{00B5}g"),
            AdditionalNutrientSpec(key: "vitaminB12", label: "Vitamin B12", unit: "\u{00B5}g"),
        ]),
        AdditionalNutrientCategory(title: "Other", nutrients: [
            AdditionalNutrientSpec(key: "caffeine", label: "Caffeine", unit: "mg"),
            AdditionalNutrientSpec(key: "alcohol", label: "Alcohol", unit: "g"),
            AdditionalNutrientSpec(key: "water", label: "Water", unit: "g"),
            AdditionalNutrientSpec(key: "salt", label: "Salt", unit: "g"),
        ]),
    ]

    static var all: [AdditionalNutrientSpec] {
        categories.flatMap(\.nutrients)
    }

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
    let label: String
    let unit: String
    var id: String { key }
}

struct AdditionalNutrientCategory: Identifiable {
    let title: String
    let nutrients: [AdditionalNutrientSpec]
    var id: String { title }
}
