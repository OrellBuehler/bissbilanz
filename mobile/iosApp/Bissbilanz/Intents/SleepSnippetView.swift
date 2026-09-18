import Foundation
import SwiftUI

/// The card shown under Siri's spoken answer for a logged night: how long it
/// was, the clock times around it, the quality, and the window average.
///
/// Self-contained on purpose: a snippet is rendered outside the app's view
/// hierarchy, so it reads nothing from the environment and pulls every value
/// off what it was handed. Tinted like the Sleep screen (`.indigo`).
struct SleepSnippetView: View {
    let entry: SleepEntity
    let stats: SleepStats

    private var locale: Locale {
        DaySummaryFormat.locale
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(DaySummaryFormat.longDate(entry.date, locale: locale))
                .font(.headline)

            Text(DaySummaryFormat.duration(minutes: entry.durationMinutes, locale: locale))
                .font(.largeTitle)
                .fontWeight(.semibold)
                .monospacedDigit()
                .foregroundStyle(.indigo)

            HStack(spacing: 16) {
                if let bedtime = entry.bedtime {
                    metric(label: L10n.bedtime, value: DaySummaryFormat.time(bedtime, locale: locale))
                }
                if let wakeTime = entry.wakeTime {
                    metric(label: L10n.wakeTime, value: DaySummaryFormat.time(wakeTime, locale: locale))
                }
                if entry.quality > 0 {
                    metric(label: L10n.quality, value: qualityText)
                }
            }

            if stats.nights > 1 {
                Text("\(L10n.sevenDayAverage): "
                    + DaySummaryFormat.duration(minutes: stats.averageDurationMinutes, locale: locale))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }

    /// The app's 1–10 scale: whole for a manual entry, one decimal for an
    /// imported score.
    private var qualityText: String {
        let value = DaySummaryFormat.decimal(
            entry.quality,
            fractionDigits: entry.quality == entry.quality.rounded() ? 0 : 1,
            locale: locale
        )
        return "\(value)/10"
    }

    private func metric(label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.subheadline)
                .fontWeight(.semibold)
                .monospacedDigit()
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
