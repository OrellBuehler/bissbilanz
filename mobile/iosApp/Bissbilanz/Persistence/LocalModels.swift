import Foundation
import SwiftData

/// Shared coding for the `jsonData` payload columns. Each local model keeps a
/// few typed, queryable columns (mirroring the Android SQLDelight cache
/// tables) plus the full encoded Codable struct so conversions are lossless.
enum LocalStoreCoding {
    static func encode(_ value: some Encodable) -> Data {
        (try? JSONEncoder().encode(value)) ?? Data()
    }

    static func decode<T: Decodable>(_ type: T.Type, from data: Data) -> T? {
        try? JSONDecoder().decode(type, from: data)
    }
}

// MARK: - CloudKit compatibility

//
// In Local (anonymous) mode the data store mirrors to the user's private
// CloudKit database (see `LocalStore`). CloudKit can't enforce SwiftData's
// `@Attribute(.unique)` and requires every non-optional attribute to have a
// default value, so these models carry neither unique constraints nor
// non-defaulted stored properties. Uniqueness is instead enforced in code:
// every write path fetches by id (or natural key) before inserting — see the
// repositories and `LocalRemap`. Because CloudKit can independently deliver a
// row with a key another device already created, the singleton/natural-key
// models (`LocalGoals`, `LocalPreferences`, `LocalSupplementLog`,
// `LocalDayProperties`) carry a `modifiedAt` stamp and are de-duplicated
// (newest wins) by `LocalDedup`.

// MARK: - Entries

@Model
final class LocalEntry {
    var id: String = ""
    var date: String = ""
    var mealType: String = ""
    var servings: Double = 0
    var foodId: String?
    var recipeId: String?
    var foodName: String?
    var calories: Double = 0
    var protein: Double = 0
    var carbs: Double = 0
    var fat: Double = 0
    var fiber: Double = 0
    var jsonData: Data = Data()

    init(entry: Entry, date: String) {
        let dated = entry.replacingDate(date)
        id = dated.id
        self.date = date
        mealType = dated.mealType
        servings = dated.servings
        foodId = dated.foodId
        recipeId = dated.recipeId
        foodName = dated.foodName ?? dated.quickName
        calories = dated.calories ?? dated.quickCalories ?? 0
        protein = dated.protein ?? dated.quickProtein ?? 0
        carbs = dated.carbs ?? dated.quickCarbs ?? 0
        fat = dated.fat ?? dated.quickFat ?? 0
        fiber = dated.fiber ?? dated.quickFiber ?? 0
        jsonData = LocalStoreCoding.encode(dated)
    }

    func update(from entry: Entry, date: String) {
        let dated = entry.replacingDate(date)
        self.date = date
        mealType = dated.mealType
        servings = dated.servings
        foodId = dated.foodId
        recipeId = dated.recipeId
        foodName = dated.foodName ?? dated.quickName
        calories = dated.calories ?? dated.quickCalories ?? 0
        protein = dated.protein ?? dated.quickProtein ?? 0
        carbs = dated.carbs ?? dated.quickCarbs ?? 0
        fat = dated.fat ?? dated.quickFat ?? 0
        fiber = dated.fiber ?? dated.quickFiber ?? 0
        jsonData = LocalStoreCoding.encode(dated)
    }

    func toEntry() -> Entry? {
        LocalStoreCoding.decode(Entry.self, from: jsonData)
    }
}

extension Entry {
    /// Returns a copy with `date` set — list responses omit it, but the local
    /// store keys entries by date.
    func replacingDate(_ newDate: String) -> Entry {
        if date == newDate { return self }
        return (try? JSONPatch.merged(Entry.self, base: self, patch: ["date": newDate])) ?? self
    }
}

// MARK: - Foods

@Model
final class LocalFood {
    var id: String = ""
    var name: String = ""
    var brand: String?
    var calories: Double = 0
    var protein: Double = 0
    var carbs: Double = 0
    var fat: Double = 0
    var fiber: Double = 0
    var isFavorite: Bool = false
    var barcode: String?
    var jsonData: Data = Data()

    init(food: Food) {
        id = food.id
        name = food.name
        brand = food.brand
        calories = food.calories
        protein = food.protein
        carbs = food.carbs
        fat = food.fat
        fiber = food.fiber
        isFavorite = food.isFavorite
        barcode = food.barcode
        jsonData = LocalStoreCoding.encode(food)
    }

    func update(from food: Food) {
        name = food.name
        brand = food.brand
        calories = food.calories
        protein = food.protein
        carbs = food.carbs
        fat = food.fat
        fiber = food.fiber
        isFavorite = food.isFavorite
        barcode = food.barcode
        jsonData = LocalStoreCoding.encode(food)
    }

    func toFood() -> Food? {
        LocalStoreCoding.decode(Food.self, from: jsonData)
    }
}

// MARK: - Recipes

@Model
final class LocalRecipe {
    var id: String = ""
    var name: String = ""
    var totalServings: Double = 0
    var isFavorite: Bool = false
    var calories: Double = 0
    var protein: Double = 0
    var carbs: Double = 0
    var fat: Double = 0
    var fiber: Double = 0
    var jsonData: Data = Data()

    init(recipe: Recipe) {
        id = recipe.id
        name = recipe.name
        totalServings = recipe.totalServings
        isFavorite = recipe.isFavorite
        calories = recipe.calories ?? 0
        protein = recipe.protein ?? 0
        carbs = recipe.carbs ?? 0
        fat = recipe.fat ?? 0
        fiber = recipe.fiber ?? 0
        jsonData = LocalStoreCoding.encode(recipe)
    }

    func update(from recipe: Recipe) {
        name = recipe.name
        totalServings = recipe.totalServings
        isFavorite = recipe.isFavorite
        calories = recipe.calories ?? 0
        protein = recipe.protein ?? 0
        carbs = recipe.carbs ?? 0
        fat = recipe.fat ?? 0
        fiber = recipe.fiber ?? 0
        jsonData = LocalStoreCoding.encode(recipe)
    }

    func toRecipe() -> Recipe? {
        LocalStoreCoding.decode(Recipe.self, from: jsonData)
    }
}

// MARK: - Weight

@Model
final class LocalWeightEntry {
    var id: String = ""
    var entryDate: String = ""
    var weightKg: Double = 0
    var loggedAt: String?
    var jsonData: Data = Data()

    init(entry: WeightEntry) {
        id = entry.id
        entryDate = entry.entryDate
        weightKg = entry.weightKg
        loggedAt = entry.loggedAt
        jsonData = LocalStoreCoding.encode(entry)
    }

    func update(from entry: WeightEntry) {
        entryDate = entry.entryDate
        weightKg = entry.weightKg
        loggedAt = entry.loggedAt
        jsonData = LocalStoreCoding.encode(entry)
    }

    func toWeightEntry() -> WeightEntry? {
        LocalStoreCoding.decode(WeightEntry.self, from: jsonData)
    }
}

// MARK: - Sleep

@Model
final class LocalSleepEntry {
    var id: String = ""
    var entryDate: String = ""
    var durationMinutes: Int = 0
    var quality: Int = 0
    var jsonData: Data = Data()

    init(entry: SleepEntry) {
        id = entry.id
        entryDate = entry.entryDate
        durationMinutes = entry.durationMinutes
        quality = entry.quality
        jsonData = LocalStoreCoding.encode(entry)
    }

    func update(from entry: SleepEntry) {
        entryDate = entry.entryDate
        durationMinutes = entry.durationMinutes
        quality = entry.quality
        jsonData = LocalStoreCoding.encode(entry)
    }

    func toSleepEntry() -> SleepEntry? {
        LocalStoreCoding.decode(SleepEntry.self, from: jsonData)
    }
}

// MARK: - Supplements

@Model
final class LocalSupplement {
    var id: String = ""
    var name: String = ""
    var isActive: Bool = false
    var sortOrder: Int = 0
    var jsonData: Data = Data()

    init(supplement: Supplement) {
        id = supplement.id
        name = supplement.name
        isActive = supplement.isActive
        sortOrder = supplement.sortOrder
        jsonData = LocalStoreCoding.encode(supplement)
    }

    func update(from supplement: Supplement) {
        name = supplement.name
        isActive = supplement.isActive
        sortOrder = supplement.sortOrder
        jsonData = LocalStoreCoding.encode(supplement)
    }

    func toSupplement() -> Supplement? {
        LocalStoreCoding.decode(Supplement.self, from: jsonData)
    }
}

/// Taken-log rows keyed by the natural (supplementId, date) pair — the server
/// has no row id for these, mirroring the Android cache. `modifiedAt` lets
/// `LocalDedup` resolve cross-device duplicates (newest wins).
@Model
final class LocalSupplementLog {
    var id: String = ""
    var supplementId: String = ""
    var date: String = ""
    var takenAt: String = ""
    var jsonData: Data = Data()
    var modifiedAt: Double = 0

    init(log: SupplementLog) {
        id = Self.key(supplementId: log.supplementId, date: log.date)
        supplementId = log.supplementId
        date = log.date
        takenAt = log.takenAt
        jsonData = LocalStoreCoding.encode(log)
        modifiedAt = Date().timeIntervalSince1970
    }

    /// Synthetic log without server bookkeeping (`entryIds`) — used for
    /// optimistic writes and checklist-derived rows.
    convenience init(supplementId: String, date: String, takenAt: String) {
        self.init(log: SupplementLog(supplementId: supplementId, date: date, takenAt: takenAt, entryIds: []))
    }

    func update(from log: SupplementLog) {
        supplementId = log.supplementId
        date = log.date
        takenAt = log.takenAt
        jsonData = LocalStoreCoding.encode(log)
        modifiedAt = Date().timeIntervalSince1970
    }

    func toSupplementLog() -> SupplementLog? {
        LocalStoreCoding.decode(SupplementLog.self, from: jsonData)
    }

    static func key(supplementId: String, date: String) -> String {
        "\(supplementId)-\(date)"
    }
}

// MARK: - Goals (singleton row)

@Model
final class LocalGoals {
    var id: String = ""
    var jsonData: Data = Data()
    var modifiedAt: Double = 0

    static let singletonId = "goals"

    init(goals: Goals) {
        id = Self.singletonId
        jsonData = LocalStoreCoding.encode(goals)
        modifiedAt = Date().timeIntervalSince1970
    }

    func update(from goals: Goals) {
        jsonData = LocalStoreCoding.encode(goals)
        modifiedAt = Date().timeIntervalSince1970
    }

    func toGoals() -> Goals? {
        LocalStoreCoding.decode(Goals.self, from: jsonData)
    }
}

// MARK: - Preferences (singleton row)

@Model
final class LocalPreferences {
    var id: String = ""
    var jsonData: Data = Data()
    var modifiedAt: Double = 0

    static let singletonId = "preferences"

    init(preferences: Preferences) {
        id = Self.singletonId
        jsonData = LocalStoreCoding.encode(preferences)
        modifiedAt = Date().timeIntervalSince1970
    }

    func update(from preferences: Preferences) {
        jsonData = LocalStoreCoding.encode(preferences)
        modifiedAt = Date().timeIntervalSince1970
    }

    func toPreferences() -> Preferences? {
        LocalStoreCoding.decode(Preferences.self, from: jsonData)
    }
}

// MARK: - Day properties

@Model
final class LocalDayProperties {
    var date: String = ""
    var isFastingDay: Bool = false
    var jsonData: Data = Data()
    var modifiedAt: Double = 0

    init(properties: DayProperties) {
        date = properties.date
        isFastingDay = properties.isFastingDay
        jsonData = LocalStoreCoding.encode(properties)
        modifiedAt = Date().timeIntervalSince1970
    }

    func update(from properties: DayProperties) {
        isFastingDay = properties.isFastingDay
        jsonData = LocalStoreCoding.encode(properties)
        modifiedAt = Date().timeIntervalSince1970
    }

    func toDayProperties() -> DayProperties? {
        LocalStoreCoding.decode(DayProperties.self, from: jsonData)
    }
}
