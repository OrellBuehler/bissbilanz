import SwiftUI
import WidgetKit

/// Latest body weight with a one-tap path to logging today's weight (iOS
/// counterpart of the Android quick weight widget).
struct QuickWeightWidget: Widget {
    var body: some WidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.load()?.localeCode ?? "en")
        return StaticConfiguration(kind: "QuickWeightWidget", provider: SnapshotProvider()) { entry in
            QuickWeightWidgetView(entry: entry)
        }
        .configurationDisplayName(strings.weight)
        .description(
            strings.localeCode == "de"
                ? "Gewicht heute anzeigen und erfassen."
                : "See today's weight and log it."
        )
        .supportedFamilies([.systemSmall])
    }
}

struct QuickWeightWidgetView: View {
    let entry: SnapshotTimelineEntry

    private var snapshot: WidgetSnapshot {
        entry.snapshot
    }

    private var strings: WidgetStrings {
        snapshot.strings
    }

    private var isToday: Bool {
        snapshot.latestWeightDate == snapshot.date
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "scalemass")
                .font(.title3)
                .foregroundStyle(.secondary)

            Spacer(minLength: 0)

            if let weight = snapshot.latestWeightKg {
                Text(strings.weightKg(weight))
                    .font(.system(.title3, design: .rounded))
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                Text(isToday ? strings.today : strings.tapToLog)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Text(strings.weight)
                    .font(.system(.title3, design: .rounded))
                    .fontWeight(.semibold)
                Text(strings.tapToLog)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(WidgetDeepLink.weight)
        .bissbilanzWidgetBackground()
    }
}
