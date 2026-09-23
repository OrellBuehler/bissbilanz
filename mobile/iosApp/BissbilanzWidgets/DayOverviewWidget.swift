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
        .supportedFamilies(Self.supportedFamilies)
    }

    /// `.systemExtraLargePortrait` is new in iOS/iPadOS 27 (WWDC26 "WidgetKit
    /// foundations", session 277) — verified against its own Apple
    /// Developer Documentation reference page, which lists iOS/iPadOS/macOS
    /// 27.0 as its introduction (it previously existed on visionOS only,
    /// since visionOS 26). It's the same family iPad's Home Screen/Today View
    /// already offers as `.systemExtraLarge` turned portrait; the system
    /// itself only actually presents it in the widget gallery on device
    /// idioms that have room for it (iPad, as this app is Universal — see
    /// `INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad` in project.yml),
    /// exactly like the pre-existing `.systemExtraLarge` case, so listing it
    /// unconditionally here is safe even where it turns out not to apply.
    /// First declared by the Xcode 27 SDK, hence the compiler gate alongside
    /// the `@available` runtime check — see `Bissbilanz/Intents/SiriIOS27.swift`
    /// for the same pattern.
    private static var supportedFamilies: [WidgetFamily] {
        var families: [WidgetFamily] = [.systemLarge]
        #if compiler(>=6.4)
        if #available(iOS 27, *) {
            families.append(.systemExtraLargePortrait)
        }
        #endif
        return families
    }
}

struct DayOverviewWidgetView: View {
    let entry: SnapshotTimelineEntry

    @Environment(\.widgetFamily) private var family

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
        content
            .widgetURL(WidgetDeepLink.today)
            .bissbilanzWidgetBackground()
    }

    @ViewBuilder
    private var content: some View {
        #if compiler(>=6.4)
        if #available(iOS 27, *), family == .systemExtraLargePortrait {
            expandedLayout
        } else {
            standardLayout
        }
        #else
        standardLayout
        #endif
    }

    private var standardLayout: some View {
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

            mealRowsList

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

            logFoodLink
        }
    }

    /// Extra-large portrait has roughly twice the height of `.systemLarge`
    /// with no more width, so the totals become progress rings (goal context
    /// the plain value/label columns below don't carry) and the meal
    /// breakdown gets room to sit in its own section below them rather than
    /// being squeezed above a single totals row.
    private var expandedLayout: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text(strings.today)
                    .font(.title3)
                    .fontWeight(.semibold)
                Spacer()
                if let formatted = strings.shortDate(fromIso: snapshot.date) {
                    Text(formatted)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            WidgetMacroRing(
                value: snapshot.calories,
                goal: snapshot.calorieGoal,
                color: MacroColors.calories,
                label: strings.calories,
                strings: strings,
                size: 96,
                lineWidth: 9
            )
            .frame(maxWidth: .infinity)

            HStack(spacing: 0) {
                WidgetMacroRing(
                    value: snapshot.protein,
                    goal: snapshot.proteinGoal,
                    color: MacroColors.protein,
                    label: strings.protein,
                    strings: strings,
                    size: 60,
                    lineWidth: 6
                )
                .frame(maxWidth: .infinity)
                WidgetMacroRing(
                    value: snapshot.carbs,
                    goal: snapshot.carbGoal,
                    color: MacroColors.carbs,
                    label: strings.carbs,
                    strings: strings,
                    size: 60,
                    lineWidth: 6
                )
                .frame(maxWidth: .infinity)
                WidgetMacroRing(
                    value: snapshot.fat,
                    goal: snapshot.fatGoal,
                    color: MacroColors.fat,
                    label: strings.fat,
                    strings: strings,
                    size: 60,
                    lineWidth: 6
                )
                .frame(maxWidth: .infinity)
                WidgetMacroRing(
                    value: snapshot.fiber,
                    goal: snapshot.fiberGoal,
                    color: MacroColors.fiber,
                    label: strings.fiber,
                    strings: strings,
                    size: 60,
                    lineWidth: 6
                )
                .frame(maxWidth: .infinity)
            }

            Divider()

            mealRowsList

            Spacer(minLength: 0)

            logFoodLink
        }
    }

    private var mealRowsList: some View {
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
    }

    @ViewBuilder
    private var logFoodLink: some View {
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
}
