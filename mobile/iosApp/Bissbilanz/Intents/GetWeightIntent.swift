import AppIntents
import Foundation
import SwiftUI

/// "Hey Siri, what's my weight in Bissbilanz?" Answers from the local store
/// without opening the app (`openAppWhenRun = false`), so it works offline and
/// in Local mode exactly like the log intents.
///
/// The entry parameter is optional and defaults to the newest weight; the row
/// is re-read from the store rather than taken off the passed entity, which may
/// have been resolved from a Spotlight result indexed before the last edit.
struct GetWeightIntent: AppIntent {
    static var title: LocalizedStringResource {
        "Weight"
    }

    static var description: IntentDescription {
        IntentDescription("Get your weight and its recent trend from your Bissbilanz diary.")
    }

    static var openAppWhenRun: Bool {
        false
    }

    /// The windows the answer and the card report on.
    private static let shortTrendDays = 7
    private static let longTrendDays = 30

    @Parameter(title: "Entry")
    var entry: WeightEntity?

    @Dependency
    private var bodyReader: BodyReader

    static var parameterSummary: some ParameterSummary {
        Summary("Get weight") {
            \.$entry
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<WeightEntity> & ProvidesDialog & ShowsSnippetView {
        let requested = entry.flatMap { bodyReader.weight(id: $0.id) }
        guard let resolved = requested ?? bodyReader.latestWeight() else {
            throw IntentDataUnavailableError(message: L10n.intentWeightNoData)
        }
        let shortTrend = bodyReader.weightTrend(days: Self.shortTrendDays)
        let longTrend = bodyReader.weightTrend(days: Self.longTrendDays)
        let dialog = BodyDialog.weight(for: resolved, trend: shortTrend, isLatest: requested == nil)
        return .result(
            value: resolved,
            dialog: "\(dialog)",
            view: WeightSnippetView(entry: resolved, trend7: shortTrend, trend30: longTrend)
        )
    }
}
