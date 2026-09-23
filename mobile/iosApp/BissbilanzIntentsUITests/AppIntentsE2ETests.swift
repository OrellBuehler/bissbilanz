import AppIntentsTesting
import XCTest

/// End-to-end coverage of the app's Siri/Shortcuts/Spotlight intents through
/// AppIntentsTesting (WWDC26) — the real App Intents infrastructure, driving
/// the actual `Bissbilanz` app process out-of-process, the same way Siri or
/// Shortcuts would. This is deliberately a *different* layer from
/// `BissbilanzTests/IntentsTests.swift`, which exercises `EntryWriter`/the
/// entities directly via `@testable import` — that suite is faster and covers
/// more edge cases, but can never catch a break in parameter resolution,
/// entity-query wiring, or App Intents metadata that only shows up when the
/// system itself drives the intent. Neither suite replaces the other.
///
/// Every test starts by running `ResetIntentTestFixturesIntent`, a
/// `#if DEBUG`, non-discoverable intent (see `IntentTestFixtures.swift` in the
/// app target) that reseeds the in-memory store `BissbilanzApp.init` swaps in
/// under any test host. `app.launch()` in `setUp` gives each test a fresh
/// process/store anyway, but the reset intent is what actually seeds the known
/// food, recipe, weight and sleep rows these tests assert against — a fresh
/// store starts empty.
///
/// `ResolvedIntentResult` only exposes an intent's *returned value*
/// (`.value`), not its spoken dialog or snippet view — there is no API surface
/// for that yet, so dialog wording stays covered separately by direct
/// `DaySummaryDialog`/`BodyDialog` unit tests in `BissbilanzTests`.
@MainActor
final class AppIntentsE2ETests: XCTestCase {
    /// Mirrors `IntentTestFixtures`'s ids/date — this target has no
    /// `@testable import` of the app to read them from directly (see the
    /// header comment on `IntentTestFixtures.swift`), so any change to one
    /// side needs the other updated too.
    private enum Fixture {
        static let foodId = "intent-test-banana"
        static let recipeId = "intent-test-bowl"
        static let weightId = "intent-test-weight"
        static let sleepId = "intent-test-sleep"
    }

    private let app = XCUIApplication()
    private var definitions: IntentDefinitions!

    override func setUp() async throws {
        continueAfterFailure = false
        app.launch()
        definitions = IntentDefinitions(bundleIdentifier: "com.bissbilanz.ios")
        try await definitions.intents["ResetIntentTestFixturesIntent"].makeIntent().run()
    }

    // MARK: - Logging

    func testLogFoodIntent_writesEntryAndQueuesSync() async throws {
        let food = definitions.entities["FoodEntity"].makeReference(identifier: Fixture.foodId)

        _ = try await definitions.intents["LogFoodIntent"]
            .makeIntent(food: food, meal: "breakfast", servings: 2.0)
            .run()

        let status = try await definitions.intents["GetDailyStatusIntent"].makeIntent().run()
        let calories: Double = try status.value.calories
        // The seed food is 90 kcal/serving (see IntentTestFixtures) at 2 servings.
        XCTAssertEqual(calories, 180, accuracy: 0.01)

        let queued = try await definitions.intents["PendingSyncOperationCountIntent"]
            .makeIntent(operationType: "create_entry")
            .run()
        let queuedCount: Int = try queued.value
        // Synced mode + connectivity off (set by the reset intent) means the
        // upload attempt is skipped rather than raced, so the write stays
        // queued for the sync layer to pick up later.
        XCTAssertEqual(queuedCount, 1)
    }

    func testLogRecipeIntent_writesEntry() async throws {
        let recipe = definitions.entities["RecipeEntity"].makeReference(identifier: Fixture.recipeId)

        _ = try await definitions.intents["LogRecipeIntent"]
            .makeIntent(recipe: recipe, meal: "dinner", servings: 1.0)
            .run()

        let status = try await definitions.intents["GetDailyStatusIntent"].makeIntent().run()
        let entryCount: Int = try status.value.entryCount
        XCTAssertEqual(entryCount, 1)
    }

    // MARK: - Data queries

    func testGetDailyStatusIntent_returnsEmptyDayWhenNothingLogged() async throws {
        let status = try await definitions.intents["GetDailyStatusIntent"].makeIntent().run()
        let entryCount: Int = try status.value.entryCount
        XCTAssertEqual(entryCount, 0)
    }

    func testGetWeeklyStatsIntent_runsAndReturnsToday() async throws {
        let result = try await definitions.intents["GetWeeklyStatsIntent"].makeIntent().run()
        // The value is the end day's own summary (today, by default) — the
        // weekly averages themselves are only in the spoken dialog, which
        // ResolvedIntentResult doesn't expose (see the header comment above).
        let id: String = try result.value.id
        XCTAssertFalse(id.isEmpty)
    }

    func testGetWeightIntent_returnsSeededEntry() async throws {
        let result = try await definitions.intents["GetWeightIntent"].makeIntent().run()
        let weightKg: Double = try result.value.weightKg
        XCTAssertEqual(weightKg, 76.4, accuracy: 0.01)
    }

    func testGetSleepIntent_returnsSeededEntry() async throws {
        let result = try await definitions.intents["GetSleepIntent"].makeIntent().run()
        let durationMinutes: Int = try result.value.durationMinutes
        XCTAssertEqual(durationMinutes, 430)
    }

    // MARK: - Entity queries

    func testFoodEntityQuery_resolvesByIdentifierAndString() async throws {
        let foodDef = definitions.entities["FoodEntity"]

        let byId = try await foodDef.entities(identifiers: [Fixture.foodId])
        XCTAssertEqual(byId.count, 1)
        let name: String = try byId[0].name
        XCTAssertEqual(name, "Test Banana")

        let byString = try await foodDef.entities(matching: "Test Banana")
        XCTAssertFalse(byString.isEmpty)
    }

    func testWeightEntityQuery_resolvesByIdentifier() async throws {
        let entries = try await definitions.entities["WeightEntity"].entities(identifiers: [Fixture.weightId])
        XCTAssertEqual(entries.count, 1)
        let weightKg: Double = try entries[0].weightKg
        XCTAssertEqual(weightKg, 76.4, accuracy: 0.01)
    }

    func testSleepEntityQuery_resolvesByIdentifier() async throws {
        let entries = try await definitions.entities["SleepEntity"].entities(identifiers: [Fixture.sleepId])
        XCTAssertEqual(entries.count, 1)
        let durationMinutes: Int = try entries[0].durationMinutes
        XCTAssertEqual(durationMinutes, 430)
    }
}
