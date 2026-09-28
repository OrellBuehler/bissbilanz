@testable import Bissbilanz
import Foundation
import Testing

/// Decodes every spec-generated fixture under `Fixtures/API/` — produced by
/// `bun run api:fixtures:ios` (`scripts/api/generate-ios-fixtures.ts`) from
/// `docs/openapi.json`, and embedded (byte-identical) in
/// `Fixtures/GeneratedAPIFixtures.swift` — with the same `JSONDecoder`
/// configuration `BissbilanzAPI` uses: a plain `JSONDecoder()` with no date or
/// key-decoding strategy overrides (see `BissbilanzAPI.init`). A server
/// response shape change the Swift models can no longer decode fails here,
/// instead of silently dropping a change somewhere in the offline sync queue.
///
/// `mapping` is the spec component name -> Swift decode type table, built by
/// reading every endpoint call in `BissbilanzAPI.swift`. Add a row here
/// whenever a new endpoint response is wired in — `everyManifestSchemaIsMapped`
/// below fails when a generated fixture has no matching row, so a newly wired
/// (or renamed) endpoint can't be silently skipped.
///
/// Endpoints intentionally NOT covered here:
///  - `GET /api/openfoodfacts/{barcode}` (`lookupBarcode`): decodes into
///    `Food` only after `JSONPatch`-style manual dictionary patches (default
///    `id`/`userId`/`isFavorite`/`servingSize`/`servingUnit`), not via the
///    plain `performRequest` + `JSONDecoder` pipeline every other call uses.
///  - The ad-hoc `DeleteConflict` 409 body (`APIError.deleteConflict`):
///    decoded via a fresh, separate `JSONDecoder()` call wrapped in `try?`
///    with a safe all-zero fallback, and the server sends different subsets
///    of its fields for foods vs. recipes — already defensively optional
///    apart from `entryCount`.
struct APIContractDecodingTests {
    /// `nonisolated(unsafe)` because this is an immutable, read-only decoder —
    /// matches `BissbilanzAPI`'s own plain `JSONDecoder()` with no strategy
    /// overrides (see `BissbilanzAPI.init`).
    private nonisolated(unsafe) static let decoder = JSONDecoder()

    private static func entry<T: Decodable>(
        _ schema: String,
        _ type: T.Type
    ) -> (schema: String, decode: (Data) throws -> Void) {
        (schema, { data in _ = try decoder.decode(type, from: data) })
    }

    /// `nonisolated(unsafe)` because this is an immutable table of closures
    /// (not formally Sendable) accessed read-only — same reasoning as
    /// `NutritionLabelParser.matchers`.
    private nonisolated(unsafe) static let mapping: [(schema: String, decode: (Data) throws -> Void)] = [
        entry("GoalsResponse", GoalsResponse.self),
        entry("GoalsSetResponse", GoalsResponse.self),
        entry("FoodsListResponse", FoodsResponse.self),
        entry("FoodsRecentResponse", FoodsResponse.self),
        entry("FoodResponse", FoodResponse.self),
        entry("FoodDuplicatesResponse", FoodDuplicatesResponse.self),
        entry("FoodBrandsResponse", FoodBrandsResponse.self),
        entry("FoodLabelStatsResponse", FoodLabelStatsResponse.self),
        entry("FoodPackageSummaryResponse", FoodPackageSummary.self),
        entry("FoodPackagePreviewResponse", FoodPackagePreview.self),
        entry("FoodPackageImportResult", FoodPackageImportResult.self),
        entry("FoodLabelsSetResponse", FoodLabelsSetResponse.self),
        entry("EntriesListResponse", EntriesResponse.self),
        entry("EntriesCopyResponse", EntriesResponse.self),
        entry("EntriesRangeResponse", EntriesResponse.self),
        entry("EntryResponse", EntryResponse.self),
        entry("RecipesListResponse", RecipesResponse.self),
        entry("RecipeResponse", RecipeResponse.self),
        entry("SupplementsListResponse", SupplementsResponse.self),
        entry("SupplementResponse", SupplementResponse.self),
        entry("SupplementChecklistResponse", SupplementChecklistResponse.self),
        entry("SupplementHistoryResponse", SupplementHistoryResponse.self),
        entry("SupplementLogResponse", SupplementLogResponse.self),
        entry("RemindersListResponse", RemindersListResponse.self),
        entry("ReminderResponse", ReminderResponse.self),
        entry("WeightEntriesResponse", WeightEntriesResponse.self),
        entry("WeightEntryResponse", WeightEntryResponse.self),
        entry("WeightLatestResponse", WeightLatestResponse.self),
        entry("FastingSessionsResponse", FastingSessionsResponse.self),
        entry("FastingSessionResponse", FastingSessionResponse.self),
        entry("SleepEntriesResponse", SleepEntriesResponse.self),
        entry("SleepEntryResponse", SleepEntryResponse.self),
        entry("DailyStatsResponse", DailyStatsResponse.self),
        entry("WeeklyStatsResponse", WeeklyMonthlyStatsResponse.self),
        entry("MonthlyStatsResponse", WeeklyMonthlyStatsResponse.self),
        entry("MealBreakdownResponse", MealBreakdownResponse.self),
        entry("TopFoodsResponse", TopFoodsResponse.self),
        entry("StreaksResponse", StreaksResponse.self),
        entry("CalendarResponse", CalendarResponse.self),
        entry("DayPropertiesResponse", DayPropertiesResponse.self),
        entry("DayPropertiesRangeResponse", DayPropertiesRangeResponse.self),
        entry("PreferencesResponse", PreferencesResponse.self),
        entry("MealTypesListResponse", MealTypesResponse.self),
        entry("MealTypeResponse", MealTypeResponse.self),
        entry("FavoritesResponse", FavoritesResponse.self),
        entry("AccountResponse", AccountResponse.self),
        entry("ImageUploadResponse", ImageUploadResponse.self),
        entry("AiTasksResponse", AiTasksResponse.self),
        entry("AiTaskResponse", AiTaskResponse.self),
        entry("AiTaskAcknowledgeResponse", AiTaskAcknowledgeResponse.self),
        entry("AiTaskPhotoResponse", AiTaskPhotoResponse.self),
        entry("McpStatusResponse", McpStatusResponse.self),
        entry("OpenFoodFactsSearchResponse", BissbilanzAPI.OpenFoodFactsSearchResponse.self)
    ]

    private struct FixtureManifest: Decodable {
        struct Operation: Decodable {
            let operationId: String
            let method: String
            let path: String
        }

        struct Entry: Decodable {
            let minimal: String
            let full: String
            let enumVariants: [String]
            let operations: [Operation]
        }

        let schemas: [String: Entry]
    }

    private static func loadManifest() throws -> FixtureManifest {
        try decoder.decode(FixtureManifest.self, from: Data(GeneratedAPIFixtures.manifestJSON.utf8))
    }

    /// `nil` when the generator produced no embedded string for `filename` —
    /// that alone is a bug in the generator/embedding step, not a decode
    /// failure, so callers report it distinctly.
    private static func fixtureData(named filename: String) -> Data? {
        let key = filename.hasSuffix(".json") ? String(filename.dropLast(".json".count)) : filename
        guard let text = GeneratedAPIFixtures.json[key] else { return nil }
        return Data(text.utf8)
    }

    private static func describe(_ error: Error) -> String {
        guard let decodingError = error as? DecodingError else {
            return String(describing: error)
        }
        func path(_ context: DecodingError.Context) -> String {
            let joined = context.codingPath.map(\.stringValue).joined(separator: ".")
            return joined.isEmpty ? "<root>" : joined
        }
        switch decodingError {
        case let .keyNotFound(key, context):
            return "keyNotFound '\(key.stringValue)' at \(path(context))"
        case let .typeMismatch(type, context):
            return "typeMismatch \(type) at \(path(context)): \(context.debugDescription)"
        case let .valueNotFound(type, context):
            return "valueNotFound \(type) at \(path(context)): \(context.debugDescription)"
        case let .dataCorrupted(context):
            return "dataCorrupted at \(path(context)): \(context.debugDescription)"
        @unknown default:
            return String(describing: decodingError)
        }
    }

    @Test("Every spec-generated fixture decodes into its mapped Swift type")
    func fixturesDecodeIntoMappedTypes() throws {
        let manifest = try Self.loadManifest()
        var checkedCount = 0
        for (schema, decode) in Self.mapping {
            guard let manifestEntry = manifest.schemas[schema] else {
                Issue.record(
                    "'\(schema)' is listed in the Swift mapping table but has no fixture in " +
                        "manifest.json — remove the row, or run `bun run api:fixtures:ios` to regenerate"
                )
                continue
            }
            let filenames = [manifestEntry.minimal, manifestEntry.full] + manifestEntry.enumVariants
            for filename in filenames {
                guard let data = Self.fixtureData(named: filename) else {
                    Issue.record("\(schema): no embedded fixture text for '\(filename)'")
                    continue
                }
                do {
                    try decode(data)
                    checkedCount += 1
                } catch {
                    Issue.record("\(schema): '\(filename)' failed to decode — \(Self.describe(error))")
                }
            }
        }
        #expect(checkedCount > 0, "No fixtures were checked — the manifest or mapping table is empty")
    }

    /// The reverse of `fixturesDecodeIntoMappedTypes`: every schema the
    /// generator produced fixtures for must have a row in `mapping`, so a
    /// newly wired (or renamed) `BissbilanzAPI` endpoint that nobody added to
    /// the table isn't silently left untested. Checking manifest -> table
    /// (rather than table -> manifest) is the meaningful direction here: a
    /// stale table row pointing at a schema the generator no longer emits is
    /// caught immediately above as a decode-time "no fixture" issue, while a
    /// *missing* table row for a live schema would otherwise pass silently.
    @Test("Every generated fixture schema has a Swift mapping table entry")
    func everyManifestSchemaIsMapped() throws {
        let manifest = try Self.loadManifest()
        let mappedSchemas = Set(Self.mapping.map(\.schema))
        for schema in manifest.schemas.keys.sorted() where !mappedSchemas.contains(schema) {
            Issue.record(
                "'\(schema)' has generated fixtures but no entry in the Swift mapping table above — " +
                    "a server response this app decodes is going untested"
            )
        }
    }
}
