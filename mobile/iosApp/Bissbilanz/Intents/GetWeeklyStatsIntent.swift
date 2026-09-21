import AppIntents
import Foundation
import SwiftUI

/// "Hey Siri, weekly summary in Bissbilanz." Averages the seven days ending on
/// the given day (today by default) over the days that actually have entries,
/// and returns the end day's summary as the value so the result can be chained
/// in Shortcuts.
struct GetWeeklyStatsIntent: AppIntent {
    static var title: LocalizedStringResource {
        "Weekly Summary"
    }

    static var description: IntentDescription {
        IntentDescription("Get your seven-day calorie and macro averages from Bissbilanz.")
    }

    static var openAppWhenRun: Bool {
        false
    }

    @Parameter(title: "Last Day")
    var day: DaySummaryEntity?

    @Dependency
    private var nutritionReader: NutritionReader

    static var parameterSummary: some ParameterSummary {
        Summary("Get weekly nutrition averages") {
            \.$day
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<DaySummaryEntity> & ProvidesDialog & ShowsSnippetView {
        let endDate = day?.dateString ?? DateFormatting.today
        let stats = nutritionReader.weeklyStats(endingOn: endDate)
        let dialog = DaySummaryDialog.week(stats)
        return .result(
            value: nutritionReader.daySummary(date: endDate),
            dialog: "\(dialog)",
            view: WeeklyStatsSnippetView(stats: stats)
        )
    }
}
