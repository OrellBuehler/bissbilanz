import AppIntents
import Foundation

/// The filters a property query can ask for. `EntityPropertyQuery` maps each
/// comparator the user builds in Shortcuts ("sleep is longer than 480 minutes")
/// onto one of these, which `entities(matching:mode:sortedBy:limit:)` then
/// applies in memory — the local store has no query language of its own.
enum SleepComparator {
    case dateEqualTo(Date)
    case dateBefore(Date)
    case dateAfter(Date)
    case durationAbove(Int)
    case durationBelow(Int)

    func matches(_ entry: SleepEntity) -> Bool {
        switch self {
        case let .dateEqualTo(date):
            DateFormatting.isoString(from: date) == entry.entryDate
        case let .dateBefore(date):
            entry.date < date
        case let .dateAfter(date):
            entry.date > date
        case let .durationAbove(value):
            entry.durationMinutes > value
        case let .durationBelow(value):
            entry.durationMinutes < value
        }
    }
}

/// Resolves `SleepEntity` values for the framework: stored ids back to
/// entities, a spoken/typed string ("yesterday", "Montag", "2026-09-16") to the
/// night nearest that day, a suggestion list for the pickers, and the
/// property-based "find nights where …" queries Shortcuts builds.
struct SleepEntityQuery: EntityStringQuery, EntityPropertyQuery {
    /// Spelled out rather than left to inference: `QueryProperties` and the
    /// comparator builders below are all written in terms of these.
    typealias Entity = SleepEntity
    typealias ComparatorMappingType = SleepComparator

    /// Not `private`: the iOS 27 `IndexedEntityQuery` conformance lives in
    /// `SiriIOS27.swift`, where the version fence is, and reindexing delegates
    /// back to the reader.
    @Dependency var bodyReader: BodyReader

    // MARK: - Identifier / string resolution

    func entities(for identifiers: [String]) async throws -> [SleepEntity] {
        await bodyReader.sleeps(ids: identifiers)
    }

    func entities(matching string: String) async throws -> [SleepEntity] {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return try await suggestedEntities() }
        return await bodyReader.sleeps(matching: trimmed)
    }

    func suggestedEntities() async throws -> [SleepEntity] {
        await bodyReader.recentSleeps(limit: 7)
    }

    // MARK: - Property query

    // Stored, not computed, and `nonisolated(unsafe)` — see the note in
    // DaySummaryQuery.
    nonisolated(unsafe) static let properties = QueryProperties {
        Property(\SleepEntity.$date) {
            EqualToComparator { SleepComparator.dateEqualTo($0) }
            LessThanComparator { SleepComparator.dateBefore($0) }
            GreaterThanComparator { SleepComparator.dateAfter($0) }
        }
        Property(\SleepEntity.$durationMinutes) {
            GreaterThanComparator { SleepComparator.durationAbove($0) }
            LessThanComparator { SleepComparator.durationBelow($0) }
        }
    }

    nonisolated(unsafe) static let sortingOptions = SortingOptions {
        SortableBy(\SleepEntity.$date)
        SortableBy(\SleepEntity.$durationMinutes)
    }

    func entities(
        matching comparators: [SleepComparator],
        mode: ComparatorMode,
        sortedBy: [EntityQuerySort<SleepEntity>],
        limit: Int?
    ) async throws -> [SleepEntity] {
        let nights = await bodyReader.sleeps(lastDays: BodyReader.searchWindowDays)
        let matched = Self.filter(nights, comparators: comparators, mode: mode)
        let sorted = Self.sort(matched, by: sortedBy)
        guard let limit else { return sorted }
        return Array(sorted.prefix(max(limit, 0)))
    }

    // MARK: - Matching helpers

    /// No comparators means "every night in the window" — an `.or` fold over an
    /// empty list would otherwise match nothing.
    static func filter(
        _ nights: [SleepEntity],
        comparators: [SleepComparator],
        mode: ComparatorMode
    ) -> [SleepEntity] {
        guard !comparators.isEmpty else { return nights }
        return nights.filter { night in
            switch mode {
            case .or: return comparators.contains { $0.matches(night) }
            default: return comparators.allSatisfy { $0.matches(night) }
            }
        }
    }

    /// Sorts by whichever declared property the request names, newest night
    /// first by default (what a bare "find nights" should show).
    static func sort(
        _ nights: [SleepEntity],
        by sorts: [EntityQuerySort<SleepEntity>]
    ) -> [SleepEntity] {
        guard let sort = sorts.first else { return nights.sorted { $0.entryDate > $1.entryDate } }
        let durationKey = \SleepEntity.$durationMinutes as PartialKeyPath<SleepEntity>
        let ascending: [SleepEntity] = if sort.by == durationKey {
            nights.sorted { $0.durationMinutes < $1.durationMinutes }
        } else {
            nights.sorted { $0.entryDate < $1.entryDate }
        }
        switch sort.order {
        case .ascending: return ascending
        case .descending: return ascending.reversed()
        }
    }
}
