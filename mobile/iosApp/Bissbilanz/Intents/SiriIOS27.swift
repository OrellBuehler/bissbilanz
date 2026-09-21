import AppIntents
import CoreSpotlight
import Foundation
import SwiftUI

// `appEntityIdentifier(_:)` lives in the AppIntents/SwiftUI cross-import
// overlay, which the compiler loads implicitly when both frameworks are
// imported. CodeQL's Swift extractor does not do that implicit lookup, so its
// re-typecheck of this file failed with "cannot find 'appEntityIdentifier' in
// scope" while the untraced build with the same Xcode passed. Naming the
// overlay makes it an ordinary import the extractor follows.
#if canImport(_AppIntents_SwiftUI)
import _AppIntents_SwiftUI
#endif

// Everything the newer App Intents SDKs add on top of the iOS 18 baseline
// lives in this one file, so the version fences sit in a single place instead
// of being sprinkled through the entities, the queries and the views.
//
// The gating follows the pattern already used for Liquid Glass
// (Views/LiquidGlass.swift): `#if compiler(>=N)` keeps the project building
// against older SDKs (every job uses latest-stable Xcode, 26+) and
// `#available` keeps older systems on the pre-existing path at runtime. The
// deployment target stays iOS 18, i.e. the three most recent iOS releases.
//
//   * `OwnershipProvidingEntity` and `IndexedEntityQuery` are iOS 27, first
//     declared by the Xcode 27 SDK, which ships Swift 6.4 → `compiler(>=6.4)`.
//   * `appEntityIdentifier(_:)` is iOS 18.4 and is declared by every SDK the
//     project builds against, so it only needs the `#available` check.

#if compiler(>=6.4)

// MARK: - Ownership (iOS 27)

// `OwnershipProvidingEntity` lets Siri find out whether acting on an entity
// would touch something the user shared or published, so it can ask for
// confirmation before a destructive step. `EntityOwnership` is an `OptionSet`
// whose members are `.shared`, `.public` and `.unknown` — there is no
// "private" member, because the empty set is what "owned by this user, not
// shared, not published" looks like.
//
// Every entity here is one row of a personal health diary that the app has no
// way to share or publish, so all three report the empty set. If sharing is
// ever added, this is the one place that has to learn about it.

@available(iOS 27, *)
extension DaySummaryEntity: OwnershipProvidingEntity {
    var ownership: EntityOwnership { [] }
}

@available(iOS 27, *)
extension WeightEntity: OwnershipProvidingEntity {
    var ownership: EntityOwnership { [] }
}

@available(iOS 27, *)
extension SleepEntity: OwnershipProvidingEntity {
    var ownership: EntityOwnership { [] }
}

// MARK: - Spotlight reindexing (iOS 27)

// `IndexedEntityQuery` is how the system asks the app to rebuild its Spotlight
// index when it finds a problem with it — the App Intents replacement for
// `CSSearchableIndexDelegate`. The app writes its own index incrementally
// after every log (see `IntentDonations`), so these two methods only have to
// answer "give me these again" and "give me everything again".
//
// The `indexDescription` the system hands over describes the index it wants
// rebuilt; the app only ever writes to `CSSearchableIndex.default()`, so there
// is nothing here to select on it.

/// Writes back the entities that still exist and drops the requested ids that
/// no longer resolve — a deleted row leaves the index by simply not coming
/// back from the query, which is the same rule `NutritionReader.reindexDays`
/// and `BodyReader.reindexWeights` apply to the app's own writes.
@available(iOS 27, *)
enum SpotlightReindex {
    static func write<E: IndexedEntity>(_ entities: [E], requested identifiers: [E.ID]) async throws {
        let index = CSSearchableIndex.default()
        if !entities.isEmpty {
            try await index.indexAppEntities(entities)
        }
        let stale = Set(identifiers).subtracting(entities.map(\.id))
        if !stale.isEmpty {
            try await index.deleteAppEntities(identifiedBy: Array(stale), ofType: E.self)
        }
    }
}

@available(iOS 27, *)
extension DaySummaryQuery: IndexedEntityQuery {
    /// Empty days are deliberately not indexed — an untouched day has nothing
    /// to answer a question with — so a requested date that resolves to an
    /// empty day is dropped here and deleted from the index below.
    func reindexEntities(for identifiers: [String], indexDescription _: CSSearchableIndexDescription) async throws {
        let summaries = try await entities(for: identifiers)
            .filter { !$0.isEmpty || $0.isFastingDay }
        try await SpotlightReindex.write(summaries, requested: identifiers)
    }

    /// The whole property-query window, which is also the widest span any
    /// spoken question can reach. `daySummaries(from:to:)` already skips days
    /// with nothing on them.
    func reindexAllEntities(indexDescription _: CSSearchableIndexDescription) async throws {
        let endDate = DateFormatting.today
        let startDate = DateFormatting.isoString(from: Date().adding(days: -(Self.searchWindowDays - 1)))
        let summaries = await nutritionReader.daySummaries(from: startDate, to: endDate)
        guard !summaries.isEmpty else { return }
        try await CSSearchableIndex.default().indexAppEntities(summaries)
    }
}

@available(iOS 27, *)
extension WeightEntityQuery: IndexedEntityQuery {
    func reindexEntities(for identifiers: [String], indexDescription _: CSSearchableIndexDescription) async throws {
        let entries = try await entities(for: identifiers)
        try await SpotlightReindex.write(entries, requested: identifiers)
    }

    func reindexAllEntities(indexDescription _: CSSearchableIndexDescription) async throws {
        let entries = await bodyReader.weights(lastDays: BodyReader.searchWindowDays)
        guard !entries.isEmpty else { return }
        try await CSSearchableIndex.default().indexAppEntities(entries)
    }
}

@available(iOS 27, *)
extension SleepEntityQuery: IndexedEntityQuery {
    func reindexEntities(for identifiers: [String], indexDescription _: CSSearchableIndexDescription) async throws {
        let nights = try await entities(for: identifiers)
        try await SpotlightReindex.write(nights, requested: identifiers)
    }

    func reindexAllEntities(indexDescription _: CSSearchableIndexDescription) async throws {
        let nights = await bodyReader.sleeps(lastDays: BodyReader.searchWindowDays)
        guard !nights.isEmpty else { return }
        try await CSSearchableIndex.default().indexAppEntities(nights)
    }
}

#endif

// MARK: - On-screen awareness (iOS 18.4)

extension View {
    /// Tells the system which entity the content on screen stands for, so Siri
    /// can resolve "this day" or "that entry" against what the user is looking
    /// at instead of asking which one they mean.
    ///
    /// `appEntityIdentifier(_:)` is iOS 18.4; on iOS 18.0–18.3 this returns
    /// the view unchanged, so the call sites stay a single unconditional
    /// modifier.
    @ViewBuilder
    func siriEntity<E: AppEntity>(_ type: E.Type, id: E.ID) -> some View {
        if #available(iOS 18.4, *) {
            appEntityIdentifier(EntityIdentifier(for: type, identifier: id))
        } else {
            self
        }
    }
}
