import Foundation

/// Averages over the last seven days, as `GetWeeklyStatsIntent` speaks them.
/// `daysLogged` counts only the days that actually have entries, and every
/// average is over those days — a week with three logged days averages three,
/// not seven, so a gap never reads as a fasting streak.
struct WeeklyNutritionStats: Sendable {
    let startDate: String
    let endDate: String
    let daysLogged: Int
    let averageCalories: Double
    let averageProtein: Double
    let averageCarbs: Double
    let averageFat: Double
    let averageFiber: Double
    let goalsMet: Int
    let calorieGoal: Double?

    var isEmpty: Bool {
        daysLogged == 0
    }
}

/// Read-only counterpart to `EntryWriter`: the day and week totals the Siri
/// data-query intents answer with, and the values `IntentDonations` pushes into
/// the Spotlight day index.
///
/// Registered in `AppDependencyManager` (see `BissbilanzApp.init`) because App
/// Intents run in a separate launch of the app, outside the SwiftUI environment
/// the views use. Wraps the existing repositories rather than fetching itself,
/// so a spoken answer is computed from exactly the rows the dashboard shows —
/// including in Local mode and offline. Deliberately free of UI types.
@MainActor
final class NutritionReader {
    /// How far back `recentDays` may walk looking for days with something on
    /// them. Bounded so a suggestion list can never scan the whole store.
    private static let lookBackDays = 90

    private let entryRepository: EntryRepository
    private let goalsRepository: GoalsRepository

    init(entryRepository: EntryRepository, goalsRepository: GoalsRepository) {
        self.entryRepository = entryRepository
        self.goalsRepository = goalsRepository
    }

    // MARK: - Days

    /// Always returns a summary: a day with nothing logged is a zeroed one, not
    /// a missing value, so "what did I eat on Sunday" gets an answer either way.
    func daySummary(date: String) -> DaySummaryEntity {
        DaySummaryEntity(
            dateString: date,
            entries: entryRepository.entries(date: date),
            isFastingDay: entryRepository.isFastingDay(date: date),
            goals: goalsRepository.goals()
        )
    }

    /// One summary per requested date, empty days included — the identifier
    /// path, where the caller already named the days it wants.
    func daySummaries(dates: [String]) -> [DaySummaryEntity] {
        summaries(dates: dates, includingEmpty: true)
    }

    /// Every day in the span that has entries or is marked as a fasting day,
    /// oldest first. Two fetches for the whole span, not one per day.
    func daySummaries(from startDate: String, to endDate: String) -> [DaySummaryEntity] {
        let entriesByDate = entryRepository.entriesByDate(from: startDate, to: endDate)
        let fastingDays = entryRepository.fastingDays(from: startDate, to: endDate)
        let goals = goalsRepository.goals()
        return Set(entriesByDate.keys).union(fastingDays).sorted().map { date in
            DaySummaryEntity(
                dateString: date,
                entries: entriesByDate[date] ?? [],
                isFastingDay: fastingDays.contains(date),
                goals: goals
            )
        }
    }

    /// The most recent days with something on them, newest first.
    func recentDays(limit: Int = 7) -> [DaySummaryEntity] {
        guard limit > 0 else { return [] }
        let endDate = DateFormatting.today
        let startDate = DateFormatting.isoString(from: Date().adding(days: -(Self.lookBackDays - 1)))
        return Array(daySummaries(from: startDate, to: endDate).reversed().prefix(limit))
    }

    // MARK: - Week

    func weeklyStats(endingOn date: String = DateFormatting.today) -> WeeklyNutritionStats {
        let end = DateFormatting.date(from: date) ?? Date()
        let startDate = DateFormatting.isoString(from: end.adding(days: -6))
        let endDate = DateFormatting.isoString(from: end)
        let days = daySummaries(from: startDate, to: endDate).filter { !$0.isEmpty }
        let logged = Double(days.count)
        guard logged > 0 else {
            return WeeklyNutritionStats(
                startDate: startDate,
                endDate: endDate,
                daysLogged: 0,
                averageCalories: 0,
                averageProtein: 0,
                averageCarbs: 0,
                averageFat: 0,
                averageFiber: 0,
                goalsMet: 0,
                calorieGoal: goalsRepository.goals()?.calorieGoal
            )
        }
        return WeeklyNutritionStats(
            startDate: startDate,
            endDate: endDate,
            daysLogged: days.count,
            averageCalories: days.reduce(0) { $0 + $1.calories } / logged,
            averageProtein: days.reduce(0) { $0 + $1.protein } / logged,
            averageCarbs: days.reduce(0) { $0 + $1.carbs } / logged,
            averageFat: days.reduce(0) { $0 + $1.fat } / logged,
            averageFiber: days.reduce(0) { $0 + $1.fiber } / logged,
            goalsMet: days.filter(\.metCalorieGoal).count,
            calorieGoal: days.first?.calorieGoal
        )
    }

    // MARK: - Spotlight

    /// Re-indexes the days a write touched and drops the ones that no longer
    /// have anything to show, so a deleted day stops answering questions.
    /// Wired to `IntentDonations.onDayChanged` at launch.
    func reindexDays(_ dates: Set<String>) {
        guard !dates.isEmpty else { return }
        let indexed = summaries(dates: dates.sorted(), includingEmpty: false)
        IntentDonations.indexDays(indexed)
        IntentDonations.removeDays(dates.subtracting(indexed.map(\.id)).sorted())
    }

    // MARK: - Helpers

    private func summaries(dates: [String], includingEmpty: Bool) -> [DaySummaryEntity] {
        var seen = Set<String>()
        let valid = dates
            .filter { DateFormatting.date(from: $0) != nil && seen.insert($0).inserted }
            .sorted()
        guard let startDate = valid.first, let endDate = valid.last else { return [] }
        let entriesByDate = entryRepository.entriesByDate(from: startDate, to: endDate)
        let fastingDays = entryRepository.fastingDays(from: startDate, to: endDate)
        let goals = goalsRepository.goals()
        return valid.compactMap { date in
            let dayEntries = entriesByDate[date] ?? []
            let isFastingDay = fastingDays.contains(date)
            guard includingEmpty || !dayEntries.isEmpty || isFastingDay else { return nil }
            return DaySummaryEntity(
                dateString: date,
                entries: dayEntries,
                isFastingDay: isFastingDay,
                goals: goals
            )
        }
    }
}
