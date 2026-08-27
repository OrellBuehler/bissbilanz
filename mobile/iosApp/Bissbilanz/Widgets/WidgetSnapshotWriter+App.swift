import Foundation
import SwiftData
import WidgetKit

/// App-only half of `WidgetSnapshotWriter` (PhoneShared/Widgets/WidgetSnapshotWriter.swift):
/// the parts that depend on `L10n` (`UserDefaults.standard`, unreachable from
/// the widget extension) and `PhoneWatchConnectivity` (`WCSession`, which
/// Apple's WatchConnectivity docs prohibit using from app extensions). The
/// widget extension's `QuickAddFoodIntent` calls the portable
/// `buildSnapshot(context:localeCode:)`/`saveAndReload(_:)` directly instead.
extension WidgetSnapshotWriter {
    private static var pendingTask: Task<Void, Never>?

    /// How far back the watch payload looks. Both builders below sit behind
    /// every repository `save()` (via `scheduleUpdate`) and run again on every
    /// foreground activation, on the main actor — and for a daily-use tracker
    /// the entry table only grows, so an unwindowed scan gets slower every day
    /// the app is used. A custom meal type unused for three months drops off
    /// the watch picker until it is logged again, which is the intended
    /// trade: the picker is "what you actually log", not "what you ever did".
    private static let mealTypeWindowDays = 90
    private static let recentsWindowDays = 30
    /// Upper bound on rows examined for the recents list, so a dense window
    /// costs no more than a sparse one. Ten distinct foods are found well
    /// inside this.
    private static let recentsScanLimit = 300

    static func scheduleUpdate(context: ModelContext) {
        pendingTask?.cancel()
        pendingTask = Task {
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            write(context: context)
        }
    }

    static func write(context: ModelContext) {
        let snapshot = buildSnapshot(context: context, localeCode: L10n.currentLocale.rawValue)
        saveAndReload(snapshot)
        PhoneWatchConnectivity.shared.sendState(buildWatchState(context: context, snapshot: snapshot))
    }

    /// Assembles the watch payload: the widget snapshot plus what the watch's
    /// tabs need that the widgets don't — the meal-type list, a recents list,
    /// the weight glance (latest + 7-day delta) and last night's sleep.
    static func buildWatchState(context: ModelContext, snapshot: WidgetSnapshot? = nil) -> WatchState {
        let snapshot = snapshot ?? buildSnapshot(context: context, localeCode: L10n.currentLocale.rawValue)
        return WatchState(
            snapshot: snapshot,
            mealTypes: mealTypes(context: context),
            recents: watchRecents(context: context),
            weight: watchWeight(context: context),
            sleep: watchSleep(context: context)
        )
    }

    /// Standard meal types the app always offers, in display order. These match
    /// the server's canonical casing (`DEFAULT_MEAL_TYPES`), which is what synced
    /// entries carry locally, so `mealTypes` recognizes them rather than
    /// re-appending them as "custom". The watch list starts from these and
    /// appends any custom meal types found in the log (see `mealTypes`).
    static let standardMealTypes = ["Breakfast", "Lunch", "Dinner", "Snacks"]

    /// Day-granularity ISO formatter for the on-device 7-day weight delta.
    private static let isoDayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()

    /// Latest weight plus the change versus ~7 days ago, computed from the local
    /// weight history so it works offline and in Local mode. `entryDate` strings
    /// ("yyyy-MM-dd") sort chronologically, so the newest row at or before the
    /// cutoff is the reference point.
    private static func watchWeight(context: ModelContext) -> WatchWeightInfo {
        var descriptor = FetchDescriptor<LocalWeightEntry>(
            sortBy: [SortDescriptor(\.entryDate, order: .reverse)]
        )
        descriptor.fetchLimit = 60
        let rows = (try? context.fetch(descriptor)) ?? []
        guard let latest = rows.first else { return .empty }

        var delta7d: Double?
        if let latestDay = isoDayFormatter.date(from: latest.entryDate),
           let cutoffDay = Calendar.current.date(byAdding: .day, value: -7, to: latestDay)
        {
            let cutoff = isoDayFormatter.string(from: cutoffDay)
            if let reference = rows.first(where: { $0.entryDate <= cutoff }) {
                delta7d = latest.weightKg - reference.weightKg
            }
        }
        return WatchWeightInfo(latestKg: latest.weightKg, latestDate: latest.entryDate, delta7dKg: delta7d)
    }

    /// Last night's sleep (the most recent entry), or `nil` when none is logged.
    /// Decoded through `toSleepEntry()` so the decimal quality is preserved (the
    /// index column is an `Int`).
    private static func watchSleep(context: ModelContext) -> WatchSleepInfo? {
        var descriptor = FetchDescriptor<LocalSleepEntry>(
            sortBy: [SortDescriptor(\.entryDate, order: .reverse)]
        )
        descriptor.fetchLimit = 1
        guard let entry = (try? context.fetch(descriptor))?.first?.toSleepEntry() else { return nil }
        return WatchSleepInfo(
            date: entry.entryDate,
            durationMinutes: entry.durationMinutes,
            quality: entry.quality
        )
    }

    /// Server-driven meal types, learned from the synced log: the standard set
    /// first, then any custom meal types the user has actually logged. Never a
    /// hardcoded-only list, so custom server meal types reach the watch — and,
    /// since `LogFoodForm` reads the same list, the phone's log form too.
    static func mealTypes(context: ModelContext) -> [String] {
        let cutoff = DateFormatting.isoString(from: Date().adding(days: -mealTypeWindowDays))
        let entries = (try? context.fetch(
            FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.date >= cutoff })
        )) ?? []
        // Compare case-insensitively: optimistic, not-yet-synced entries can still
        // carry a client's lowercase casing, and we don't want those reappearing
        // as phantom "custom" duplicates of the standard set.
        let standardKeys = Set(standardMealTypes.map { $0.lowercased() })
        let custom = Set(entries.map(\.mealType))
            .filter { !standardKeys.contains($0.lowercased()) }
            .sorted()
        return standardMealTypes + custom
    }

    /// Recently logged foods (most recent first), derived from the local entry
    /// log the same way the in-app recents list is. Recipes are skipped — the
    /// watch logs by food id in Phase 1.
    private static func watchRecents(context: ModelContext, limit: Int = 10) -> [WatchFoodRef] {
        // Read off the typed columns instead of decoding `jsonData`: `foodName`
        // and `calories` are stored already coalesced with their `quick*`
        // counterparts, so `displayName`/`totalCalories` add nothing here. That
        // drops the per-entry JSON decode this used to pay on every save.
        //
        // Ordering is by day, descending, which loses the intra-day precision
        // `createdAt` gave — the only reason the decode existed. Within a
        // single day the order is the store's, which for a "recently logged"
        // list is close enough to not be worth a decode per row.
        let cutoff = DateFormatting.isoString(from: Date().adding(days: -recentsWindowDays))
        var descriptor = FetchDescriptor<LocalEntry>(
            predicate: #Predicate { $0.foodId != nil && $0.date >= cutoff },
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        descriptor.fetchLimit = recentsScanLimit

        var seenFoodIds: Set<String> = []
        var recents: [WatchFoodRef] = []
        for row in (try? context.fetch(descriptor)) ?? [] {
            guard let foodId = row.foodId, seenFoodIds.insert(foodId).inserted else { continue }
            recents.append(WatchFoodRef(
                id: foodId,
                name: row.foodName ?? "Unknown",
                calories: row.calories
            ))
            if recents.count == limit { break }
        }
        return recents
    }
}
