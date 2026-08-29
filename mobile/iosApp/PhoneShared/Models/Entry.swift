import Foundation

/// Matches the flat shape of GET /api/entries items: per-serving macros are
/// pre-resolved server-side (quick values, food, or recipe macros). The fields
/// `foodName`/`calories`/... are absent in POST/PATCH responses (raw DB rows),
/// and `date` is absent in list responses — both must stay optional.
struct Entry: Codable, Identifiable {
    let id: String
    let mealType: String
    let servings: Double
    let notes: String?
    let foodId: String?
    let recipeId: String?
    /// Set on the ingredient entries the server creates for a logged supplement.
    /// Carried locally so the migration back up doesn't re-upload them on top of
    /// the ones `logSupplement` recreates server-side. `var` with a default so
    /// the memberwise init stays source-compatible with existing call sites.
    var supplementId: String? = nil
    let quickName: String?
    let quickCalories: Double?
    let quickProtein: Double?
    let quickCarbs: Double?
    let quickFat: Double?
    let quickFiber: Double?
    let quickNutrients: [String: Double]?
    let foodName: String?
    let calories: Double?
    let protein: Double?
    let carbs: Double?
    let fat: Double?
    let fiber: Double?
    let servingSize: Double?
    let servingUnit: ServingUnit?
    let date: String?
    let eatenAt: String?
    let createdAt: String?
    let updatedAt: String?

    var displayName: String {
        foodName ?? quickName ?? "Unknown"
    }

    var totalCalories: Double {
        (calories ?? quickCalories ?? 0) * servings
    }

    var totalProtein: Double {
        (protein ?? quickProtein ?? 0) * servings
    }

    var totalCarbs: Double {
        (carbs ?? quickCarbs ?? 0) * servings
    }

    var totalFat: Double {
        (fat ?? quickFat ?? 0) * servings
    }

    var totalFiber: Double {
        (fiber ?? quickFiber ?? 0) * servings
    }

    /// When the entry was logged, preferring the user-set eaten time and
    /// falling back to the row's creation timestamp. `nil` when neither parses.
    var loggedAt: Date? {
        if let eatenAt, let date = DateFormatting.isoDateTime(from: eatenAt) { return date }
        if let createdAt, let date = DateFormatting.isoDateTime(from: createdAt) { return date }
        return nil
    }

    /// Short local time-of-day ("1:30 PM") for display, or `nil` when unknown.
    var loggedTimeString: String? {
        guard let loggedAt else { return nil }
        return DateFormatting.timeString(from: loggedAt)
    }
}

struct EntryCreate: Codable {
    var foodId: String?
    var recipeId: String?
    let mealType: String
    let servings: Double
    let date: String
    var notes: String?
    var quickName: String?
    var quickCalories: Double?
    var quickProtein: Double?
    var quickCarbs: Double?
    var quickFat: Double?
    var quickFiber: Double?
    var quickNutrients: [String: Double]?
    var eatenAt: String?
}

struct EntryUpdate: Codable {
    var mealType: String?
    var servings: Double?
    var date: String?
    var notes: String?
    var eatenAt: String?
}

struct EntriesResponse: Codable {
    let entries: [Entry]
}

struct EntryResponse: Codable {
    let entry: Entry
}

/// Canonical grouping/ordering for meal types. The server normalizes the four
/// built-in meals to capitalized forms (`normalizeMealType`: "dinner" ->
/// "Dinner") while the client logs them lowercase, so an optimistic entry
/// ("dinner") and its synced counterpart ("Dinner") would otherwise land in
/// separate groups and render as two cards for the same meal. Collapsing to a
/// lowercase canonical key keeps each built-in meal in a single card; custom
/// meal types pass through unchanged.
enum MealGrouping {
    static let order = ["breakfast", "lunch", "dinner", "snacks"]

    static func canonicalKey(_ raw: String) -> String {
        switch raw.lowercased() {
        case "breakfast": "breakfast"
        case "lunch": "lunch"
        case "dinner": "dinner"
        case "snacks", "snack": "snacks"
        default: raw
        }
    }

    /// Groups entries into meal cards using the canonical key, ordered
    /// breakfast → lunch → dinner → snacks, then custom meals alphabetically.
    static func group(_ entries: [Entry]) -> [(String, [Entry])] {
        let grouped = Dictionary(grouping: entries) { canonicalKey($0.mealType) }
        let ordered = order.compactMap { meal -> (String, [Entry])? in
            guard let items = grouped[meal], !items.isEmpty else { return nil }
            return (meal, items)
        }
        let custom = grouped
            .filter { !order.contains($0.key) }
            .sorted { $0.key < $1.key }
            .map { ($0.key, $0.value) }
        return ordered + custom
    }
}
