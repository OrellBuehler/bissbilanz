import ActivityKit
import AppIntents
import Foundation

/// "End fast" button on the fasting Live Activity (lock screen + expanded
/// Dynamic Island). As a `LiveActivityIntent` the system runs `perform()` in
/// the *app's* process (background-launching it if needed) — but the type
/// itself must compile into both the app and the widget extension so the
/// extension's `Button(intent:)` can reference it, which is why it lives in
/// `PhoneShared/` and stays free of app-only dependencies (same rule as
/// `QuickAddFoodIntent`).
struct EndFastIntent: LiveActivityIntent {
    static var title: LocalizedStringResource {
        "End Fast"
    }

    static var description: IntentDescription {
        IntentDescription("Ends the running fast and marks today as a fasting day.")
    }

    static var openAppWhenRun: Bool {
        false
    }

    init() {}

    @MainActor
    func perform() async throws -> some IntentResult {
        FastingWriter.endCurrentFast()
        for activity in Activity<FastingActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        return .result()
    }
}
