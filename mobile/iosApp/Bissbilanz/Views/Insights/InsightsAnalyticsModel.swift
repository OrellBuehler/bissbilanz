import Foundation
import Observation
import shared
import SwiftData

/// Drives the three analytics tabs: keeps the local store stocked for the
/// selected window, then computes every card from it via the shared Kotlin.
///
/// Local-first on purpose. The store is read and rendered immediately so the
/// cards appear offline and in Local mode, and the backfill that follows only
/// widens what the *next* computation can see. Nothing here needs the network to
/// produce a result — it only needs the network to produce a *complete* one.
@MainActor
@Observable
final class InsightsAnalyticsModel {
    enum Window: Int, CaseIterable, Identifiable {
        case week = 7
        case month = 30
        case quarter = 90

        var id: Int { rawValue }
        var days: Int { rawValue }
    }

    private(set) var bundle: InsightsBundle?
    private(set) var isLoading = false

    var range: Window = .month {
        didSet { if range != oldValue { backfilledRanges.removeAll() } }
    }

    /// Windows already pulled from the server this session. The backfill is a
    /// whole-range refetch, so repeating it on every tab switch would be pure
    /// waste — the sync queue keeps the local store current in between.
    private var backfilledRanges: Set<Int> = []

    /// Recomputes from whatever is cached, then backfills and recomputes if this
    /// window has not been pulled yet this session.
    func load(context: ModelContext, entries: EntryRepository, foods: FoodRepository) async {
        isLoading = bundle == nil
        compute(context: context)
        isLoading = false

        guard !backfilledRanges.contains(range.days) else { return }
        backfilledRanges.insert(range.days)
        await backfill(entries: entries, foods: foods)
        compute(context: context)
    }

    /// Pull-to-refresh: always refetches the window, even if already backfilled.
    func refresh(context: ModelContext, entries: EntryRepository, foods: FoodRepository) async {
        backfilledRanges.insert(range.days)
        await backfill(entries: entries, foods: foods)
        compute(context: context)
    }

    private func compute(context: ModelContext) {
        let (start, end) = dateRange()
        bundle = LocalInsights.compute(context: context, startDate: start, endDate: end)
    }

    /// Best-effort: a failure here just means the cards render on whatever is
    /// already cached, which is the same thing that happens offline.
    private func backfill(entries: EntryRepository, foods: FoodRepository) async {
        let (start, end) = dateRange()
        try? await entries.refreshRange(startDate: start, endDate: end)
        // Entries carry no extended nutrients, so the foods behind them have to
        // be present locally for the sodium/caffeine/omega/NOVA cards to resolve.
        try? await foods.mirrorAll()
    }

    private func dateRange() -> (String, String) {
        let today = Date()
        return (
            DateFormatting.isoString(from: today.adding(days: -(range.days - 1))),
            DateFormatting.isoString(from: today)
        )
    }
}
