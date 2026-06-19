import SwiftUI
import WidgetKit

/// Calories progress: small home screen ring plus lock screen circular gauge
/// and inline text.
struct CaloriesWidget: Widget {
    var body: some WidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.load()?.localeCode ?? "en")
        return StaticConfiguration(kind: "CaloriesWidget", provider: SnapshotProvider()) { entry in
            CaloriesWidgetView(entry: entry)
        }
        .configurationDisplayName(strings.calories)
        .description(
            strings.localeCode == "de"
                ? "Heutige Kalorien im Vergleich zum Tagesziel."
                : "Today's calories against your daily goal."
        )
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryInline])
    }
}

struct CaloriesWidgetView: View {
    let entry: SnapshotTimelineEntry

    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var colorScheme

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

    private var isOver: Bool {
        snapshot.calorieGoal > 0 && snapshot.calories > snapshot.calorieGoal
    }

    private var ringColor: Color {
        isOver ? .red : MacroColors.calories
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
        ZStack {
            Circle()
                .stroke(MacroColors.calories.opacity(colorScheme == .dark ? 0.2 : 0.12), lineWidth: 8)

            Circle()
                .trim(from: 0, to: progress)
                .stroke(
                    AngularGradient(
                        gradient: Gradient(colors: [ringColor.opacity(0.65), ringColor]),
                        center: .center,
                        startAngle: .degrees(0),
                        endAngle: .degrees(360)
                    ),
                    style: StrokeStyle(lineWidth: 8, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))

            VStack(spacing: 2) {
                Text(strings.integer(snapshot.calories))
                    .font(.system(.title2, design: .rounded))
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(isOver ? .red : MacroColors.calories)
                Text(strings.kcalToday)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(14)
        }
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
