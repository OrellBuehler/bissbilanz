import Foundation
import HealthKit

// MARK: - Sync Direction

/// Direction of a Health sync data type, relative to the app.
enum HealthSyncDirection {
    /// Health → app (import).
    case read
    /// App → Health (export).
    case write

    var icon: String {
        switch self {
        case .read: "arrow.down.circle"
        case .write: "arrow.up.circle"
        }
    }
}

// MARK: - Nutrient Units

/// Unit the app stores a nutrient value in, mapped to the HealthKit unit the
/// sample is written with.
enum HealthNutrientUnit {
    case kilocalorie
    case gram
    case milligram
    case microgram
    /// The app stores water in grams; Health expects a volume — 1 g ≈ 1 ml.
    case milliliter

    var hkUnit: HKUnit {
        switch self {
        case .kilocalorie: .kilocalorie()
        case .gram: .gram()
        case .milligram: .gramUnit(with: .milli)
        case .microgram: .gramUnit(with: .micro)
        case .milliliter: .literUnit(with: .milli)
        }
    }
}

// MARK: - Nutrient Catalog

/// One nutrient the app can write to Apple Health as part of the daily
/// totals sync. `amount` extracts the per-serving value from a food.
struct HealthNutrient: Identifiable {
    let key: String
    let name: String
    let identifier: HKQuantityTypeIdentifier
    let unit: HealthNutrientUnit
    let amount: @Sendable (Food) -> Double?

    var id: String {
        key
    }

    /// Per-type opt-in flag — nutrients are individually enabled, off by
    /// default, and only enabled types ever request Health permission.
    var defaultsKey: String {
        "healthkit_write_nutrition_\(key)"
    }

    var isEnabled: Bool {
        UserDefaults.standard.bool(forKey: defaultsKey)
    }

    var quantityType: HKQuantityType? {
        HKQuantityType.quantityType(forIdentifier: identifier)
    }
}

extension HealthNutrient {
    static var anyEnabled: Bool {
        all.contains(where: \.isEnabled)
    }

    static let all: [HealthNutrient] = categories.flatMap(\.nutrients)

    /// Every nutrient HealthKit can store that the app tracks, grouped like
    /// the visible-nutrients page. Trans fat, omega-3/6, added sugars, sugar
    /// alcohols, starch, fluoride, alcohol and salt have no HealthKit dietary
    /// type and are deliberately absent.
    static let categories: [(name: String, nutrients: [HealthNutrient])] = [
        ("Macronutrients", [
            make("calories", "Energy", .dietaryEnergyConsumed, .kilocalorie) { $0.calories },
            make("protein", "Protein", .dietaryProtein, .gram) { $0.protein },
            make("carbs", "Carbohydrates", .dietaryCarbohydrates, .gram) { $0.carbs },
            make("fat", "Total Fat", .dietaryFatTotal, .gram) { $0.fat },
            make("fiber", "Dietary Fiber", .dietaryFiber, .gram) { $0.fiber },
            make("sugar", "Sugar", .dietarySugar, .gram) { $0.sugar },
        ]),
        ("Fat Breakdown", [
            make("saturatedFat", "Saturated Fat", .dietaryFatSaturated, .gram) { $0.saturatedFat },
            make("monounsaturatedFat", "Monounsaturated Fat", .dietaryFatMonounsaturated, .gram) {
                $0.monounsaturatedFat
            },
            make("polyunsaturatedFat", "Polyunsaturated Fat", .dietaryFatPolyunsaturated, .gram) {
                $0.polyunsaturatedFat
            },
            make("cholesterol", "Cholesterol", .dietaryCholesterol, .milligram) { $0.cholesterol },
        ]),
        ("Minerals", [
            make("sodium", "Sodium", .dietarySodium, .milligram) { $0.sodium },
            make("potassium", "Potassium", .dietaryPotassium, .milligram) { $0.potassium },
            make("calcium", "Calcium", .dietaryCalcium, .milligram) { $0.calcium },
            make("iron", "Iron", .dietaryIron, .milligram) { $0.iron },
            make("magnesium", "Magnesium", .dietaryMagnesium, .milligram) { $0.magnesium },
            make("phosphorus", "Phosphorus", .dietaryPhosphorus, .milligram) { $0.phosphorus },
            make("zinc", "Zinc", .dietaryZinc, .milligram) { $0.zinc },
            make("copper", "Copper", .dietaryCopper, .milligram) { $0.copper },
            make("manganese", "Manganese", .dietaryManganese, .milligram) { $0.manganese },
            make("selenium", "Selenium", .dietarySelenium, .microgram) { $0.selenium },
            make("iodine", "Iodine", .dietaryIodine, .microgram) { $0.iodine },
            make("chromium", "Chromium", .dietaryChromium, .microgram) { $0.chromium },
            make("molybdenum", "Molybdenum", .dietaryMolybdenum, .microgram) { $0.molybdenum },
            make("chloride", "Chloride", .dietaryChloride, .milligram) { $0.chloride },
        ]),
        ("Vitamins", [
            make("vitaminA", "Vitamin A", .dietaryVitaminA, .microgram) { $0.vitaminA },
            make("vitaminB1", "Vitamin B1 (Thiamine)", .dietaryThiamin, .milligram) { $0.vitaminB1 },
            make("vitaminB2", "Vitamin B2 (Riboflavin)", .dietaryRiboflavin, .milligram) { $0.vitaminB2 },
            make("vitaminB3", "Vitamin B3 (Niacin)", .dietaryNiacin, .milligram) { $0.vitaminB3 },
            make("vitaminB5", "Vitamin B5 (Pantothenic Acid)", .dietaryPantothenicAcid, .milligram) {
                $0.vitaminB5
            },
            make("vitaminB6", "Vitamin B6", .dietaryVitaminB6, .milligram) { $0.vitaminB6 },
            make("vitaminB7", "Vitamin B7 (Biotin)", .dietaryBiotin, .microgram) { $0.vitaminB7 },
            make("vitaminB9", "Vitamin B9 (Folate)", .dietaryFolate, .microgram) { $0.vitaminB9 },
            make("vitaminB12", "Vitamin B12", .dietaryVitaminB12, .microgram) { $0.vitaminB12 },
            make("vitaminC", "Vitamin C", .dietaryVitaminC, .milligram) { $0.vitaminC },
            make("vitaminD", "Vitamin D", .dietaryVitaminD, .microgram) { $0.vitaminD },
            make("vitaminE", "Vitamin E", .dietaryVitaminE, .milligram) { $0.vitaminE },
            make("vitaminK", "Vitamin K", .dietaryVitaminK, .microgram) { $0.vitaminK },
        ]),
        ("Other", [
            make("caffeine", "Caffeine", .dietaryCaffeine, .milligram) { $0.caffeine },
            make("water", "Water", .dietaryWater, .milliliter) { $0.water },
        ]),
    ]

    private static func make(
        _ key: String,
        _ name: String,
        _ identifier: HKQuantityTypeIdentifier,
        _ unit: HealthNutrientUnit,
        _ amount: @escaping @Sendable (Food) -> Double?
    ) -> HealthNutrient {
        HealthNutrient(key: key, name: name, identifier: identifier, unit: unit, amount: amount)
    }
}
