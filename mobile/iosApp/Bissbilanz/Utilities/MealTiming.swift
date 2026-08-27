import Foundation

/// Which meal a log defaults to at a given time of day.
///
/// The same mapping used to be written out in `FoodSearchView`, `FavoritesView`
/// and `AIMealSheet`, which is how `LogFoodForm` came to default to "Lunch"
/// while the quick-log path beside it picked from the clock — the two disagreed
/// about the meal at 8 a.m.
///
/// Returns the server's canonical capitalized casing (`DEFAULT_MEAL_TYPES`),
/// which is what synced entries carry locally. `MealTypeAppEnum.forCurrentTime`
/// is the App Intents twin and deliberately keeps its own lowercase
/// `serverValue` for the intent wire format.
enum MealTiming {
    static func mealForCurrentTime(_ date: Date = Date()) -> String {
        switch Calendar.current.component(.hour, from: date) {
        case 5 ..< 11: "Breakfast"
        case 11 ..< 14: "Lunch"
        case 14 ..< 17: "Snacks"
        default: "Dinner"
        }
    }
}
