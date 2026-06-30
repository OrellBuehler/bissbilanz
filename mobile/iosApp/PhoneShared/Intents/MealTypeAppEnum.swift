import AppIntents
import Foundation

/// The server's four meal types, surfaced to App Intents / Siri / Shortcuts as
/// a selectable enum. The raw value is the wire value (`mealType` on
/// `EntryCreate`), so `serverValue` is just `rawValue` — kept as a named
/// accessor so call sites read intentionally and a future server-driven set of
/// custom meal types has one place to diverge.
enum MealTypeAppEnum: String, AppEnum, CaseIterable {
    case breakfast
    case lunch
    case dinner
    case snacks

    /// Wire value for `EntryCreate.mealType`.
    var serverValue: String {
        rawValue
    }

    /// Meal a log defaults to when the user doesn't say one — mirrors the
    /// time-of-day mapping the in-app quick-log uses (`FoodSearchView`).
    static func forCurrentTime(_ date: Date = Date()) -> MealTypeAppEnum {
        switch Calendar.current.component(.hour, from: date) {
        case 5 ..< 11: .breakfast
        case 11 ..< 14: .lunch
        case 14 ..< 17: .snacks
        default: .dinner
        }
    }

    /// App Intents metadata is extracted statically, so these stay English
    /// literals; the runtime confirmation dialog is localized via `L10n`.
    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Meal")
    }

    static var caseDisplayRepresentations: [MealTypeAppEnum: DisplayRepresentation] {
        [
            .breakfast: DisplayRepresentation(title: "Breakfast", image: .init(systemName: "sunrise")),
            .lunch: DisplayRepresentation(title: "Lunch", image: .init(systemName: "sun.max")),
            .dinner: DisplayRepresentation(title: "Dinner", image: .init(systemName: "moon.stars")),
            .snacks: DisplayRepresentation(title: "Snacks", image: .init(systemName: "carrot")),
        ]
    }
}
