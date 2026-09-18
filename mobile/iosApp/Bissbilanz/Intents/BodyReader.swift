import Foundation

/// The weight movement over a window, as `GetWeightIntent` speaks it. Plain
/// values rather than the entities themselves so the struct stays `Sendable`.
/// An empty window reports `count == 0` with zeroed figures instead of
/// optionals everywhere — the same shape as `WeeklyNutritionStats`.
struct WeightTrendSummary: Sendable {
    /// The window as asked for, so a caller can say "over the last 7 days"
    /// even when only two of those days carry an entry.
    let days: Int
    let firstDate: String
    let lastDate: String
    let firstKg: Double
    let lastKg: Double
    let averageKg: Double
    let count: Int

    /// Positive when the newest entry is heavier than the oldest one in the
    /// window.
    var deltaKg: Double {
        lastKg - firstKg
    }

    /// A single entry is a value, not a trend — there is nothing to compare it
    /// against.
    var hasTrend: Bool {
        count >= 2
    }

    var isEmpty: Bool {
        count == 0
    }

    static func empty(days: Int) -> WeightTrendSummary {
        WeightTrendSummary(
            days: days,
            firstDate: "",
            lastDate: "",
            firstKg: 0,
            lastKg: 0,
            averageKg: 0,
            count: 0
        )
    }
}

/// The sleep averages over a window, as `GetSleepIntent` speaks them. Best and
/// worst are by length, which is the figure the answer already names.
struct SleepStats: Sendable {
    let days: Int
    let nights: Int
    let averageDurationMinutes: Int
    /// Averaged over the nights that carry a quality (> 0); zero when none do.
    let averageQuality: Double
    let bestDurationMinutes: Int
    let bestDate: String
    let worstDurationMinutes: Int
    let worstDate: String

    var isEmpty: Bool {
        nights == 0
    }

    static func empty(days: Int) -> SleepStats {
        SleepStats(
            days: days,
            nights: 0,
            averageDurationMinutes: 0,
            averageQuality: 0,
            bestDurationMinutes: 0,
            bestDate: "",
            worstDurationMinutes: 0,
            worstDate: ""
        )
    }
}

/// Thrown by a read intent that has nothing to answer with. App Intents speaks
/// the `localizedStringResource`, so "no weight logged yet" reaches the user as
/// a sentence instead of a generic failure.
struct IntentDataUnavailableError: Error, CustomLocalizedStringResourceConvertible {
    let message: String

    var localizedStringResource: LocalizedStringResource {
        "\(message)"
    }
}

/// The body-metrics counterpart to `NutritionReader`: the weight and sleep
/// values the Siri data-query intents answer with, and the entities
/// `IntentDonations` pushes into the Spotlight index.
///
/// Registered in `AppDependencyManager` (see `BissbilanzApp.init`) because App
/// Intents run in a separate launch of the app, outside the SwiftUI environment
/// the views use. Wraps the existing repositories rather than fetching itself,
/// so a spoken answer is computed from exactly the rows the Weight and Sleep
/// screens show — including in Local mode and offline. Deliberately free of UI
/// types.
@MainActor
final class BodyReader {
    /// How far back the queries and the launch-time backfill may look. Bounded
    /// so a "find entries" action can never walk the whole store.
    static let searchWindowDays = 365

    /// How far a spoken number may sit from a logged weight and still count as
    /// that entry ("seventy-six" → 76.4 kg).
    static let weightMatchToleranceKg = 0.5

    private let weightRepository: WeightRepository
    private let sleepRepository: SleepRepository

    init(weightRepository: WeightRepository, sleepRepository: SleepRepository) {
        self.weightRepository = weightRepository
        self.sleepRepository = sleepRepository
    }

    // MARK: - Weight

    func weight(id: String) -> WeightEntity? {
        let rows = sortedWeights()
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return nil }
        return entity(rows, at: index)
    }

    /// The entries for the given ids, newest first. Ids with no stored row are
    /// dropped — that is how the Spotlight reindex learns a row is gone.
    func weights(ids: [String]) -> [WeightEntity] {
        let wanted = Set(ids)
        guard !wanted.isEmpty else { return [] }
        let rows = sortedWeights()
        return rows.indices.compactMap { index in
            wanted.contains(rows[index].id) ? entity(rows, at: index) : nil
        }
    }

    func latestWeight() -> WeightEntity? {
        let rows = sortedWeights(limit: 2)
        guard !rows.isEmpty else { return nil }
        return entity(rows, at: 0)
    }

    /// The entry on, or nearest to, an ISO day — the date half of the string
    /// query, exposed here so it can be exercised without the App Intents
    /// machinery.
    func weightEntity(for date: String) -> WeightEntity? {
        guard let match = weightRepository.closest(to: date) else { return nil }
        return weight(id: match.id)
    }

    /// Resolves what the user said to entries: a date phrase ("yesterday",
    /// "Montag", "2026-09-16") to the entry nearest that day, or a number
    /// ("76", "76,4", "76.4 kg") to every entry within
    /// `weightMatchToleranceKg`, newest first.
    func weights(matching text: String, now: Date = Date()) -> [WeightEntity] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        if let date = DaySummaryQuery.resolveDate(trimmed, now: now) {
            return [weightEntity(for: date)].compactMap { $0 }
        }
        guard let value = Self.weightValue(in: trimmed) else { return [] }
        let rows = sortedWeights()
        return rows.indices.compactMap { index in
            abs(rows[index].weightKg - value) <= Self.weightMatchToleranceKg ? entity(rows, at: index) : nil
        }
    }

    /// Both days inclusive, newest first.
    func weights(from startDate: String, to endDate: String) -> [WeightEntity] {
        let rows = sortedWeights()
        return rows.indices.compactMap { index in
            let date = rows[index].entryDate
            guard date >= startDate, date <= endDate else { return nil }
            return entity(rows, at: index)
        }
    }

    /// The last `days` days up to today — what the launch-time Spotlight
    /// backfill indexes.
    func weights(lastDays days: Int, now: Date = Date()) -> [WeightEntity] {
        let (startDate, endDate) = Self.window(days: days, now: now)
        return weights(from: startDate, to: endDate)
    }

    /// The most recent entries, newest first.
    func recentWeights(limit: Int = 7) -> [WeightEntity] {
        guard limit > 0 else { return [] }
        // One row past the limit so the oldest entry returned still knows what
        // came before it and can report its own delta.
        let rows = sortedWeights(limit: limit + 1)
        return rows.indices.prefix(limit).map { entity(rows, at: $0) }
    }

    func weightTrend(days: Int, now: Date = Date()) -> WeightTrendSummary {
        let (startDate, endDate) = Self.window(days: days, now: now)
        let window = sortedWeights().filter { $0.entryDate >= startDate && $0.entryDate <= endDate }
        guard let newest = window.first, let oldest = window.last else {
            return WeightTrendSummary.empty(days: days)
        }
        return WeightTrendSummary(
            days: days,
            firstDate: oldest.entryDate,
            lastDate: newest.entryDate,
            firstKg: oldest.weightKg,
            lastKg: newest.weightKg,
            averageKg: window.reduce(0) { $0 + $1.weightKg } / Double(window.count),
            count: window.count
        )
    }

    // MARK: - Sleep

    func sleep(id: String) -> SleepEntity? {
        sleepRepository.entries().first { $0.id == id }.map(SleepEntity.init)
    }

    /// The nights for the given ids, newest first. Ids with no stored row are
    /// dropped — that is how the Spotlight reindex learns a row is gone.
    func sleeps(ids: [String]) -> [SleepEntity] {
        let wanted = Set(ids)
        guard !wanted.isEmpty else { return [] }
        return sortedSleeps().filter { wanted.contains($0.id) }.map(SleepEntity.init)
    }

    func latestSleep() -> SleepEntity? {
        sleepRepository.latest().map(SleepEntity.init)
    }

    /// The night on, or nearest to, an ISO day.
    func sleepEntity(for date: String) -> SleepEntity? {
        sleepRepository.closest(to: date).map(SleepEntity.init)
    }

    /// Resolves a date phrase ("last night" is simply the latest entry, which
    /// the intent defaults to) to the night nearest that day.
    func sleeps(matching text: String, now: Date = Date()) -> [SleepEntity] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let date = DaySummaryQuery.resolveDate(trimmed, now: now) else { return [] }
        return [sleepEntity(for: date)].compactMap { $0 }
    }

    /// Both days inclusive, newest first.
    func sleeps(from startDate: String, to endDate: String) -> [SleepEntity] {
        sortedSleeps()
            .filter { $0.entryDate >= startDate && $0.entryDate <= endDate }
            .map(SleepEntity.init)
    }

    /// The last `days` days up to today — what the launch-time Spotlight
    /// backfill indexes.
    func sleeps(lastDays days: Int, now: Date = Date()) -> [SleepEntity] {
        let (startDate, endDate) = Self.window(days: days, now: now)
        return sleeps(from: startDate, to: endDate)
    }

    func recentSleeps(limit: Int = 7) -> [SleepEntity] {
        guard limit > 0 else { return [] }
        return sleepRepository.entries(offset: 0, limit: limit).map(SleepEntity.init)
    }

    func sleepStats(days: Int, now: Date = Date()) -> SleepStats {
        let (startDate, endDate) = Self.window(days: days, now: now)
        let window = sortedSleeps().filter { $0.entryDate >= startDate && $0.entryDate <= endDate }
        guard !window.isEmpty else { return SleepStats.empty(days: days) }
        let rated = window.filter { $0.quality > 0 }
        let best = window.max { $0.durationMinutes < $1.durationMinutes }
        let worst = window.min { $0.durationMinutes < $1.durationMinutes }
        return SleepStats(
            days: days,
            nights: window.count,
            averageDurationMinutes: window.reduce(0) { $0 + $1.durationMinutes } / window.count,
            averageQuality: rated.isEmpty ? 0 : rated.reduce(0) { $0 + $1.quality } / Double(rated.count),
            bestDurationMinutes: best?.durationMinutes ?? 0,
            bestDate: best?.entryDate ?? "",
            worstDurationMinutes: worst?.durationMinutes ?? 0,
            worstDate: worst?.entryDate ?? ""
        )
    }

    // MARK: - Spotlight

    /// Re-indexes the weight entries a write touched and drops the ones that no
    /// longer exist, so a deleted entry stops answering questions. Wired to
    /// `IntentDonations.onWeightChanged` at launch.
    func reindexWeights(_ ids: Set<String>) {
        guard !ids.isEmpty else { return }
        let indexed = weights(ids: Array(ids))
        IntentDonations.indexWeights(indexed)
        IntentDonations.removeWeights(ids.subtracting(indexed.map(\.id)).sorted())
    }

    /// The same for sleep. Wired to `IntentDonations.onSleepChanged`.
    func reindexSleeps(_ ids: Set<String>) {
        guard !ids.isEmpty else { return }
        let indexed = sleeps(ids: Array(ids))
        IntentDonations.indexSleeps(indexed)
        IntentDonations.removeSleeps(ids.subtracting(indexed.map(\.id)).sorted())
    }

    // MARK: - Helpers

    /// The ISO bounds of a "last N days" window, today included.
    static func window(days: Int, now: Date = Date()) -> (start: String, end: String) {
        let span = min(max(days, 1), searchWindowDays)
        return (
            DateFormatting.isoString(from: now.adding(days: -(span - 1))),
            DateFormatting.isoString(from: now)
        )
    }

    /// A weight read out of a spoken phrase. Accepts both decimal separators
    /// and a trailing unit, because Siri transcribes "seventy-six point four
    /// kilos" differently per locale.
    static func weightValue(in text: String) -> Double? {
        let normalized = text
            .replacingOccurrences(of: "kilograms", with: "", options: .caseInsensitive)
            .replacingOccurrences(of: "kilogramm", with: "", options: .caseInsensitive)
            .replacingOccurrences(of: "kilos", with: "", options: .caseInsensitive)
            .replacingOccurrences(of: "kilo", with: "", options: .caseInsensitive)
            .replacingOccurrences(of: "kg", with: "", options: .caseInsensitive)
            .replacingOccurrences(of: ",", with: ".")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value = Double(normalized), value.isFinite, value > 0 else { return nil }
        return value
    }

    /// The stored weight entries, newest first. The repository already sorts
    /// that way; the explicit sort makes the "previous entry" pairing below
    /// independent of that guarantee.
    private func sortedWeights(limit: Int? = nil) -> [WeightEntry] {
        let rows = limit.map { weightRepository.entries(offset: 0, limit: $0) } ?? weightRepository.entries()
        return rows.sorted { $0.entryDate > $1.entryDate }
    }

    private func sortedSleeps() -> [SleepEntry] {
        sleepRepository.entries().sorted { $0.entryDate > $1.entryDate }
    }

    /// Pairs a row with the one logged before it, so the entity can report its
    /// own delta without a second fetch.
    private func entity(_ rows: [WeightEntry], at index: Int) -> WeightEntity {
        WeightEntity(entry: rows[index], previous: index + 1 < rows.count ? rows[index + 1] : nil)
    }
}
