import SwiftUI
import WidgetKit

/// Medium widget: today's calories, protein, carbs and fat as four progress
/// rings — the widget counterpart of the dashboard's macro ring row (and of
/// the Android macro widget).
struct MacroSummaryWidget: Widget {
    var body: some WidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.currentLocaleCode())
        return StaticConfiguration(kind: "MacroSummaryWidget", provider: SnapshotProvider()) { entry in
            MacroSummaryWidgetView(entry: entry)
        }
        .configurationDisplayName(strings.macroSummaryWidgetDisplayName)
        .description(strings.macroSummaryWidgetDescription)
        .supportedFamilies([.systemMedium])
    }
}

struct MacroSummaryWidgetView: View {
    let entry: SnapshotTimelineEntry

    private var snapshot: WidgetSnapshot {
        entry.snapshot
    }

    private var strings: WidgetStrings {
        snapshot.strings
    }

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text(strings.today)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(.secondary)
                Spacer()
                if let formatted = strings.shortDate(fromIso: snapshot.date) {
                    Text(formatted)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }

            HStack(alignment: .top, spacing: 0) {
                ring(snapshot.calories, snapshot.calorieGoal, MacroColors.calories, strings.calories)
                ring(snapshot.protein, snapshot.proteinGoal, MacroColors.protein, strings.protein)
                ring(snapshot.carbs, snapshot.carbGoal, MacroColors.carbs, strings.carbs)
                ring(snapshot.fat, snapshot.fatGoal, MacroColors.fat, strings.fat)
            }
        }
        .widgetURL(WidgetDeepLink.today)
        .bissbilanzWidgetBackground()
    }

    private func ring(_ value: Double, _ goal: Double, _ color: Color, _ label: String) -> some View {
        WidgetMacroRing(value: value, goal: goal, color: color, label: label, strings: strings, size: 56, lineWidth: 6)
            .frame(maxWidth: .infinity)
    }
}
