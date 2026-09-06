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

/// Partial PATCH body for `/api/entries/{id}`.
///
/// The clearable fields are double optionals on purpose. `JSONEncoder` drops a
/// nil optional entirely, and the server only touches a column when the key is
/// actually present (`'notes' in input`, `quickNutrients !== undefined`), so a
/// plain `String?` could say "leave it alone" but never "clear it" — emptying a
/// note or a nutrient silently kept the old value. `nil` omits the key,
/// `.some(nil)` sends an explicit JSON null.
struct EntryUpdate: Codable {
    var mealType: String?
    var servings: Double?
    var date: String?
    var notes: String??
    var eatenAt: String?
    var quickName: String??
    var quickCalories: Double??
    var quickProtein: Double??
    var quickCarbs: Double??
    var quickFat: Double??
    var quickFiber: Double??
    var quickNutrients: [String: Double]??
}

/// Declared in an extension so the memberwise initializer survives.
extension EntryUpdate {
    private enum CodingKeys: String, CodingKey {
        case mealType, servings, date, notes, eatenAt
        case quickName, quickCalories, quickProtein, quickCarbs, quickFat, quickFiber, quickNutrients
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        mealType = try container.decodeIfPresent(String.self, forKey: .mealType)
        servings = try container.decodeIfPresent(Double.self, forKey: .servings)
        date = try container.decodeIfPresent(String.self, forKey: .date)
        eatenAt = try container.decodeIfPresent(String.self, forKey: .eatenAt)
        notes = try container.decodeNullable(String.self, forKey: .notes)
        quickName = try container.decodeNullable(String.self, forKey: .quickName)
        quickCalories = try container.decodeNullable(Double.self, forKey: .quickCalories)
        quickProtein = try container.decodeNullable(Double.self, forKey: .quickProtein)
        quickCarbs = try container.decodeNullable(Double.self, forKey: .quickCarbs)
        quickFat = try container.decodeNullable(Double.self, forKey: .quickFat)
        quickFiber = try container.decodeNullable(Double.self, forKey: .quickFiber)
        quickNutrients = try container.decodeNullable([String: Double].self, forKey: .quickNutrients)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(mealType, forKey: .mealType)
        try container.encodeIfPresent(servings, forKey: .servings)
        try container.encodeIfPresent(date, forKey: .date)
        try container.encodeIfPresent(eatenAt, forKey: .eatenAt)
        try container.encodeNullable(notes, forKey: .notes)
        try container.encodeNullable(quickName, forKey: .quickName)
        try container.encodeNullable(quickCalories, forKey: .quickCalories)
        try container.encodeNullable(quickProtein, forKey: .quickProtein)
        try container.encodeNullable(quickCarbs, forKey: .quickCarbs)
        try container.encodeNullable(quickFat, forKey: .quickFat)
        try container.encodeNullable(quickFiber, forKey: .quickFiber)
        try container.encodeNullable(quickNutrients, forKey: .quickNutrients)
    }
}

extension KeyedDecodingContainer {
    /// Reads a field that distinguishes "absent" from "explicitly null":
    /// `nil` when the key is missing, `.some(nil)` for a JSON null.
    func decodeNullable<T: Decodable>(_ type: T.Type, forKey key: Key) throws -> T?? {
        guard contains(key) else { return nil }
        let value = try decodeIfPresent(type, forKey: key)
        return .some(value)
    }
}

extension KeyedEncodingContainer {
    /// Writes the counterpart of `decodeNullable`: omits the key for `nil` and
    /// emits an explicit JSON null for `.some(nil)`.
    mutating func encodeNullable(_ value: (some Encodable)??, forKey key: Key) throws {
        switch value {
        case .none:
            return
        case .some(.none):
            try encodeNil(forKey: key)
        case let .some(.some(unwrapped)):
            try encode(unwrapped, forKey: key)
        }
    }
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
