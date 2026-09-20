import Foundation
import SwiftUI

/// The card shown under Siri's spoken answer for the last seven days: the daily
/// averages over the days that were actually logged, plus how many that was.
struct WeeklyStatsSnippetView: View {
    let stats: WeeklyNutritionStats

    private var locale: Locale {
        DaySummaryFormat.locale
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.intentWeekAverage)
                .font(.headline)

            HStack(spacing: 16) {
                macro(label: "Cal", value: stats.averageCalories, color: MacroColors.calories)
                macro(label: "P", value: stats.averageProtein, color: MacroColors.protein)
                macro(label: "C", value: stats.averageCarbs, color: MacroColors.carbs)
                macro(label: "F", value: stats.averageFat, color: MacroColors.fat)
            }

            Text("\(L10n.intentWeekDaysLogged): \(stats.daysLogged)/7")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
    }

    private func macro(label: String, value: Double, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(DaySummaryFormat.number(value, locale: locale))
                .font(.subheadline)
                .fontWeight(.semibold)
                .monospacedDigit()
                .foregroundStyle(color)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
