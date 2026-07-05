import SwiftUI
import WidgetKit

/// Protein progress: small home screen ring plus lock screen circular gauge.
struct ProteinWidget: Widget {
    var body: some WidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.load()?.localeCode ?? "en")
        return StaticConfiguration(kind: "ProteinWidget", provider: SnapshotProvider()) { entry in
            ProteinWidgetView(entry: entry)
        }
        .configurationDisplayName(strings.protein)
        .description(strings.proteinWidgetDescription)
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}

struct ProteinWidgetView: View {
    let entry: SnapshotTimelineEntry

    @Environment(\.widgetFamily) private var family

    private var snapshot: WidgetSnapshot {
        entry.snapshot
    }

    private var strings: WidgetStrings {
        snapshot.strings
    }

    private var progress: Double {
        guard snapshot.proteinGoal > 0 else { return 0 }
        return min(snapshot.protein / snapshot.proteinGoal, 1.0)
    }

    var body: some View {
        Group {
            if family == .accessoryCircular {
                circular
            } else {
                small
            }
        }
        .widgetURL(WidgetDeepLink.today)
        .bissbilanzWidgetBackground()
    }

    private var small: some View {
        WidgetRingGauge(
            value: snapshot.protein,
            goal: snapshot.proteinGoal,
            color: MacroColors.protein,
            valueLabel: strings.gProtein,
            strings: strings
        )
    }

    private var circular: some View {
        Gauge(value: progress) {
            Text("g")
        } currentValueLabel: {
            Text(strings.integer(snapshot.protein))
                .minimumScaleFactor(0.6)
        }
        .gaugeStyle(.accessoryCircular)
        .tint(MacroColors.protein)
    }
}
