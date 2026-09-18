import AppIntents
import Foundation

/// The filters a property query can ask for. `EntityPropertyQuery` maps each
/// comparator the user builds in Shortcuts ("weight is greater than 80") onto
/// one of these, which `entities(matching:mode:sortedBy:limit:)` then applies
/// in memory — the local store has no query language of its own.
enum WeightComparator {
    case dateEqualTo(Date)
    case dateBefore(Date)
    case dateAfter(Date)
    case weightAbove(Double)
    case weightBelow(Double)

    func matches(_ entry: WeightEntity) -> Bool {
        switch self {
        case let .dateEqualTo(date):
            DateFormatting.isoString(from: date) == entry.entryDate
        case let .dateBefore(date):
            entry.date < date
        case let .dateAfter(date):
            entry.date > date
        case let .weightAbove(value):
            entry.weightKg > value
        case let .weightBelow(value):
            entry.weightKg < value
        }
    }
}

/// Resolves `WeightEntity` values for the framework: stored ids back to
/// entities, a spoken/typed string ("yesterday", "Montag", "2026-09-16", "76")
/// to the matching entries, a suggestion list for the pickers, and the
/// property-based "find entries where …" queries Shortcuts builds.
struct WeightEntityQuery: EntityStringQuery, EntityPropertyQuery {
    /// Spelled out rather than left to inference: `QueryProperties` and the
    /// comparator builders below are all written in terms of these.
    typealias Entity = WeightEntity
    typealias ComparatorMappingType = WeightComparator

    /// Not `private`: the iOS 27 `IndexedEntityQuery` conformance lives in
    /// `SiriIOS27.swift`, where the version fence is, and reindexing delegates
    /// back to the reader.
    @Dependency var bodyReader: BodyReader

    // MARK: - Identifier / string resolution

    func entities(for identifiers: [String]) async throws -> [WeightEntity] {
        await bodyReader.weights(ids: identifiers)
    }

    func entities(matching string: String) async throws -> [WeightEntity] {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return try await suggestedEntities() }
        return await bodyReader.weights(matching: trimmed)
    }

    func suggestedEntities() async throws -> [WeightEntity] {
        await bodyReader.recentWeights(limit: 7)
    }

    // MARK: - Property query

    static var properties: QueryProperties {
        QueryProperties {
            Property(\WeightEntity.$date) {
                EqualToComparator { WeightComparator.dateEqualTo($0) }
                LessThanComparator { WeightComparator.dateBefore($0) }
                GreaterThanComparator { WeightComparator.dateAfter($0) }
            }
            Property(\WeightEntity.$weightKg) {
                GreaterThanComparator { WeightComparator.weightAbove($0) }
                LessThanComparator { WeightComparator.weightBelow($0) }
            }
        }
    }

    static var sortingOptions: SortingOptions {
        SortingOptions {
            SortableBy(\WeightEntity.$date)
            SortableBy(\WeightEntity.$weightKg)
        }
    }

    func entities(
        matching comparators: [WeightComparator],
        mode: ComparatorMode,
        sortedBy: [EntityQuerySort<WeightEntity>],
        limit: Int?
    ) async throws -> [WeightEntity] {
        let entries = await bodyReader.weights(lastDays: BodyReader.searchWindowDays)
        let matched = Self.filter(entries, comparators: comparators, mode: mode)
        let sorted = Self.sort(matched, by: sortedBy)
        guard let limit else { return sorted }
        return Array(sorted.prefix(max(limit, 0)))
    }

    // MARK: - Matching helpers

    /// No comparators means "every entry in the window" — an `.or` fold over an
    /// empty list would otherwise match nothing.
    static func filter(
        _ entries: [WeightEntity],
        comparators: [WeightComparator],
        mode: ComparatorMode
    ) -> [WeightEntity] {
        guard !comparators.isEmpty else { return entries }
        return entries.filter { entry in
            switch mode {
            case .or: return comparators.contains { $0.matches(entry) }
            default: return comparators.allSatisfy { $0.matches(entry) }
            }
        }
    }

    /// Sorts by whichever declared property the request names, newest entry
    /// first by default (what a bare "find entries" should show).
    static func sort(
        _ entries: [WeightEntity],
        by sorts: [EntityQuerySort<WeightEntity>]
    ) -> [WeightEntity] {
        guard let sort = sorts.first else { return entries.sorted { $0.entryDate > $1.entryDate } }
        let weightKey = \WeightEntity.$weightKg as PartialKeyPath<WeightEntity>
        let ascending: [WeightEntity] = if sort.by == weightKey {
            entries.sorted { $0.weightKg < $1.weightKg }
        } else {
            entries.sorted { $0.entryDate < $1.entryDate }
        }
        switch sort.order {
        case .ascending: return ascending
        case .descending: return ascending.reversed()
        }
    }
}
