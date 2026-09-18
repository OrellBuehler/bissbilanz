import AppIntents
import Foundation
import SwiftUI

/// "Hey Siri, how many calories did I have in Bissbilanz?" Answers from the
/// local store without opening the app (`openAppWhenRun = false`), so it works
/// offline and in Local mode exactly like the log intents.
///
/// The day parameter is optional and defaults to today; the summary is re-read
/// from the store rather than taken off the passed entity, which may have been
/// resolved from a Spotlight result indexed before the last edit.
struct GetDailyStatusIntent: AppIntent {
    static var title: LocalizedStringResource {
        "Daily Status"
    }

    static var description: IntentDescription {
        IntentDescription("Get a day's calories and macros from your Bissbilanz diary.")
    }

    static var openAppWhenRun: Bool {
        false
    }

    @Parameter(title: "Day")
    var day: DaySummaryEntity?

    @Dependency
    private var nutritionReader: NutritionReader

    static var parameterSummary: some ParameterSummary {
        Summary("Get daily nutrition status") {
            \.$day
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<DaySummaryEntity> & ProvidesDialog & ShowsSnippetView {
        let summary = nutritionReader.daySummary(date: day?.dateString ?? DateFormatting.today)
        let dialog = DaySummaryDialog.status(for: summary)
        return .result(
            value: summary,
            dialog: "\(dialog)",
            view: DaySummarySnippetView(summary: summary)
        )
    }
}
