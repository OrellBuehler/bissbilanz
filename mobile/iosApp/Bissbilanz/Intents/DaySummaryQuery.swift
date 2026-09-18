import AppIntents
import Foundation

/// The filters a property query can ask for. `EntityPropertyQuery` maps each
/// comparator the user builds in Shortcuts ("calories is greater than 2000")
/// onto one of these, which `entities(matching:mode:sortedBy:limit:)` then
/// applies in memory — the local store has no query language of its own.
enum DaySummaryComparator {
    case dateEqualTo(Date)
    case dateBefore(Date)
    case dateAfter(Date)
    case caloriesAbove(Double)
    case caloriesBelow(Double)
    case proteinAbove(Double)
    case proteinBelow(Double)

    func matches(_ summary: DaySummaryEntity) -> Bool {
        switch self {
        case let .dateEqualTo(date):
            DateFormatting.isoString(from: date) == summary.dateString
        case let .dateBefore(date):
            summary.date < date
        case let .dateAfter(date):
            summary.date > date
        case let .caloriesAbove(value):
            summary.calories > value
        case let .caloriesBelow(value):
            summary.calories < value
        case let .proteinAbove(value):
            summary.protein > value
        case let .proteinBelow(value):
            summary.protein < value
        }
    }
}

/// Resolves `DaySummaryEntity` values for the framework: stored ids (ISO dates)
/// back to entities, a spoken/typed string ("today", "gestern", "Monday",
/// "2026-09-16") to a day, a suggestion list for the pickers, and the
/// property-based "find days where …" queries Shortcuts builds.
struct DaySummaryQuery: EntityStringQuery, EntityPropertyQuery {
    /// Spelled out rather than left to inference: `QueryProperties` and the
    /// comparator builders below are all written in terms of these.
    typealias Entity = DaySummaryEntity
    typealias ComparatorMappingType = DaySummaryComparator

    /// How far back a property query looks. Bounded so a "find days" action can
    /// never walk the whole store.
    static let searchWindowDays = 365

    /// Not `private`: the iOS 27 `IndexedEntityQuery` conformance lives in
    /// `SiriIOS27.swift`, where the version fence is, and reindexing delegates
    /// back to the reader.
    @Dependency var nutritionReader: NutritionReader

    // MARK: - Identifier / string resolution

    func entities(for identifiers: [String]) async throws -> [DaySummaryEntity] {
        let dates = identifiers.filter { DateFormatting.date(from: $0) != nil }
        guard !dates.isEmpty else { return [] }
        return await nutritionReader.daySummaries(dates: dates)
    }

    func entities(matching string: String) async throws -> [DaySummaryEntity] {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return try await suggestedEntities() }
        guard let date = Self.resolveDate(trimmed) else { return [] }
        return [await nutritionReader.daySummary(date: date)]
    }

    func suggestedEntities() async throws -> [DaySummaryEntity] {
        await nutritionReader.recentDays(limit: 7)
    }

    // MARK: - Property query

    static var properties: QueryProperties {
        QueryProperties {
            Property(\DaySummaryEntity.$date) {
                EqualToComparator { DaySummaryComparator.dateEqualTo($0) }
                LessThanComparator { DaySummaryComparator.dateBefore($0) }
                GreaterThanComparator { DaySummaryComparator.dateAfter($0) }
            }
            Property(\DaySummaryEntity.$calories) {
                GreaterThanComparator { DaySummaryComparator.caloriesAbove($0) }
                LessThanComparator { DaySummaryComparator.caloriesBelow($0) }
            }
            Property(\DaySummaryEntity.$protein) {
                GreaterThanComparator { DaySummaryComparator.proteinAbove($0) }
                LessThanComparator { DaySummaryComparator.proteinBelow($0) }
            }
        }
    }

    static var sortingOptions: SortingOptions {
        SortingOptions {
            SortableBy(\DaySummaryEntity.$date)
            SortableBy(\DaySummaryEntity.$calories)
            SortableBy(\DaySummaryEntity.$protein)
        }
    }

    func entities(
        matching comparators: [DaySummaryComparator],
        mode: ComparatorMode,
        sortedBy: [EntityQuerySort<DaySummaryEntity>],
        limit: Int?
    ) async throws -> [DaySummaryEntity] {
        let endDate = DateFormatting.today
        let startDate = DateFormatting.isoString(from: Date().adding(days: -(Self.searchWindowDays - 1)))
        let days = await nutritionReader.daySummaries(from: startDate, to: endDate)
        let matched = Self.filter(days, comparators: comparators, mode: mode)
        let sorted = Self.sort(matched, by: sortedBy)
        guard let limit else { return sorted }
        return Array(sorted.prefix(max(limit, 0)))
    }

    // MARK: - Matching helpers

    /// No comparators means "every day in the window" — an `.or` fold over an
    /// empty list would otherwise match nothing.
    static func filter(
        _ days: [DaySummaryEntity],
        comparators: [DaySummaryComparator],
        mode: ComparatorMode
    ) -> [DaySummaryEntity] {
        guard !comparators.isEmpty else { return days }
        return days.filter { day in
            switch mode {
            case .or: return comparators.contains { $0.matches(day) }
            default: return comparators.allSatisfy { $0.matches(day) }
            }
        }
    }

    /// Sorts by whichever declared property the request names, newest day first
    /// by default (what a bare "find days" should show).
    static func sort(
        _ days: [DaySummaryEntity],
        by sorts: [EntityQuerySort<DaySummaryEntity>]
    ) -> [DaySummaryEntity] {
        guard let sort = sorts.first else { return days.sorted { $0.dateString > $1.dateString } }
        let caloriesKey = \DaySummaryEntity.$calories as PartialKeyPath<DaySummaryEntity>
        let proteinKey = \DaySummaryEntity.$protein as PartialKeyPath<DaySummaryEntity>
        let ascending: [DaySummaryEntity]
        if sort.by == caloriesKey {
            ascending = days.sorted { $0.calories < $1.calories }
        } else if sort.by == proteinKey {
            ascending = days.sorted { $0.protein < $1.protein }
        } else {
            ascending = days.sorted { $0.dateString < $1.dateString }
        }
        switch sort.order {
        case .ascending: return ascending
        case .descending: return ascending.reversed()
        }
    }

    // MARK: - Natural-language dates

    /// Maps what the user said to an ISO date: "today"/"heute",
    /// "yesterday"/"gestern", a weekday name in either language (the most
    /// recent past occurrence, today included) or an ISO date passed through.
    static func resolveDate(_ text: String, now: Date = Date()) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if DateFormatting.date(from: trimmed) != nil { return trimmed }
        let normalized = trimmed.lowercased()
        switch normalized {
        case "today", "heute":
            return DateFormatting.isoString(from: now)
        case "yesterday", "gestern":
            return DateFormatting.isoString(from: now.adding(days: -1))
        default:
            break
        }
        guard let weekday = weekdayIndex(matching: normalized) else { return nil }
        return mostRecentDate(weekday: weekday, on: now)
    }

    /// `Calendar`'s 1-based weekday number (Sunday = 1) for an English or
    /// German weekday name, full or abbreviated.
    private static func weekdayIndex(matching text: String) -> Int? {
        for identifier in ["en", "de"] {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: identifier)
            let symbolSets: [[String]] = [
                formatter.weekdaySymbols ?? [],
                formatter.standaloneWeekdaySymbols ?? [],
                formatter.shortWeekdaySymbols ?? [],
            ]
            for symbols in symbolSets {
                if let index = symbols.firstIndex(where: { $0.lowercased() == text }) {
                    return index + 1
                }
            }
        }
        return nil
    }

    private static func mostRecentDate(weekday: Int, on date: Date) -> String? {
        let calendar = Calendar.current
        for offset in 0 ... 6 {
            let candidate = date.adding(days: -offset)
            if calendar.component(.weekday, from: candidate) == weekday {
                return DateFormatting.isoString(from: candidate)
            }
        }
        return nil
    }
}
