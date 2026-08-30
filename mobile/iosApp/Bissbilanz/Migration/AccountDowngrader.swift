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
    /// Rows written between main-thread yields. The store replacement runs on
    /// the main actor (the app's only `ModelContext`), so it has to hand the run
    /// loop back regularly — a multi-year account is tens of thousands of rows,
    /// and one uninterrupted write is a frozen UI and a watchdog kill.
    private static let insertChunk = 200

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
        try await drainPendingQueue()

        onPhase(.downloading)
        let account = try await api.getAccount()
        let today = DateFormatting.today
        let createdOn = account.user.createdAt.map { String($0.prefix(10)) }
        // The account's own dated rows bound the download, NOT its creation
        // date: entry/sleep/weight/day dates are client-chosen, so imported or
        // backfilled days legitimately predate the account, and a device running
        // ahead of UTC can log a day past the server's "today".
        let floor = [account.dataRange.earliest, createdOn].compactMap { $0 }.min() ?? "2024-01-01"
        let ceiling = max(account.dataRange.latest ?? today, today)

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

        // `all: true` — archived supplements are as unrecoverable as any other
        // row once the account is deleted.
        let supplements = try await api.getSupplements(all: true)

        var entries: [Entry] = []
        var supplementLogs: [SupplementHistoryEntry] = []
        var sleepEntries: [SleepEntry] = []
        var dayProperties: [DayProperties] = []
        try await forEachWindow(floor: floor, ceiling: ceiling) { from, to in
            entries.append(contentsOf: try await self.api.getEntriesRange(startDate: from, endDate: to))
            supplementLogs.append(
                contentsOf: try await self.api.getSupplementHistory(startDate: from, endDate: to)
            )
            sleepEntries.append(contentsOf: try await self.api.getSleepEntries(from: from, to: to))
            dayProperties.append(
                contentsOf: try await self.api.getDayPropertiesRange(startDate: from, endDate: to)
            )
        }

        // Server-hosted photos die with the account, so pull each one into the
        // App Group image store and repoint the row at the local file. A photo
        // that can't be fetched loses its reference rather than keeping a URL
        // that will 404 forever.
        let localizedFoods = await localizePhotos(foods, url: \.imageUrl) { food, url in
            try? JSONPatch.merged(Food.self, base: food, patch: ["imageUrl": url as Any])
        }
        let localizedRecipes = await localizePhotos(recipes, url: \.imageUrl) { recipe, url in
            try? JSONPatch.merged(Recipe.self, base: recipe, patch: ["imageUrl": url as Any])
        }

        let weightEntries = try await api.getWeightEntries()
        let goals = try await api.getGoals()
        let preferences = try await api.getPreferences()

        // Replace the cache wholesale — the sync queue is empty (checked
        // above), so there are no optimistic local rows to preserve. The
        // batch deletes below are applied straight to the persistent store and
        // are NOT undone by a failing `save()`, so anything that throws from
        // here on leaves a partially emptied cache. That is recoverable — the
        // account still exists (it is deleted further down) and the next
        // refresh re-fills the store — but it must not be silent, so the
        // deletes propagate their errors instead of being swallowed.
        try context.delete(model: LocalEntry.self)
        try context.delete(model: LocalFood.self)
        try context.delete(model: LocalRecipe.self)
        try context.delete(model: LocalWeightEntry.self)
        try context.delete(model: LocalSleepEntry.self)
        try context.delete(model: LocalSupplement.self)
        try context.delete(model: LocalSupplementLog.self)
        try context.delete(model: LocalGoals.self)
        try context.delete(model: LocalPreferences.self)
        try context.delete(model: LocalDayProperties.self)

        await insert(localizedFoods) { LocalFood(food: $0) }
        await insert(localizedRecipes) { LocalRecipe(recipe: $0) }
        await insert(supplements) { LocalSupplement(supplement: $0) }
        await insert(entries) { LocalEntry(entry: $0, date: $0.date ?? today) }
        await insert(supplementLogs) {
            LocalSupplementLog(supplementId: $0.supplementId, date: $0.date, takenAt: $0.takenAt)
        }
        await insert(weightEntries) { LocalWeightEntry(entry: $0) }
        await insert(sleepEntries) { LocalSleepEntry(entry: $0) }
        await insert(dayProperties) { LocalDayProperties(properties: $0) }
        if let goals {
            context.insert(LocalGoals(goals: goals))
        }
        context.insert(LocalPreferences(preferences: preferences))
        try context.save()

        onPhase(.deleting)
        try await finalizeDowngrade()
    }

    /// Empties the sync queue, or throws. A single drain uploads only the
    /// operations that are due, so a device that was offline for a while needs
    /// several passes — but an operation that never uploads must not spin here
    /// forever, hence "stop as soon as a pass makes no progress".
    private func drainPendingQueue() async throws {
        var pending = syncManager.pendingCount
        while pending > 0 {
            _ = await syncManager.drainPendingQueue()
            let remaining = syncManager.pendingCount
            if remaining >= pending {
                throw DowngradeError.pendingChanges
            }
            pending = remaining
        }
    }

    /// Deletes the server account and switches the app to Local mode.
    ///
    /// Step order is load-bearing and must not be "improved": authenticated +
    /// `.local` is what routes the app to the migration screen, so the mode may
    /// only flip once the session is gone. Everything after the delete is
    /// therefore ordered so it cannot leave the app in `.synced` against an
    /// account that no longer exists — that state is how the user ends up
    /// signing out and wiping the data this download just rescued.
    private func finalizeDowngrade() async throws {
        try await api.deleteAccount()
        syncManager.clearQueue()
        authManager.logout()
        appModeManager.setMode(.local)
    }

    /// Downloads every `/uploads/` photo in `items` into `LocalImageStore` and
    /// rewrites the row's URL to the resulting `file://` path. Rows without a
    /// server-hosted photo (none, or a public Open Food Facts URL) pass through
    /// untouched, as do rows whose download fails.
    private func localizePhotos<T>(
        _ items: [T],
        url: KeyPath<T, String?>,
        rewrite: (T, String) -> T?
    ) async -> [T] {
        var result: [T] = []
        result.reserveCapacity(items.count)
        for item in items {
            guard let imageUrl = item[keyPath: url],
                  let key = LocalImageStore.cacheKey(for: imageUrl)
            else {
                result.append(item)
                continue
            }
            var file = LocalImageStore.cachedFile(for: imageUrl)
            if file == nil, let data = try? await api.downloadImage(path: imageUrl) {
                file = LocalImageStore.write(data, named: key)
            }
            guard let file else {
                result.append(item)
                continue
            }
            result.append(rewrite(item, file.absoluteString) ?? item)
        }
        return result
    }

    private func insert<T, M: PersistentModel>(_ items: [T], _ make: (T) -> M) async {
        for (index, item) in items.enumerated() {
            context.insert(make(item))
            if index % Self.insertChunk == Self.insertChunk - 1 {
                await Task.yield()
            }
        }
    }

    /// Runs `block` over the range in windows the server accepts (≤366 days).
    private func forEachWindow(
        floor: String,
        ceiling: String,
        block: (String, String) async throws -> Void
    ) async throws {
        guard let start = DateFormatting.date(from: floor),
              let end = DateFormatting.date(from: ceiling)
        else { return }
        var to = max(end, start)
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
