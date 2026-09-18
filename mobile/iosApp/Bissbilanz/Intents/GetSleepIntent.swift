import AppIntents
import Foundation
import SwiftUI

/// "Hey Siri, how did I sleep in Bissbilanz?" Answers from the local store
/// without opening the app (`openAppWhenRun = false`), so it works offline and
/// in Local mode exactly like the log intents.
///
/// The entry parameter is optional and defaults to the newest night — the app
/// dates a night by the morning it ended, so that is last night once it has
/// been logged. The row is re-read from the store rather than taken off the
/// passed entity, which may have been resolved from a Spotlight result indexed
/// before the last edit.
struct GetSleepIntent: AppIntent {
    static var title: LocalizedStringResource {
        "Sleep"
    }

    static var description: IntentDescription {
        IntentDescription("Get a night's sleep and your recent average from your Bissbilanz diary.")
    }

    static var openAppWhenRun: Bool {
        false
    }

    /// The window the average in the answer and on the card covers.
    private static let averageNights = 7

    @Parameter(title: "Night")
    var entry: SleepEntity?

    @Dependency
    private var bodyReader: BodyReader

    static var parameterSummary: some ParameterSummary {
        Summary("Get sleep") {
            \.$entry
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<SleepEntity> & ProvidesDialog & ShowsSnippetView {
        let requested = entry.flatMap { bodyReader.sleep(id: $0.id) }
        guard let resolved = requested ?? bodyReader.latestSleep() else {
            throw IntentDataUnavailableError(message: L10n.intentSleepNoData)
        }
        let stats = bodyReader.sleepStats(days: Self.averageNights)
        let dialog = BodyDialog.sleep(for: resolved, stats: stats, isLatest: requested == nil)
        return .result(
            value: resolved,
            dialog: "\(dialog)",
            view: SleepSnippetView(entry: resolved, stats: stats)
        )
    }
}
