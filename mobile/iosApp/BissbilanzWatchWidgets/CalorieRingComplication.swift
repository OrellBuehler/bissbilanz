import SwiftUI
import WidgetKit

/// Calorie-ring complication across the accessory families. Tapping it opens
/// the watch app's log screen via `widgetURL` (`Button(intent:)` / `onOpenURL`
/// are unreliable inside watch complications).
struct CalorieRingComplication: Widget {
    var body: some WidgetConfiguration {
        let strings = WatchStrings(localeCode: WatchStore.load()?.snapshot.localeCode ?? "en")
        return StaticConfiguration(kind: "CalorieRingComplication", provider: WatchComplicationProvider()) { entry in
            CalorieRingComplicationView(entry: entry)
                .widgetURL(URL(string: "bissbilanz://log"))
                .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName(strings.calories)
        .description(
            strings.localeCode == "de"
                ? "Heutige Kalorien im Vergleich zum Tagesziel."
                : "Today's calories against your daily goal."
        )
        .supportedFamilies([.accessoryCircular, .accessoryInline, .accessoryRectangular, .accessoryCorner])
    }
}

struct CalorieRingComplicationView: View {
    let entry: WatchComplicationEntry

    @Environment(\.widgetFamily) private var family

    private var snapshot: WidgetSnapshot {
        entry.snapshot
    }

    private var strings: WatchStrings {
        WatchStrings(localeCode: snapshot.localeCode)
    }

    private var progress: Double {
        guard snapshot.calorieGoal > 0 else { return 0 }
        return min(snapshot.calories / snapshot.calorieGoal, 1.0)
    }

    var body: some View {
        switch family {
        case .accessoryCircular:
            circular
        case .accessoryInline:
            inline
        case .accessoryRectangular:
            rectangular
        case .accessoryCorner:
            corner
        default:
            circular
        }
    }

    private var circular: some View {
        Gauge(value: progress) {
            Text(strings.kcal)
        } currentValueLabel: {
            Text(strings.integer(snapshot.calories))
                .minimumScaleFactor(0.5)
        }
        .gaugeStyle(.accessoryCircular)
        .tint(MacroColors.calories)
    }

    private var inline: some View {
        Text("\(strings.integer(snapshot.calories)) / \(strings.integer(snapshot.calorieGoal)) \(strings.kcal)")
    }

    private var rectangular: some View {
        HStack(spacing: 8) {
            WatchMacroRing(
                value: snapshot.calories,
                goal: snapshot.calorieGoal,
                color: MacroColors.calories,
                lineWidth: 4
            ) {
                Text(strings.integer(snapshot.calories))
                    .font(.system(size: 11, weight: .semibold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
            }
            .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 1) {
                Text(strings.calories)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text("\(strings.integer(snapshot.calories)) / \(strings.integer(snapshot.calorieGoal)) \(strings.kcal)")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .minimumScaleFactor(0.6)
                Text(
                    "P\(strings.integer(snapshot.protein)) · C\(strings.integer(snapshot.carbs)) · F\(strings.integer(snapshot.fat))"
                )
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
                .minimumScaleFactor(0.6)
            }
            Spacer(minLength: 0)
        }
    }

    private var corner: some View {
        Text(strings.integer(snapshot.calories))
            .widgetLabel {
                Gauge(value: progress) {
                    Text(strings.kcal)
                } currentValueLabel: {
                    Text(strings.integer(snapshot.calories))
                }
                .tint(MacroColors.calories)
            }
    }
}
