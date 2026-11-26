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
    let identifier: HKQuantityTypeIdentifier
    let unit: HealthNutrientUnit
    let amount: @Sendable (Food) -> Double?

    var id: String {
        key
    }

    var name: String {
        nutrientDisplayName(key)
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
    static var categories: [(name: String, nutrients: [HealthNutrient])] {
        [
            (L10n.mainMacros, [
                make("calories", .dietaryEnergyConsumed, .kilocalorie) { $0.calories },
                make("protein", .dietaryProtein, .gram) { $0.protein },
                make("carbs", .dietaryCarbohydrates, .gram) { $0.carbs },
                make("fat", .dietaryFatTotal, .gram) { $0.fat },
                make("fiber", .dietaryFiber, .gram) { $0.fiber },
                make("sugar", .dietarySugar, .gram) { $0.sugar },
            ]),
            (L10n.fatBreakdown, [
                make("saturatedFat", .dietaryFatSaturated, .gram) { $0.saturatedFat },
                make("monounsaturatedFat", .dietaryFatMonounsaturated, .gram) {
                    $0.monounsaturatedFat
                },
                make("polyunsaturatedFat", .dietaryFatPolyunsaturated, .gram) {
                    $0.polyunsaturatedFat
                },
                make("cholesterol", .dietaryCholesterol, .milligram) { $0.cholesterol },
            ]),
            (L10n.minerals, [
                make("sodium", .dietarySodium, .milligram) { $0.sodium },
                make("potassium", .dietaryPotassium, .milligram) { $0.potassium },
                make("calcium", .dietaryCalcium, .milligram) { $0.calcium },
                make("iron", .dietaryIron, .milligram) { $0.iron },
                make("magnesium", .dietaryMagnesium, .milligram) { $0.magnesium },
                make("phosphorus", .dietaryPhosphorus, .milligram) { $0.phosphorus },
                make("zinc", .dietaryZinc, .milligram) { $0.zinc },
                make("copper", .dietaryCopper, .milligram) { $0.copper },
                make("manganese", .dietaryManganese, .milligram) { $0.manganese },
                make("selenium", .dietarySelenium, .microgram) { $0.selenium },
                make("iodine", .dietaryIodine, .microgram) { $0.iodine },
                make("chromium", .dietaryChromium, .microgram) { $0.chromium },
                make("molybdenum", .dietaryMolybdenum, .microgram) { $0.molybdenum },
                make("chloride", .dietaryChloride, .milligram) { $0.chloride },
            ]),
            (L10n.vitamins, [
                make("vitaminA", .dietaryVitaminA, .microgram) { $0.vitaminA },
                make("vitaminB1", .dietaryThiamin, .milligram) { $0.vitaminB1 },
                make("vitaminB2", .dietaryRiboflavin, .milligram) { $0.vitaminB2 },
                make("vitaminB3", .dietaryNiacin, .milligram) { $0.vitaminB3 },
                make("vitaminB5", .dietaryPantothenicAcid, .milligram) {
                    $0.vitaminB5
                },
                make("vitaminB6", .dietaryVitaminB6, .milligram) { $0.vitaminB6 },
                make("vitaminB7", .dietaryBiotin, .microgram) { $0.vitaminB7 },
                make("vitaminB9", .dietaryFolate, .microgram) { $0.vitaminB9 },
                make("vitaminB12", .dietaryVitaminB12, .microgram) { $0.vitaminB12 },
                make("vitaminC", .dietaryVitaminC, .milligram) { $0.vitaminC },
                make("vitaminD", .dietaryVitaminD, .microgram) { $0.vitaminD },
                make("vitaminE", .dietaryVitaminE, .milligram) { $0.vitaminE },
                make("vitaminK", .dietaryVitaminK, .microgram) { $0.vitaminK },
            ]),
            (L10n.other, [
                make("caffeine", .dietaryCaffeine, .milligram) { $0.caffeine },
                make("water", .dietaryWater, .milliliter) { $0.water },
            ]),
        ]
    }

    private static func make(
        _ key: String,
        _ identifier: HKQuantityTypeIdentifier,
        _ unit: HealthNutrientUnit,
        _ amount: @escaping @Sendable (Food) -> Double?
    ) -> HealthNutrient {
        HealthNutrient(key: key, identifier: identifier, unit: unit, amount: amount)
    }
}
