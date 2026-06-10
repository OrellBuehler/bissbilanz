import Foundation
import Observation
import SwiftData

/// Local-first repository for food entries and day properties.
///
/// Reads come from SwiftData, `refresh(date:)` replaces the cached day with
/// the server response (mirroring Android's `cacheEntries`), and writes go to
/// SwiftData first with the API call layered on top. On API failure the local
/// row is kept and the error is rethrown for the view to surface.
@MainActor
@Observable
final class EntryRepository {
    private let context: ModelContext
    private let api: BissbilanzAPI

    init(context: ModelContext, api: BissbilanzAPI) {
        self.context = context
        self.api = api
    }

    // MARK: - Reads (local)

    func entries(date: String) -> [Entry] {
        let descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.date == date })
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toEntry() }.sorted { lhs, rhs in
            let l = lhs.createdAt ?? lhs.eatenAt ?? ""
            let r = rhs.createdAt ?? rhs.eatenAt ?? ""
            if l != r { return l < r }
            return lhs.id < rhs.id
        }
    }

    // MARK: - Refresh (API → store)

    func refresh(date: String) async throws {
        let fetched = try await api.getEntries(date: date)
        try? context.delete(model: LocalEntry.self, where: #Predicate { $0.date == date })
        for entry in fetched {
            upsert(entry, date: date)
        }
        save()
    }

    // MARK: - Writes (local first, then API)

    @discardableResult
    func createEntry(_ create: EntryCreate, food: Food? = nil, recipe: Recipe? = nil) async throws -> Entry {
        let temp = Self.makeEntry(from: create, id: LocalStore.makeTempId(), food: food, recipe: recipe)
        upsert(temp, date: create.date)
        save()
        // POST responses are raw DB rows without resolved macros — merge the
        // resolved display fields from the optimistic local entry. On failure
        // the local row is kept (the sync-queue package will upload it later;
        // for now the rethrown error keeps this flow online-required).
        let server = try await api.createEntry(create)
        let merged = Self.merge(server: server, local: temp)
        deleteRow(id: temp.id)
        upsert(merged, date: merged.date ?? create.date)
        save()
        return merged
    }

    @discardableResult
    func updateEntry(id: String, _ update: EntryUpdate) async throws -> Entry {
        var local: Entry?
        if let row = fetchRow(id: id), let existing = row.toEntry() {
            let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
            let updated = (try? JSONPatch.merged(Entry.self, base: existing, patch: patch)) ?? existing
            row.update(from: updated, date: update.date ?? row.date)
            save()
            local = updated
        }
        // Temp rows don't exist server-side yet; the local edit is all we can do.
        if LocalStore.isTempId(id), let local {
            return local
        }
        let server = try await api.updateEntry(id: id, update)
        // PATCH responses are raw DB rows without resolved macros — prefer the
        // locally merged entry for display and keep server bookkeeping fields.
        if let local {
            let merged = Self.merge(server: server, local: local)
            upsert(merged, date: merged.date ?? DateFormatting.today)
            save()
            return merged
        }
        return server
    }

    func deleteEntry(id: String) async throws {
        deleteRow(id: id)
        save()
        guard !LocalStore.isTempId(id) else { return }
        try await api.deleteEntry(id: id)
    }

    /// Server-side copy (responses are raw rows), then re-fetch the target day
    /// so resolved macros land in the store. Returns the number copied.
    @discardableResult
    func copyEntries(fromDate: String, toDate: String) async throws -> Int {
        let copied = try await api.copyEntries(fromDate: fromDate, toDate: toDate)
        try await refresh(date: toDate)
        return copied.count
    }

    // MARK: - Day properties

    func isFastingDay(date: String) -> Bool {
        fetchDayPropertiesRow(date: date)?.isFastingDay ?? false
    }

    func refreshDayProperties(date: String) async throws {
        if let properties = try await api.getDayProperties(date: date) {
            upsertDayProperties(properties)
        } else if let row = fetchDayPropertiesRow(date: date) {
            context.delete(row)
        }
        save()
    }

    func setDayProperties(date: String, isFastingDay: Bool) async throws {
        upsertDayProperties(DayProperties(date: date, userId: "", isFastingDay: isFastingDay))
        save()
        let server = try await api.setDayProperties(date: date, isFastingDay: isFastingDay)
        upsertDayProperties(server)
        save()
    }

    func deleteDayProperties(date: String) async throws {
        if let row = fetchDayPropertiesRow(date: date) {
            context.delete(row)
            save()
        }
        try await api.deleteDayProperties(date: date)
    }

    // MARK: - Conversion helpers

    static func makeEntry(from create: EntryCreate, id: String, food: Food?, recipe: Recipe?) -> Entry {
        let recipeServings = (recipe?.totalServings).map { max($0, 1) } ?? 1
        return Entry(
            id: id,
            mealType: create.mealType,
            servings: create.servings,
            notes: create.notes,
            foodId: create.foodId,
            recipeId: create.recipeId,
            quickName: create.quickName,
            quickCalories: create.quickCalories,
            quickProtein: create.quickProtein,
            quickCarbs: create.quickCarbs,
            quickFat: create.quickFat,
            quickFiber: create.quickFiber,
            foodName: food?.name ?? recipe?.name,
            calories: food?.calories ?? recipe?.calories.map { $0 / recipeServings },
            protein: food?.protein ?? recipe?.protein.map { $0 / recipeServings },
            carbs: food?.carbs ?? recipe?.carbs.map { $0 / recipeServings },
            fat: food?.fat ?? recipe?.fat.map { $0 / recipeServings },
            fiber: food?.fiber ?? recipe?.fiber.map { $0 / recipeServings },
            servingSize: food?.servingSize,
            servingUnit: food?.servingUnit,
            date: create.date,
            eatenAt: create.eatenAt,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            updatedAt: nil
        )
    }

    /// Server rows win where present; resolved display fields missing from raw
    /// POST/PATCH responses fall back to the optimistic local entry.
    static func merge(server: Entry, local: Entry) -> Entry {
        Entry(
            id: server.id,
            mealType: server.mealType,
            servings: server.servings,
            notes: server.notes ?? local.notes,
            foodId: server.foodId ?? local.foodId,
            recipeId: server.recipeId ?? local.recipeId,
            quickName: server.quickName ?? local.quickName,
            quickCalories: server.quickCalories ?? local.quickCalories,
            quickProtein: server.quickProtein ?? local.quickProtein,
            quickCarbs: server.quickCarbs ?? local.quickCarbs,
            quickFat: server.quickFat ?? local.quickFat,
            quickFiber: server.quickFiber ?? local.quickFiber,
            foodName: server.foodName ?? local.foodName,
            calories: server.calories ?? local.calories,
            protein: server.protein ?? local.protein,
            carbs: server.carbs ?? local.carbs,
            fat: server.fat ?? local.fat,
            fiber: server.fiber ?? local.fiber,
            servingSize: server.servingSize ?? local.servingSize,
            servingUnit: server.servingUnit ?? local.servingUnit,
            date: server.date ?? local.date,
            eatenAt: server.eatenAt ?? local.eatenAt,
            createdAt: server.createdAt ?? local.createdAt,
            updatedAt: server.updatedAt ?? local.updatedAt
        )
    }

    // MARK: - Store helpers

    private func fetchRow(id: String) -> LocalEntry? {
        var descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsert(_ entry: Entry, date: String) {
        if let row = fetchRow(id: entry.id) {
            row.update(from: entry, date: date)
        } else {
            context.insert(LocalEntry(entry: entry, date: date))
        }
    }

    private func deleteRow(id: String) {
        if let row = fetchRow(id: id) {
            context.delete(row)
        }
    }

    private func fetchDayPropertiesRow(date: String) -> LocalDayProperties? {
        var descriptor = FetchDescriptor<LocalDayProperties>(predicate: #Predicate { $0.date == date })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsertDayProperties(_ properties: DayProperties) {
        if let row = fetchDayPropertiesRow(date: properties.date) {
            row.update(from: properties)
        } else {
            context.insert(LocalDayProperties(properties: properties))
        }
    }

    private func save() {
        try? context.save()
    }
}
