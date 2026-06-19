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
        .description(
            strings.localeCode == "de"
                ? "Heutiges Eiweiß im Vergleich zum Tagesziel."
                : "Today's protein against your daily goal."
        )
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}

struct ProteinWidgetView: View {
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
        guard snapshot.proteinGoal > 0 else { return 0 }
        return min(snapshot.protein / snapshot.proteinGoal, 1.0)
    }

    private var isOver: Bool {
        snapshot.proteinGoal > 0 && snapshot.protein > snapshot.proteinGoal
    }

    private var ringColor: Color {
        isOver ? .red : MacroColors.protein
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
        ZStack {
            Circle()
                .stroke(MacroColors.protein.opacity(colorScheme == .dark ? 0.2 : 0.12), lineWidth: 8)

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
                Text(strings.integer(snapshot.protein))
                    .font(.system(.title2, design: .rounded))
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(isOver ? .red : MacroColors.protein)
                Text(strings.gProtein)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(14)
        }
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
