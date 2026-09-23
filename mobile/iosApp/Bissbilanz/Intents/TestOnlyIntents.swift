import AppIntents
import Foundation

#if DEBUG

/// Test-only: reseeds the local store into a known state for
/// `BissbilanzIntentsUITests` (AppIntentsTesting). `isDiscoverable = false`
/// keeps it out of Shortcuts/Siri, and `#if DEBUG` keeps it out of release
/// builds entirely — it still resolves by name for
/// `IntentDefinitions(bundleIdentifier:)` either way, which is how a test
/// target with no `@testable import` of the app can call it. See
/// `IntentTestFixtures`.
struct ResetIntentTestFixturesIntent: AppIntent {
    static var title: LocalizedStringResource {
        "Reset Intent Test Fixtures"
    }

    static let isDiscoverable = false

    static var openAppWhenRun: Bool {
        false
    }

    @Dependency
    private var fixtures: IntentTestFixtures

    @MainActor
    func perform() async throws -> some IntentResult {
        try fixtures.reset()
        return .result()
    }
}

/// Test-only: the number of operations currently queued for upload, optionally
/// narrowed to one operation type (e.g. `"create_entry"`) — how
/// `BissbilanzIntentsUITests` confirms a log intent reached the sync layer
/// without linking against the app. See `IntentTestFixtures`.
struct PendingSyncOperationCountIntent: AppIntent {
    static var title: LocalizedStringResource {
        "Pending Sync Operation Count"
    }

    static let isDiscoverable = false

    static var openAppWhenRun: Bool {
        false
    }

    @Parameter(title: "Operation Type")
    var operationType: String?

    @Dependency
    private var fixtures: IntentTestFixtures

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<Int> {
        .result(value: fixtures.pendingSyncOperationCount(type: operationType))
    }
}

#endif
