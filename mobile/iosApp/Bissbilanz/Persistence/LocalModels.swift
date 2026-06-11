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

// MARK: - Entries

@Model
final class LocalEntry {
    @Attribute(.unique) var id: String
    var date: String
    var mealType: String
    var servings: Double
    var foodId: String?
    var recipeId: String?
    var foodName: String?
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    var fiber: Double
    var jsonData: Data

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
    @Attribute(.unique) var id: String
    var name: String
    var brand: String?
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    var fiber: Double
    var isFavorite: Bool
    var barcode: String?
    var jsonData: Data

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
    @Attribute(.unique) var id: String
    var name: String
    var totalServings: Double
    var isFavorite: Bool
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    var fiber: Double
    var jsonData: Data

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
    @Attribute(.unique) var id: String
    var entryDate: String
    var weightKg: Double
    var loggedAt: String?
    var jsonData: Data

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
    @Attribute(.unique) var id: String
    var entryDate: String
    var durationMinutes: Int
    var quality: Int
    var jsonData: Data

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
    @Attribute(.unique) var id: String
    var name: String
    var isActive: Bool
    var sortOrder: Int
    var jsonData: Data

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
/// has no row id for these, mirroring the Android cache.
@Model
final class LocalSupplementLog {
    @Attribute(.unique) var id: String
    var supplementId: String
    var date: String
    var takenAt: String
    var jsonData: Data

    init(log: SupplementLog) {
        id = Self.key(supplementId: log.supplementId, date: log.date)
        supplementId = log.supplementId
        date = log.date
        takenAt = log.takenAt
        jsonData = LocalStoreCoding.encode(log)
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
    @Attribute(.unique) var id: String
    var jsonData: Data

    static let singletonId = "goals"

    init(goals: Goals) {
        id = Self.singletonId
        jsonData = LocalStoreCoding.encode(goals)
    }

    func update(from goals: Goals) {
        jsonData = LocalStoreCoding.encode(goals)
    }

    func toGoals() -> Goals? {
        LocalStoreCoding.decode(Goals.self, from: jsonData)
    }
}

// MARK: - Preferences (singleton row)

@Model
final class LocalPreferences {
    @Attribute(.unique) var id: String
    var jsonData: Data

    static let singletonId = "preferences"

    init(preferences: Preferences) {
        id = Self.singletonId
        jsonData = LocalStoreCoding.encode(preferences)
    }

    func update(from preferences: Preferences) {
        jsonData = LocalStoreCoding.encode(preferences)
    }

    func toPreferences() -> Preferences? {
        LocalStoreCoding.decode(Preferences.self, from: jsonData)
    }
}

// MARK: - Day properties

@Model
final class LocalDayProperties {
    @Attribute(.unique) var date: String
    var isFastingDay: Bool
    var jsonData: Data

    init(properties: DayProperties) {
        date = properties.date
        isFastingDay = properties.isFastingDay
        jsonData = LocalStoreCoding.encode(properties)
    }

    func update(from properties: DayProperties) {
        isFastingDay = properties.isFastingDay
        jsonData = LocalStoreCoding.encode(properties)
    }

    func toDayProperties() -> DayProperties? {
        LocalStoreCoding.decode(DayProperties.self, from: jsonData)
    }
}
