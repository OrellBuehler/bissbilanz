import SwiftUI
import WidgetKit

/// Calories progress: small home screen ring plus lock screen circular gauge
/// and inline text.
struct CaloriesWidget: Widget {
    var body: some WidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.currentLocaleCode())
        return StaticConfiguration(kind: "CaloriesWidget", provider: SnapshotProvider()) { entry in
            CaloriesWidgetView(entry: entry)
        }
        .configurationDisplayName(strings.calories)
        .description(strings.caloriesWidgetDescription)
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryInline])
    }
}

struct CaloriesWidgetView: View {
    let entry: SnapshotTimelineEntry

    @Environment(\.widgetFamily) private var family

    private var snapshot: WidgetSnapshot {
        entry.snapshot
    }

    private var strings: WidgetStrings {
        snapshot.strings
    }

    private var progress: Double {
        guard snapshot.calorieGoal > 0 else { return 0 }
        return min(snapshot.calories / snapshot.calorieGoal, 1.0)
    }

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                circular
            case .accessoryInline:
                inline
            default:
                small
            }
        }
        .widgetURL(WidgetDeepLink.today)
        .bissbilanzWidgetBackground()
    }

    private var small: some View {
        WidgetRingGauge(
            value: snapshot.calories,
            goal: snapshot.calorieGoal,
            color: MacroColors.calories,
            valueLabel: strings.kcalToday,
            strings: strings
        )
    }

    private var circular: some View {
        Gauge(value: progress) {
            Text("kcal")
        } currentValueLabel: {
            Text(strings.integer(snapshot.calories))
                .minimumScaleFactor(0.6)
        }
        .gaugeStyle(.accessoryCircular)
        .tint(MacroColors.calories)
    }

    private var inline: some View {
        Text("\(strings.integer(snapshot.calories)) / \(strings.integer(snapshot.calorieGoal)) kcal")
    }
}
