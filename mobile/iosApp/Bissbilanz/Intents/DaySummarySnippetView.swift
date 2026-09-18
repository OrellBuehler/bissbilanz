import Foundation
import SwiftUI

/// The card shown under Siri's spoken answer for a single day.
///
/// Self-contained on purpose: a snippet is rendered outside the app's view
/// hierarchy, so it reads nothing from the environment and pulls every value
/// off the entity it was handed.
struct DaySummarySnippetView: View {
    let summary: DaySummaryEntity

    private var locale: Locale {
        DaySummaryFormat.locale
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(DaySummaryFormat.longDate(summary.date, locale: locale))
                .font(.headline)

            HStack(spacing: 16) {
                macro(label: "Cal", value: summary.calories, goal: summary.calorieGoal, color: MacroColors.calories)
                macro(label: "P", value: summary.protein, goal: summary.proteinGoal, color: MacroColors.protein)
                macro(label: "C", value: summary.carbs, goal: summary.carbGoal, color: MacroColors.carbs)
                macro(label: "F", value: summary.fat, goal: summary.fatGoal, color: MacroColors.fat)
            }

            if let remaining = summary.remainingCalories {
                let value = DaySummaryFormat.number(abs(remaining), locale: locale)
                Text(remaining >= 0 ? L10n.intentCaloriesLeft(value) : L10n.intentCaloriesOver(value))
                    .font(.caption)
                    .foregroundStyle(remaining >= 0 ? Color.secondary : MacroColors.protein)
            }

            if summary.isFastingDay {
                Label(L10n.fastingDay, systemImage: "moon.zzz")
                    .font(.caption)
                    .foregroundStyle(MacroColors.fasting)
            }
        }
        .padding()
    }

    private func macro(label: String, value: Double, goal: Double?, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(DaySummaryFormat.number(value, locale: locale))
                .font(.subheadline)
                .fontWeight(.semibold)
                .monospacedDigit()
                .foregroundStyle(color)
            if let goal {
                Text("/\(DaySummaryFormat.number(goal, locale: locale))")
                    .font(.system(size: 9))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
