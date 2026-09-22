import Foundation
import SwiftData

#if DEBUG

/// Test-only surface for `BissbilanzIntentsUITests` (AppIntentsTesting).
///
/// AppIntentsTesting drives this app's real, registered intents out-of-process
/// through the real App Intents infrastructure — the test target never links
/// against the app and cannot `@testable import` it (see
/// `testing-your-app-intents-code`). The only way for such a test to seed
/// known data or inspect anything the intents themselves don't return is a
/// dedicated, non-discoverable "test-only intent" that wraps this type — see
/// `TestOnlyIntents.swift`.
///
/// `#if DEBUG` only, so none of this exists in a release build. Registered in
/// `AppDependencyManager` alongside `EntryWriter`/`NutritionReader`/`BodyReader`
/// (see `BissbilanzApp.init`), against the same in-memory store that `init`
/// swaps in under any test host.
@MainActor
final class IntentTestFixtures {
    /// Ids/dates the intent tests can reference without duplicating the
    /// fixture data. `seedDate` is fixed rather than "today" so a test doesn't
    /// have to know the run date to ask a read intent for this exact day.
    static let seedFoodId = "intent-test-banana"
    static let seedRecipeId = "intent-test-bowl"
    static let seedWeightId = "intent-test-weight"
    static let seedSleepId = "intent-test-sleep"
    static let seedDate = "2026-01-15"

    private let context: ModelContext
    private let appMode: AppModeManager
    private let connectivity: ConnectivityMonitor
    private let syncManager: SyncManager

    init(context: ModelContext, appMode: AppModeManager, connectivity: ConnectivityMonitor, syncManager: SyncManager) {
        self.context = context
        self.appMode = appMode
        self.connectivity = connectivity
        self.syncManager = syncManager
    }

    /// Clears every row an intent test could observe, reseeds one known food
    /// and one known recipe, and forces Synced mode with connectivity stopped
    /// and off. That combination — rather than Local mode — is what makes a
    /// logged entry queue for upload (`SyncManager.drainPendingQueue` no-ops
    /// whenever `!connectivity.isOnline`), and stopping the monitor first
    /// keeps a real `NWPathMonitor` update from flipping `isOnline` back
    /// mid-test. Call this before every test that logs something.
    func reset() throws {
        try context.delete(model: LocalEntry.self)
        try context.delete(model: LocalFood.self)
        try context.delete(model: LocalRecipe.self)
        try context.delete(model: LocalWeightEntry.self)
        try context.delete(model: LocalSleepEntry.self)
        try context.delete(model: PendingSyncOperation.self)

        connectivity.stop()
        connectivity.isOnline = false
        appMode.setMode(.synced)

        let food = try JSONPatch.decode(Food.self, from: [
            "id": Self.seedFoodId,
            "userId": "u1",
            "name": "Test Banana",
            "servingSize": 100,
            "servingUnit": "g",
            "calories": 90,
            "protein": 1,
            "carbs": 23,
            "fat": 0,
            "fiber": 3,
            "isFavorite": false,
        ])
        context.insert(LocalFood(food: food))

        let recipe = try JSONPatch.decode(Recipe.self, from: [
            "id": Self.seedRecipeId,
            "userId": "u1",
            "name": "Test Bowl",
            "totalServings": 2,
            "isFavorite": false,
        ])
        context.insert(LocalRecipe(recipe: recipe))

        let weight = try JSONPatch.decode(WeightEntry.self, from: [
            "id": Self.seedWeightId,
            "userId": "u1",
            "weightKg": 76.4,
            "entryDate": Self.seedDate,
        ])
        context.insert(LocalWeightEntry(entry: weight))

        let sleep = try JSONPatch.decode(SleepEntry.self, from: [
            "id": Self.seedSleepId,
            "userId": "u1",
            "entryDate": Self.seedDate,
            "durationMinutes": 430,
            "quality": 7,
        ])
        context.insert(LocalSleepEntry(entry: sleep))

        try context.save()
    }

    /// The number of rows currently queued for upload, optionally narrowed to
    /// one operation `type` (e.g. `"create_entry"`) — what an intent test
    /// checks to confirm a log reached the sync layer.
    func pendingSyncOperationCount(type: String?) -> Int {
        let rows = syncManager.queuedRows()
        guard let type else { return rows.count }
        return rows.filter { $0.type == type }.count
    }
}

#endif
