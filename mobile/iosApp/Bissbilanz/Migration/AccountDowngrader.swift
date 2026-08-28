import Foundation
import SwiftData

/// Turns a synced account into a local-only install: downloads the complete
/// account history into the SwiftData store, then deletes the server account
/// and flips the app to `AppMode.local` — the user keeps all their data
/// on-device. The inverse of `LocalDataMigrator` (which uploads local data on
/// sign-in); because the download writes canonical server rows (real UUIDs, no
/// `temp_` ids), a later sign-in simply migrates them back up through the
/// normal migration path. Mirrors the Android `AccountDowngrader`.
@MainActor
final class AccountDowngrader {
    enum Phase {
        case syncing
        case downloading
        case deleting
    }

    enum DowngradeError: Error {
        case pendingChanges
    }

    private let api: BissbilanzAPI
    private let context: ModelContext
    private let syncManager: SyncManager
    private let authManager: AuthManager
    private let appModeManager: AppModeManager

    private static let windowDays = 360

    init(
        api: BissbilanzAPI,
        context: ModelContext,
        syncManager: SyncManager,
        authManager: AuthManager,
        appModeManager: AppModeManager
    ) {
        self.api = api
        self.context = context
        self.syncManager = syncManager
        self.authManager = authManager
        self.appModeManager = appModeManager
    }

    func downgrade(onPhase: (Phase) -> Void) async throws {
        onPhase(.syncing)
        _ = await syncManager.drainPendingQueue()
        guard syncManager.pendingCount == 0 else {
            throw DowngradeError.pendingChanges
        }

        onPhase(.downloading)
        // Account creation bounds all data — nothing can predate it.
        let floor = (try await api.getAccount().createdAt).map { String($0.prefix(10)) } ?? "2024-01-01"
        let today = DateFormatting.today

        // Fetch the complete account into memory first; the store is only
        // touched once everything arrived, so a failed download changes nothing.
        var foods: [Food] = []
        var offset = 0
        while true {
            let page = try await api.getFoods(limit: 200, offset: offset)
            foods.append(contentsOf: page)
            if page.count < 200 { break }
            offset += 200
        }

        var recipes: [Recipe] = []
        for summary in try await api.getRecipes() {
            // Details carry the ingredient list — required for local editing.
            recipes.append(try await api.getRecipe(id: summary.id))
        }

        let supplements = try await api.getSupplements()

        var entries: [Entry] = []
        var supplementLogs: [SupplementHistoryEntry] = []
        var sleepEntries: [SleepEntry] = []
        var dayProperties: [DayProperties] = []
        try await forEachWindow(floor: floor, today: today) { from, to in
            entries.append(contentsOf: try await self.api.getEntriesRange(startDate: from, endDate: to))
            supplementLogs.append(
                contentsOf: try await self.api.getSupplementHistory(startDate: from, endDate: to)
            )
            sleepEntries.append(contentsOf: try await self.api.getSleepEntries(from: from, to: to))
            dayProperties.append(
                contentsOf: try await self.api.getDayPropertiesRange(startDate: from, endDate: to)
            )
        }

        let weightEntries = try await api.getWeightEntries()
        let goals = try await api.getGoals()
        let preferences = try await api.getPreferences()

        // Replace the cache wholesale — the sync queue is empty (checked
        // above), so there are no optimistic local rows to preserve.
        try? context.delete(model: LocalEntry.self)
        try? context.delete(model: LocalFood.self)
        try? context.delete(model: LocalRecipe.self)
        try? context.delete(model: LocalWeightEntry.self)
        try? context.delete(model: LocalSleepEntry.self)
        try? context.delete(model: LocalSupplement.self)
        try? context.delete(model: LocalSupplementLog.self)
        try? context.delete(model: LocalGoals.self)
        try? context.delete(model: LocalPreferences.self)
        try? context.delete(model: LocalDayProperties.self)

        for food in foods {
            context.insert(LocalFood(food: food))
        }
        for recipe in recipes {
            context.insert(LocalRecipe(recipe: recipe))
        }
        for supplement in supplements {
            context.insert(LocalSupplement(supplement: supplement))
        }
        for entry in entries {
            context.insert(LocalEntry(entry: entry, date: entry.date ?? today))
        }
        for log in supplementLogs {
            context.insert(
                LocalSupplementLog(supplementId: log.supplementId, date: log.date, takenAt: log.takenAt)
            )
        }
        for entry in weightEntries {
            context.insert(LocalWeightEntry(entry: entry))
        }
        for entry in sleepEntries {
            context.insert(LocalSleepEntry(entry: entry))
        }
        for day in dayProperties {
            context.insert(LocalDayProperties(properties: day))
        }
        if let goals {
            context.insert(LocalGoals(goals: goals))
        }
        context.insert(LocalPreferences(preferences: preferences))
        try context.save()

        // Past this point the server account is deleted — the local store is
        // now the primary one.
        onPhase(.deleting)
        try await api.deleteAccount()
        syncManager.clearQueue()
        authManager.logout()
        appModeManager.setMode(.local)
    }

    /// Runs `block` over the range in windows the server accepts (≤366 days).
    private func forEachWindow(
        floor: String,
        today: String,
        block: (String, String) async throws -> Void
    ) async throws {
        guard var to = DateFormatting.date(from: today),
              let start = DateFormatting.date(from: floor)
        else { return }
        let calendar = Calendar.current
        while to >= start {
            let windowStart = calendar.date(byAdding: .day, value: -(Self.windowDays - 1), to: to) ?? start
            let from = max(windowStart, start)
            try await block(DateFormatting.isoString(from: from), DateFormatting.isoString(from: to))
            guard let next = calendar.date(byAdding: .day, value: -1, to: from) else { break }
            to = next
        }
    }
}
