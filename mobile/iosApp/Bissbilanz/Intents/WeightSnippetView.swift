import Foundation
import SwiftUI

/// The card shown under Siri's spoken answer for a weight entry: the value, its
/// day and how it moved over the last week and month.
///
/// Self-contained on purpose: a snippet is rendered outside the app's view
/// hierarchy, so it reads nothing from the environment and pulls every value
/// off what it was handed. Tinted like the Weight screen (`.blue`) rather than
/// with a macro hue — weight is not a macro.
struct WeightSnippetView: View {
    let entry: WeightEntity
    let trend7: WeightTrendSummary
    let trend30: WeightTrendSummary

    private var locale: Locale {
        DaySummaryFormat.locale
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(DaySummaryFormat.longDate(entry.date, locale: locale))
                .font(.headline)

            Text(DaySummaryFormat.kilograms(entry.weightKg, locale: locale))
                .font(.largeTitle)
                .fontWeight(.semibold)
                .monospacedDigit()
                .foregroundStyle(.blue)

            HStack(spacing: 16) {
                change(trend: trend7)
                change(trend: trend30)
            }

            if let note = entry.note, !note.isEmpty {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }

    /// A window's delta, or a dash when the window holds fewer than two
    /// entries — a single weight is a value, not a movement.
    private func change(trend: WeightTrendSummary) -> some View {
        VStack(spacing: 2) {
            Text(trend.hasTrend ? signed(trend.deltaKg) : "—")
                .font(.subheadline)
                .fontWeight(.semibold)
                .monospacedDigit()
            Text(L10n.intentChangeOverDays(trend.days))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    /// A gain carries an explicit plus; the locale's own minus sign covers a
    /// loss.
    private func signed(_ value: Double) -> String {
        let text = DaySummaryFormat.kilograms(value, locale: locale)
        return value > 0 ? "+\(text)" : text
    }
}
