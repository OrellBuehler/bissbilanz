import AppIntents
import SwiftUI
import WidgetKit

/// Defaults to calories, so widgets already placed under the "CaloriesWidget"
/// kind keep rendering exactly as before this became configurable — the
/// system applies a configuration intent's default value to any widget that
/// predates the parameter (WWDC23 "Explore enhancements to App Intents").
struct CaloriesWidgetConfigurationIntent: MacroWidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Calories Widget" }

    static var description: IntentDescription {
        IntentDescription("Choose which metric this widget tracks.")
    }

    @Parameter(title: "Metric", default: .calories)
    var macro: MacroKindAppEnum

    init() {
        macro = .calories
    }

    init(macro: MacroKindAppEnum) {
        self.macro = macro
    }
}

/// Single-macro progress: small home screen ring plus lock screen circular
/// gauge and inline text. Configurable since iOS 17 — "Edit Widget" lets the
/// user swap which metric it tracks (see `MacroWidgetSupport.swift`); the
/// "CaloriesWidget" kind itself, and its calories default, are unchanged.
struct CaloriesWidget: Widget {
    var body: some WidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.currentLocaleCode())
        return AppIntentConfiguration(
            kind: "CaloriesWidget",
            intent: CaloriesWidgetConfigurationIntent.self,
            provider: MacroSnapshotProvider<CaloriesWidgetConfigurationIntent>()
        ) { entry in
            MacroWidgetView(entry: entry)
        }
        .configurationDisplayName(strings.calories)
        .description(strings.caloriesWidgetDescription)
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryInline])
    }
}
