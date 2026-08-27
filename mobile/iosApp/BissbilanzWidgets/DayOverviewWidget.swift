import SwiftUI
import WidgetKit

/// Large widget: per-meal calorie breakdown, totals for all five macros and
/// a "Log food" shortcut into the app.
struct DayOverviewWidget: Widget {
    var body: some WidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.currentLocaleCode())
        return StaticConfiguration(kind: "DayOverviewWidget", provider: SnapshotProvider()) { entry in
            DayOverviewWidgetView(entry: entry)
        }
        .configurationDisplayName(strings.dayOverviewWidgetDisplayName)
        .description(strings.dayOverviewWidgetDescription)
        .supportedFamilies([.systemLarge])
    }
}

struct DayOverviewWidgetView: View {
    let entry: SnapshotTimelineEntry

    private var snapshot: WidgetSnapshot {
        entry.snapshot
    }

    private var strings: WidgetStrings {
        snapshot.strings
    }

    private static let standardMeals = ["breakfast", "lunch", "dinner", "snacks"]

    /// Standard meals always show (zero when unlogged); custom meal types
    /// with entries are appended.
    private var mealRows: [(key: String, calories: Double)] {
        let byType = Dictionary(snapshot.meals.map { ($0.mealType, $0.calories) }, uniquingKeysWith: +)
        let standard = Self.standardMeals.map { ($0, byType[$0] ?? 0) }
        let custom = byType.keys
            .filter { !Self.standardMeals.contains($0) }
            .sorted()
            .map { ($0, byType[$0] ?? 0) }
        return standard + custom
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(strings.today)
                    .font(.headline)
                Spacer()
                Text("\(strings.integer(snapshot.calories)) / \(strings.integer(snapshot.calorieGoal)) kcal")
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 8) {
                ForEach(mealRows, id: \.key) { meal in
                    HStack {
                        Text(strings.mealName(meal.key))
                            .font(.subheadline)
                            .foregroundStyle(meal.calories > 0 ? .primary : .secondary)
                        Spacer()
                        if meal.calories > 0 {
                            Text("\(strings.integer(meal.calories)) kcal")
                                .font(.subheadline)
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                        } else {
                            Text("–")
                                .font(.subheadline)
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
            }

            Divider()

            HStack(spacing: 0) {
                WidgetMacroValue(
                    value: snapshot.calories,
                    label: strings.calories,
                    color: MacroColors.calories,
                    strings: strings
                )
                WidgetMacroValue(
                    value: snapshot.protein,
                    label: strings.protein,
                    color: MacroColors.protein,
                    strings: strings
                )
                WidgetMacroValue(
                    value: snapshot.carbs,
                    label: strings.carbs,
                    color: MacroColors.carbs,
                    strings: strings
                )
                WidgetMacroValue(value: snapshot.fat, label: strings.fat, color: MacroColors.fat, strings: strings)
                WidgetMacroValue(
                    value: snapshot.fiber,
                    label: strings.fiber,
                    color: MacroColors.fiber,
                    strings: strings
                )
            }

            Spacer(minLength: 0)

            if let url = WidgetDeepLink.logFood {
                Link(destination: url) {
                    HStack(spacing: 6) {
                        Image(systemName: "plus.circle.fill")
                        Text(strings.logFood)
                            .fontWeight(.medium)
                    }
                    .font(.subheadline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(MacroColors.calories.opacity(0.12), in: Capsule())
                    .foregroundStyle(MacroColors.calories)
                }
            }
        }
        .widgetURL(WidgetDeepLink.today)
        .bissbilanzWidgetBackground()
    }
}
