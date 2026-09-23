import AppIntents
import SwiftUI
import WidgetKit

/// The metric a `CaloriesWidget`/`ProteinWidget` instance tracks, chosen via
/// "Edit Widget". Both widget kinds share this one configuration surface
/// instead of five near-identical widgets — which `kind` string (and so
/// which existing home screen placements pick it up) and which metric is the
/// default stay decided per `Widget`/configuration-intent pair, see
/// `CaloriesWidget`/`ProteinWidget`.
enum MacroKindAppEnum: String, AppEnum, CaseIterable {
    case calories
    case protein
    case carbs
    case fat
    case fiber

    /// App Intents metadata is extracted statically, so these stay English
    /// literals (see `MealTypeAppEnum`); the widget face itself renders in
    /// the user's language via `WidgetStrings`.
    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Metric")
    }

    static var caseDisplayRepresentations: [MacroKindAppEnum: DisplayRepresentation] {
        [
            .calories: DisplayRepresentation(title: "Calories"),
            .protein: DisplayRepresentation(title: "Protein"),
            .carbs: DisplayRepresentation(title: "Carbs"),
            .fat: DisplayRepresentation(title: "Fat"),
            .fiber: DisplayRepresentation(title: "Fiber"),
        ]
    }

    /// Matches the app-wide macro color coding (calories blue, protein red,
    /// carbs orange, fat yellow, fiber green).
    var color: Color {
        switch self {
        case .calories: MacroColors.calories
        case .protein: MacroColors.protein
        case .carbs: MacroColors.carbs
        case .fat: MacroColors.fat
        case .fiber: MacroColors.fiber
        }
    }

    /// "kcal" for calories, "g" for every macro — matches the
    /// `accessoryCircular` gauge's unit label on the existing widgets.
    var unit: String {
        self == .calories ? "kcal" : "g"
    }

    func value(in snapshot: WidgetSnapshot) -> Double {
        switch self {
        case .calories: snapshot.calories
        case .protein: snapshot.protein
        case .carbs: snapshot.carbs
        case .fat: snapshot.fat
        case .fiber: snapshot.fiber
        }
    }

    func goal(in snapshot: WidgetSnapshot) -> Double {
        switch self {
        case .calories: snapshot.calorieGoal
        case .protein: snapshot.proteinGoal
        case .carbs: snapshot.carbGoal
        case .fat: snapshot.fatGoal
        case .fiber: snapshot.fiberGoal
        }
    }

    /// The `small` ring's caption ("kcal today" / "g protein today" / ...).
    func valueLabel(_ strings: WidgetStrings) -> String {
        switch self {
        case .calories: strings.kcalToday
        case .protein: strings.gProtein
        case .carbs: strings.gCarbsToday
        case .fat: strings.gFatToday
        case .fiber: strings.gFiberToday
        }
    }
}

/// Common shape of `CaloriesWidgetConfigurationIntent`/`ProteinWidgetConfigurationIntent`:
/// each is its own type (so each keeps its own default `macro`, applied to
/// widgets placed under its `kind` before this parameter existed — see
/// WWDC23 "Explore enhancements to App Intents"), sharing a timeline
/// provider and view via this protocol.
protocol MacroWidgetConfigurationIntent: WidgetConfigurationIntent {
    var macro: MacroKindAppEnum { get }
}

struct MacroSnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
    let macro: MacroKindAppEnum
}

/// Timeline provider shared by every macro widget kind — generic over the
/// configuration intent type so each kind keeps its own default while
/// sharing one implementation. Mirrors `SnapshotProvider`'s midnight
/// rollover for the non-configurable widgets.
struct MacroSnapshotProvider<Intent: MacroWidgetConfigurationIntent>: AppIntentTimelineProvider {
    func placeholder(in _: Context) -> MacroSnapshotEntry {
        MacroSnapshotEntry(date: Date(), snapshot: .placeholder, macro: Intent().macro)
    }

    func snapshot(for configuration: Intent, in _: Context) async -> MacroSnapshotEntry {
        MacroSnapshotEntry(date: Date(), snapshot: WidgetSnapshotStore.currentSnapshot(at: Date()), macro: configuration.macro)
    }

    func timeline(for configuration: Intent, in _: Context) async -> Timeline<MacroSnapshotEntry> {
        let now = Date()
        var entries = [
            MacroSnapshotEntry(date: now, snapshot: WidgetSnapshotStore.currentSnapshot(at: now), macro: configuration.macro),
        ]
        // Roll the displayed day over at midnight even if no refresh runs.
        if let midnight = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 5),
            matchingPolicy: .nextTime
        ) {
            entries.append(MacroSnapshotEntry(
                date: midnight,
                snapshot: WidgetSnapshotStore.currentSnapshot(at: midnight),
                macro: configuration.macro
            ))
        }
        return Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60)))
    }
}

/// Single-macro view shared by `CaloriesWidget`/`ProteinWidget` — identical
/// to the previous per-metric views, parameterized on `entry.macro` instead
/// of hardcoding calories/protein.
struct MacroWidgetView: View {
    let entry: MacroSnapshotEntry

    @Environment(\.widgetFamily) private var family

    private var snapshot: WidgetSnapshot {
        entry.snapshot
    }

    private var macro: MacroKindAppEnum {
        entry.macro
    }

    private var strings: WidgetStrings {
        snapshot.strings
    }

    private var value: Double {
        macro.value(in: snapshot)
    }

    private var goal: Double {
        macro.goal(in: snapshot)
    }

    private var progress: Double {
        guard goal > 0 else { return 0 }
        return min(value / goal, 1.0)
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
            value: value,
            goal: goal,
            color: macro.color,
            valueLabel: macro.valueLabel(strings),
            strings: strings
        )
    }

    private var circular: some View {
        Gauge(value: progress) {
            Text(macro.unit)
        } currentValueLabel: {
            Text(strings.integer(value))
                .minimumScaleFactor(0.6)
        }
        .gaugeStyle(.accessoryCircular)
        .tint(macro.color)
    }

    private var inline: some View {
        Text("\(strings.integer(value)) / \(strings.integer(goal)) \(macro.unit)")
    }
}
